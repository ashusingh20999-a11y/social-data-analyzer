const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'social_data.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

function save(rows) {
  fs.writeFileSync(file, JSON.stringify(rows, null, 2));
}

function addMessages(rows) {
  const data = load();
  const start = data.length ? Math.max(...data.map(x => x.id || 0)) + 1 : 1;
  rows.forEach((row, i) => data.push({ id: start + i, ...row, imported_at: new Date().toISOString() }));
  save(data);
  return rows.length;
}

function getMessages(search = '', platform = '') {
  const q = search.toLowerCase();
  return load().filter(row => {
    const platformOk = !platform || row.platform === platform;
    const text = `${row.sender || ''} ${row.message || ''} ${row.chat_name || ''}`.toLowerCase();
    return platformOk && (!q || text.includes(q));
  }).sort((a, b) => b.id - a.id).slice(0, 500);
}

function stats() {
  const data = load();
  return {
    total: data.length,
    telegram: data.filter(x => x.platform === 'Telegram').length,
    instagram: data.filter(x => x.platform === 'Instagram').length
  };
}

module.exports = { addMessages, getMessages, stats };
