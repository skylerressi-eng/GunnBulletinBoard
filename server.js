const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'bulletin.db');

// ============ DB SETUP ============
const fs = require('fs');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  theme       TEXT NOT NULL DEFAULT 'cork',
  owner       TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id             TEXT PRIMARY KEY,
  board_id       TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  author         TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  author_display TEXT NOT NULL,
  color          TEXT NOT NULL,
  rot            INTEGER NOT NULL,
  x              INTEGER NOT NULL,
  y              INTEGER NOT NULL,
  z              INTEGER NOT NULL,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_board ON notes(board_id);
`);

// Seed a default shared board if none exist
const boardCount = db.prepare('SELECT COUNT(*) AS c FROM boards').get().c;
if (boardCount === 0) {
  // Owner placeholder: first user to sign up becomes owner of a created default
  // We'll create the General board lazily on first signup instead.
}

// ============ HELPERS ============
function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
}
function token() { return crypto.randomBytes(24).toString('hex'); }

function getUserFromToken(t) {
  if (!t) return null;
  const row = db.prepare(`
    SELECT u.username, u.display_name
    FROM sessions s JOIN users u ON u.username = s.username
    WHERE s.token = ?
  `).get(t);
  return row ? { username: row.username, displayName: row.display_name } : null;
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || '';
  const t = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = getUserFromToken(t);
  if (!user) return res.status(401).json({ error: 'not_authenticated' });
  req.user = user;
  next();
}

function ensureDefaultBoardFor(username) {
  const anyBoard = db.prepare('SELECT id FROM boards LIMIT 1').get();
  if (anyBoard) return;
  const id = uid('b');
  db.prepare(`
    INSERT INTO boards (id, name, description, theme, owner, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, 'General', 'The main board — start posting!', 'cork', username, Date.now());
}

// ============ APP ============
const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ----- Auth routes -----
app.post('/api/signup', async (req, res) => {
  const { username, displayName, password } = req.body || {};
  if (typeof username !== 'string' || !/^[a-z0-9_]{2,24}$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: 'bad_username' });
  }
  if (typeof displayName !== 'string' || displayName.trim().length === 0 || displayName.length > 40) {
    return res.status(400).json({ error: 'bad_display_name' });
  }
  if (typeof password !== 'string' || password.length < 4 || password.length > 200) {
    return res.status(400).json({ error: 'bad_password' });
  }
  const uname = username.toLowerCase();
  const exists = db.prepare('SELECT 1 FROM users WHERE username = ?').get(uname);
  if (exists) return res.status(409).json({ error: 'username_taken' });

  const hash = await bcrypt.hash(password, 10);
  db.prepare(`
    INSERT INTO users (username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, ?)
  `).run(uname, displayName.trim(), hash, Date.now());

  ensureDefaultBoardFor(uname);

  const t = token();
  db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)')
    .run(t, uname, Date.now());
  res.json({ token: t, user: { username: uname, displayName: displayName.trim() } });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'bad_input' });
  }
  const uname = username.toLowerCase();
  const u = db.prepare('SELECT username, display_name, password_hash FROM users WHERE username = ?').get(uname);
  if (!u) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const t = token();
  db.prepare('INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)')
    .run(t, uname, Date.now());
  res.json({ token: t, user: { username: u.username, displayName: u.display_name } });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  const auth = req.headers.authorization || '';
  const t = auth.slice(7);
  db.prepare('DELETE FROM sessions WHERE token = ?').run(t);
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ----- Boards -----
app.get('/api/boards', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT b.id, b.name, b.description, b.theme, b.owner, b.created_at,
           (SELECT COUNT(*) FROM notes n WHERE n.board_id = b.id) AS note_count
    FROM boards b
    ORDER BY b.created_at ASC
  `).all();
  res.json({ boards: rows });
});

app.post('/api/boards', authMiddleware, (req, res) => {
  const { name, description, theme } = req.body || {};
  if (typeof name !== 'string' || name.trim().length === 0 || name.length > 60) {
    return res.status(400).json({ error: 'bad_name' });
  }
  const validThemes = ['cork', 'chalk', 'paper', 'midnight'];
  const t = validThemes.includes(theme) ? theme : 'cork';
  const desc = typeof description === 'string' ? description.slice(0, 120) : '';
  const id = uid('b');
  db.prepare(`
    INSERT INTO boards (id, name, description, theme, owner, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), desc, t, req.user.username, Date.now());
  res.json({ board: { id, name: name.trim(), description: desc, theme: t, owner: req.user.username, created_at: Date.now(), note_count: 0 } });
});

app.delete('/api/boards/:id', authMiddleware, (req, res) => {
  const b = db.prepare('SELECT owner FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  if (b.owner !== req.user.username) return res.status(403).json({ error: 'forbidden' });
  const remaining = db.prepare('SELECT COUNT(*) AS c FROM boards').get().c;
  if (remaining <= 1) return res.status(400).json({ error: 'last_board' });
  db.prepare('DELETE FROM boards WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ----- Notes -----
app.get('/api/boards/:id/notes', authMiddleware, (req, res) => {
  const b = db.prepare('SELECT id FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  const rows = db.prepare(`
    SELECT id, board_id, text, author, author_display, color, rot, x, y, z, created_at
    FROM notes WHERE board_id = ? ORDER BY created_at ASC
  `).all(req.params.id);
  res.json({ notes: rows });
});

app.post('/api/boards/:id/notes', authMiddleware, (req, res) => {
  const b = db.prepare('SELECT id FROM boards WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });

  const { text, color, rot, x, y } = req.body || {};
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > 280) {
    return res.status(400).json({ error: 'bad_text' });
  }
  const safeColor = (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color)) ? color : '#fff176';
  const safeRot = clampInt(rot, -15, 15, 0);
  const safeX = clampInt(x, 0, 100, 50);
  const safeY = clampInt(y, 0, 100, 50);

  const maxZ = db.prepare('SELECT COALESCE(MAX(z), 0) AS m FROM notes WHERE board_id = ?').get(req.params.id).m;
  const id = uid('n');
  const now = Date.now();
  db.prepare(`
    INSERT INTO notes (id, board_id, text, author, author_display, color, rot, x, y, z, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, text.trim(), req.user.username, req.user.displayName, safeColor, safeRot, safeX, safeY, maxZ + 1, now);

  res.json({ note: {
    id, board_id: req.params.id, text: text.trim(),
    author: req.user.username, author_display: req.user.displayName,
    color: safeColor, rot: safeRot, x: safeX, y: safeY, z: maxZ + 1, created_at: now
  }});
});

app.patch('/api/notes/:id/front', authMiddleware, (req, res) => {
  const n = db.prepare('SELECT board_id FROM notes WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'not_found' });
  const maxZ = db.prepare('SELECT COALESCE(MAX(z), 0) AS m FROM notes WHERE board_id = ?').get(n.board_id).m;
  db.prepare('UPDATE notes SET z = ? WHERE id = ?').run(maxZ + 1, req.params.id);
  res.json({ z: maxZ + 1 });
});

app.delete('/api/notes/:id', authMiddleware, (req, res) => {
  const n = db.prepare('SELECT author FROM notes WHERE id = ?').get(req.params.id);
  if (!n) return res.status(404).json({ error: 'not_found' });
  if (n.author !== req.user.username) return res.status(403).json({ error: 'forbidden' });
  db.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function clampInt(v, lo, hi, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

app.listen(PORT, () => {
  console.log(`Gunn Bulletin Board running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
