(function () {
  'use strict';

  // ============ STORAGE KEYS ============
  const K_USERS    = 'gbb-users-v2';
  const K_SESSION  = 'gbb-session-v2';
  const K_BOARDS   = 'gbb-boards-v2';
  const K_NOTES    = (boardId) => 'gbb-notes-v2-' + boardId;
  const K_LAST     = 'gbb-last-board-v2';

  const COLORS = ['#fff176', '#ff9aa2', '#a0e7a0', '#9ad0f5', '#d6b3ff', '#ffb870', '#f5f5f5'];

  // ============ DOM ============
  const authScreen  = document.getElementById('auth-screen');
  const appShell    = document.getElementById('app');
  const loginForm   = document.getElementById('login-form');
  const signupForm  = document.getElementById('signup-form');
  const loginErr    = document.getElementById('login-error');
  const signupErr   = document.getElementById('signup-error');
  const userDisplay = document.getElementById('user-display');
  const logoutBtn   = document.getElementById('logout-btn');

  const boardListEl   = document.getElementById('board-list');
  const newBoardBtn   = document.getElementById('new-board-btn');
  const boardNameEl   = document.getElementById('current-board-name');
  const boardDescEl   = document.getElementById('current-board-desc');
  const counterEl     = document.getElementById('note-counter');
  const shuffleBtn    = document.getElementById('shuffle-btn');
  const deleteBoardBtn= document.getElementById('delete-board-btn');

  const noteForm    = document.getElementById('note-form');
  const noteText    = document.getElementById('note-text');
  const pickerEl    = document.getElementById('color-picker');
  const boardEl     = document.getElementById('board');
  const emptyMsg    = document.getElementById('empty-msg');

  const modalBackdrop = document.getElementById('modal-backdrop');
  const newBoardForm  = document.getElementById('new-board-form');
  const boardNameInp  = document.getElementById('board-name-input');
  const boardDescInp  = document.getElementById('board-desc-input');
  const boardThemeInp = document.getElementById('board-theme-input');
  const modalCancel   = document.getElementById('modal-cancel');

  // ============ STATE ============
  let selectedColor = COLORS[0];
  let currentUser   = null;     // { username, displayName }
  let currentBoardId = null;

  // ============ UTIL ============
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch { return fallback; }
  }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function uid(prefix) { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }

  async function hashPassword(pass, salt) {
    const data = new TextEncoder().encode(salt + ':' + pass);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' • ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  // ============ AUTH ============
  function getUsers() { return readJSON(K_USERS, {}); }
  function saveUsers(u) { writeJSON(K_USERS, u); }

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const which = tab.dataset.tab;
      loginForm.classList.toggle('hidden', which !== 'login');
      signupForm.classList.toggle('hidden', which !== 'signup');
      loginErr.textContent = '';
      signupErr.textContent = '';
    });
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupErr.textContent = '';
    const username = document.getElementById('signup-user').value.trim().toLowerCase();
    const display  = document.getElementById('signup-display').value.trim();
    const pass     = document.getElementById('signup-pass').value;

    if (!/^[a-z0-9_]{2,24}$/.test(username)) {
      signupErr.textContent = 'Username: 2-24 chars, letters/numbers/underscore only.';
      return;
    }
    const users = getUsers();
    if (users[username]) {
      signupErr.textContent = 'That username is taken.';
      return;
    }
    const salt = uid('s');
    const hash = await hashPassword(pass, salt);
    users[username] = { username, displayName: display, salt, hash, createdAt: Date.now() };
    saveUsers(users);
    setSession(username);
    enterApp();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const username = document.getElementById('login-user').value.trim().toLowerCase();
    const pass     = document.getElementById('login-pass').value;
    const users = getUsers();
    const u = users[username];
    if (!u) { loginErr.textContent = 'No such user.'; return; }
    const hash = await hashPassword(pass, u.salt);
    if (hash !== u.hash) { loginErr.textContent = 'Wrong password.'; return; }
    setSession(username);
    enterApp();
  });

  function setSession(username) { writeJSON(K_SESSION, { username }); }
  function clearSession() { localStorage.removeItem(K_SESSION); }

  function loadSession() {
    const s = readJSON(K_SESSION, null);
    if (!s || !s.username) return null;
    const users = getUsers();
    return users[s.username] || null;
  }

  logoutBtn.addEventListener('click', () => {
    clearSession();
    location.reload();
  });

  // ============ BOARDS ============
  function getBoards() { return readJSON(K_BOARDS, []); }
  function saveBoards(b) { writeJSON(K_BOARDS, b); }

  function ensureDefaultBoard() {
    const boards = getBoards();
    if (boards.length === 0) {
      const id = uid('b');
      boards.push({
        id,
        name: 'General',
        description: 'The main board — start posting!',
        theme: 'cork',
        ownerId: currentUser.username,
        createdAt: Date.now()
      });
      saveBoards(boards);
    }
  }

  function renderBoardList() {
    const boards = getBoards();
    boardListEl.innerHTML = '';
    boards.forEach(b => {
      const li = document.createElement('li');
      if (b.id === currentBoardId) li.classList.add('active');

      const name = document.createElement('div');
      name.className = 'board-name';
      name.textContent = b.name;

      const meta = document.createElement('div');
      meta.className = 'board-meta';
      const noteCount = readJSON(K_NOTES(b.id), []).length;
      meta.textContent = noteCount + (noteCount === 1 ? ' note' : ' notes') + ' • ' + b.theme;

      li.appendChild(name);
      li.appendChild(meta);
      li.addEventListener('click', () => switchBoard(b.id));
      boardListEl.appendChild(li);
    });
  }

  function switchBoard(boardId) {
    currentBoardId = boardId;
    localStorage.setItem(K_LAST, boardId);
    const board = getBoards().find(b => b.id === boardId);
    if (!board) return;
    boardNameEl.textContent = board.name;
    boardDescEl.textContent = board.description || '';

    // theme class
    boardEl.classList.remove('theme-cork', 'theme-chalk', 'theme-paper', 'theme-midnight');
    boardEl.classList.add('theme-' + (board.theme || 'cork'));

    renderBoardList();
    renderNotes();
  }

  newBoardBtn.addEventListener('click', () => {
    boardNameInp.value = '';
    boardDescInp.value = '';
    boardThemeInp.value = 'cork';
    modalBackdrop.classList.remove('hidden');
    setTimeout(() => boardNameInp.focus(), 50);
  });

  modalCancel.addEventListener('click', () => modalBackdrop.classList.add('hidden'));
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) modalBackdrop.classList.add('hidden');
  });

  newBoardForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const boards = getBoards();
    const id = uid('b');
    boards.push({
      id,
      name: boardNameInp.value.trim(),
      description: boardDescInp.value.trim(),
      theme: boardThemeInp.value,
      ownerId: currentUser.username,
      createdAt: Date.now()
    });
    saveBoards(boards);
    modalBackdrop.classList.add('hidden');
    switchBoard(id);
  });

  deleteBoardBtn.addEventListener('click', () => {
    const boards = getBoards();
    if (boards.length <= 1) {
      alert("You need at least one board. Create another before deleting this one.");
      return;
    }
    const board = boards.find(b => b.id === currentBoardId);
    if (!board) return;
    if (!confirm('Delete board "' + board.name + '" and all its notes? This cannot be undone.')) return;
    const remaining = boards.filter(b => b.id !== currentBoardId);
    saveBoards(remaining);
    localStorage.removeItem(K_NOTES(currentBoardId));
    switchBoard(remaining[0].id);
  });

  // ============ NOTES ============
  function getNotes() { return readJSON(K_NOTES(currentBoardId), []); }
  function saveNotes(n) { writeJSON(K_NOTES(currentBoardId), n); }

  // Spread positions across the visible board area, avoiding edges
  function randomPosition() {
    return { x: randInt(12, 88), y: randInt(15, 85) };
  }

  function renderNotes(animateNewestId = null) {
    const notes = getNotes();

    // remove existing note elements
    boardEl.querySelectorAll('.note').forEach(n => n.remove());

    counterEl.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
    emptyMsg.style.display = notes.length === 0 ? '' : 'none';

    // Render oldest to newest so newest paint on top (later DOM = higher in stack with same z-index)
    // But explicit z-index by createdAt order makes click-to-front cleaner.
    notes.forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'note';
      el.style.background = n.color;
      el.style.setProperty('--rot', n.rot + 'deg');
      el.style.setProperty('--x', n.x + '%');
      el.style.setProperty('--y', n.y + '%');
      el.style.zIndex = String(100 + (n.z || i));
      el.dataset.id = n.id;

      const txt = document.createElement('div');
      txt.className = 'text';
      txt.textContent = n.text;

      const meta = document.createElement('div');
      meta.className = 'meta';
      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = n.author;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = formatDate(n.ts);
      meta.appendChild(author);
      meta.appendChild(date);

      el.appendChild(txt);
      el.appendChild(meta);

      // delete button — only the note's author can delete
      if (currentUser && n.authorId === currentUser.username) {
        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.textContent = '✕';
        del.title = 'Delete this note';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          const all = getNotes().filter(x => x.id !== n.id);
          saveNotes(all);
          renderNotes();
          renderBoardList();
        });
        el.appendChild(del);
      }

      // click: bring to front
      el.addEventListener('click', () => bringToFront(n.id));

      if (animateNewestId && n.id === animateNewestId) {
        el.classList.add('appearing');
        setTimeout(() => el.classList.remove('appearing'), 550);
      }
      boardEl.appendChild(el);
    });
  }

  function bringToFront(noteId) {
    const notes = getNotes();
    const maxZ = notes.reduce((m, x) => Math.max(m, x.z || 0), 0);
    const target = notes.find(x => x.id === noteId);
    if (!target) return;
    target.z = maxZ + 1;
    saveNotes(notes);
    // just update z-index of the affected element rather than re-render
    const el = boardEl.querySelector('.note[data-id="' + CSS.escape(noteId) + '"]');
    if (el) el.style.zIndex = String(100 + target.z);
  }

  // ============ COLOR PICKER ============
  COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
    sw.style.background = c;
    sw.addEventListener('click', () => {
      selectedColor = c;
      pickerEl.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
      sw.classList.add('active');
    });
    pickerEl.appendChild(sw);
  });

  // ============ POST NOTE ============
  noteForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = noteText.value.trim();
    if (!text || !currentBoardId) return;

    const notes = getNotes();
    const maxZ = notes.reduce((m, x) => Math.max(m, x.z || 0), 0);
    const pos = randomPosition();
    const note = {
      id: uid('n'),
      text,
      author: currentUser.displayName || currentUser.username,
      authorId: currentUser.username,
      color: selectedColor,
      rot: randInt(-8, 8),
      ts: Date.now(),
      x: pos.x,
      y: pos.y,
      z: maxZ + 1
    };
    notes.push(note);
    saveNotes(notes);
    noteText.value = '';
    renderNotes(note.id);
    renderBoardList();
  });

  shuffleBtn.addEventListener('click', () => {
    const notes = getNotes();
    notes.forEach(n => {
      const p = randomPosition();
      n.x = p.x;
      n.y = p.y;
      n.rot = randInt(-8, 8);
    });
    saveNotes(notes);
    renderNotes();
  });

  // ============ BOOTSTRAP ============
  function enterApp() {
    currentUser = loadSession();
    if (!currentUser) return;
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    userDisplay.textContent = currentUser.displayName || currentUser.username;
    ensureDefaultBoard();
    const lastId = localStorage.getItem(K_LAST);
    const boards = getBoards();
    const start = boards.find(b => b.id === lastId) || boards[0];
    switchBoard(start.id);
  }

  // auto-enter if already logged in
  if (loadSession()) {
    enterApp();
  }
})();
