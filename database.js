const Database = require('better-sqlite3');

const db = new Database('social_data.db');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT NOT NULL,
  chat_name TEXT DEFAULT '',
  sender TEXT DEFAULT '',
  message TEXT DEFAULT '',
  message_date TEXT DEFAULT '',
  imported_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

module.exports = db;
