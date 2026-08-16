const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return []; }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function parseMultipart(body, contentType) {
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) return {};
  const boundary = '--' + (match[1] || match[2]);
  const raw = body.toString('utf8');
  const result = {};

  for (const part of raw.split(boundary).slice(1, -1)) {
    const cleaned = part.replace(/^\r?\n/, '').replace(/\r?\n--$/, '');
    const split = cleaned.indexOf('\r\n\r\n');
    if (split < 0) continue;
    const headers = cleaned.slice(0, split);
    const value = cleaned.slice(split + 4).replace(/\r\n$/, '');
    const nameMatch = headers.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    result[name] = value;
  }
  return result;
}

function safeFile(file) {
  const ext = path.extname(file).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
  return types[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/api/stats') {
    const data = readData();
    return send(res, 200, {
      total: data.length,
      telegram: data.filter(x => x.platform === 'Telegram').length,
      instagram: data.filter(x => x.platform === 'Instagram').length
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/messages') {
    const data = readData();
    const search = (url.searchParams.get('search') || '').toLowerCase();
    const platform = url.searchParams.get('platform') || '';
    const rows = data.filter(x => {
      const platformOk = !platform || x.platform === platform;
      const text = `${x.chat_name} ${x.sender} ${x.message}`.toLowerCase();
      return platformOk && (!search || text.includes(search));
    }).slice(-500).reverse();
    return send(res, 200, rows);
  }

  if (req.method === 'POST' && url.pathname === '/api/import') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const fields = parseMultipart(body, req.headers['content-type'] || '');
        const platform = fields.platform || 'Unknown';
        const content = fields.file || '';
        const parsed = JSON.parse(content);
        const items = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.messages) ? parsed.messages : []);
        const data = readData();
        for (const item of items) {
          data.push({
            platform,
            chat_name: item.chat_name || item.chat || item.title || '',
            sender: item.sender || item.from || item.author || '',
            message: typeof item.message === 'string' ? item.message : JSON.stringify(item.message || ''),
            message_date: item.date || item.timestamp || ''
          });
        }
        writeData(data);
        send(res, 200, { success: true, imported: items.length });
      } catch (e) {
        send(res, 400, { error: 'Unsupported or invalid JSON export' });
      }
    });
    return;
  }

  if (req.method === 'GET') {
    let requested = decodeURIComponent(url.pathname);
    if (requested === '/') requested = '/index.html';
    const file = path.join(PUBLIC, requested);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return send(res, 404, { error: 'Not found' });
    }
    return send(res, 200, fs.readFileSync(file), safeFile(file));
  }

  send(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => console.log(`Social Data Analyzer running on port ${PORT}`));
