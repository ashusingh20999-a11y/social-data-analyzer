const express = require('express');
const multer = require('multer');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

fs.mkdirSync('uploads', { recursive: true });

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));

app.post('/api/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File not selected' });

  const platform = req.body.platform || 'Unknown';

  try {
    const content = fs.readFileSync(req.file.path, 'utf8');
    const data = JSON.parse(content);

    const items = Array.isArray(data) ? data : Array.isArray(data.messages) ? data.messages : [];
    const insert = db.prepare(`
      INSERT INTO messages (platform, chat_name, sender, message, message_date)
      VALUES (?, ?, ?, ?, ?)
    `);

    let imported = 0;
    const transaction = db.transaction(rows => {
      for (const item of rows) {
        insert.run(
          platform,
          item.chat_name || item.chat || item.title || '',
          item.sender || item.from || item.author || '',
          typeof item.message === 'string' ? item.message : JSON.stringify(item.message || ''),
          item.date || item.timestamp || ''
        );
        imported++;
      }
    });

    transaction(items);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, imported });
  } catch (error) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(400).json({ error: 'Unsupported or invalid JSON export' });
  }
});

app.get('/api/messages', (req, res) => {
  const search = req.query.search || '';
  const platform = req.query.platform || '';
  let sql = 'SELECT * FROM messages WHERE 1=1';
  const params = [];

  if (platform) {
    sql += ' AND platform = ?';
    params.push(platform);
  }

  if (search) {
    sql += ' AND (sender LIKE ? OR message LIKE ? OR chat_name LIKE ?)';
    const value = `%${search}%`;
    params.push(value, value, value);
  }

  sql += ' ORDER BY id DESC LIMIT 500';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS count FROM messages').get().count;
  const telegram = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE platform = 'Telegram'").get().count;
  const instagram = db.prepare("SELECT COUNT(*) AS count FROM messages WHERE platform = 'Instagram'").get().count;
  res.json({ total, telegram, instagram });
});

app.listen(PORT, () => console.log(`Social Data Analyzer running on port ${PORT}`));
