# Gunn Bulletin Board

A sticky-note bulletin board with accounts, multiple boards, and persistent
storage. Backend is Node + Express + SQLite; frontend is vanilla HTML/CSS/JS.

## Run locally

```bash
npm install
npm start
```

Then open <http://localhost:3000>.

The SQLite database is created at `data/bulletin.db` on first run. Delete that
file to wipe everything and start fresh.

## Configuration

- `PORT` — port to listen on (default `3000`)
- `DB_PATH` — path to the SQLite file (default `data/bulletin.db`)
