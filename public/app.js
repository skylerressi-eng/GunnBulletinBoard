(function () {
  'use strict';

  // ============ CONFIG / API ============
  const TOKEN_KEY = 'gbb-token';
  const LAST_BOARD_KEY = 'gbb-last-board';

  const COLORS = ['#fff176', '#ff9aa2', '#a0e7a0', '#9ad0f5', '#d6b3ff', '#ffb870', '#f5f5f5'];

  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) headers.Authorization = 'Bearer ' + t;
    const res = await fetch('/api' + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || 'request_failed');
      err.status = res.status;
      throw err;
    }
    return data;
  }

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
  let currentUser   = null;
  let boards        = [];
  let currentBoardId = null;
  let notes         = [];

  // ============ UTIL ============
  function randInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
  function randomPosition() { return { x: randInt(12, 88), y: randInt(15, 85) }; }
  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' • ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function friendlyError(code) {
    const map = {
      bad_username: 'Username must be 2-24 chars: letters, numbers, underscore.',
      bad_password: 'Password must be at least 4 characters.',
      bad_display_name: 'Display name is required.',
      username_taken: 'That username is already taken.',
      invalid_credentials: 'Wrong username or password.',
      not_authenticated: 'Please log in again.',
      last_board: 'You need at least one board.',
      forbidden: 'You can only modify your own content.',
      bad_text: 'Note text is required (max 280 chars).',
      bad_name: 'Board name is required.'
    };
    return map[code] || ('Something went wrong (' + code + ').');
  }

  // ============ AUTH ============
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
    const displayName = document.getElementById('signup-display').value.trim();
    const password = document.getElementById('signup-pass').value;
    try {
      const { token, user } = await api('POST', '/signup', { username, displayName, password });
      localStorage.setItem(TOKEN_KEY, token);
      currentUser = user;
      await enterApp();
    } catch (err) {
      signupErr.textContent = friendlyError(err.message);
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const username = document.getElementById('login-user').value.trim().toLowerCase();
    const password = document.getElementById('login-pass').value;
    try {
      const { token, user } = await api('POST', '/login', { username, password });
      localStorage.setItem(TOKEN_KEY, token);
      currentUser = user;
      await enterApp();
    } catch (err) {
      loginErr.textContent = friendlyError(err.message);
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try { await api('POST', '/logout'); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });

  // ============ BOARDS ============
  async function loadBoards() {
    const data = await api('GET', '/boards');
    boards = data.boards;
    renderBoardList();
  }

  function renderBoardList() {
    boardListEl.innerHTML = '';
    boards.forEach(b => {
      const li = document.createElement('li');
      if (b.id === currentBoardId) li.classList.add('active');

      const name = document.createElement('div');
      name.className = 'board-name';
      name.textContent = b.name;

      const meta = document.createElement('div');
      meta.className = 'board-meta';
      const count = b.note_count || 0;
      meta.textContent = count + (count === 1 ? ' note' : ' notes') + ' • ' + b.theme;

      li.appendChild(name);
      li.appendChild(meta);
      li.addEventListener('click', () => switchBoard(b.id));
      boardListEl.appendChild(li);
    });
  }

  async function switchBoard(boardId) {
    const board = boards.find(b => b.id === boardId);
    if (!board) return;
    currentBoardId = boardId;
    localStorage.setItem(LAST_BOARD_KEY, boardId);
    boardNameEl.textContent = board.name;
    boardDescEl.textContent = board.description || '';
    boardEl.classList.remove('theme-cork', 'theme-chalk', 'theme-paper', 'theme-midnight');
    boardEl.classList.add('theme-' + (board.theme || 'cork'));
    renderBoardList();
    await loadNotes();
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

  newBoardForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const { board } = await api('POST', '/boards', {
        name: boardNameInp.value.trim(),
        description: boardDescInp.value.trim(),
        theme: boardThemeInp.value
      });
      modalBackdrop.classList.add('hidden');
      boards.push(board);
      await switchBoard(board.id);
    } catch (err) {
      alert(friendlyError(err.message));
    }
  });

  deleteBoardBtn.addEventListener('click', async () => {
    const board = boards.find(b => b.id === currentBoardId);
    if (!board) return;
    if (board.owner !== currentUser.username) {
      alert('Only the board owner can delete it.');
      return;
    }
    if (boards.length <= 1) {
      alert('You need at least one board.');
      return;
    }
    if (!confirm('Delete board "' + board.name + '" and all its notes? This cannot be undone.')) return;
    try {
      await api('DELETE', '/boards/' + encodeURIComponent(board.id));
      await loadBoards();
      const next = boards[0];
      if (next) await switchBoard(next.id);
    } catch (err) {
      alert(friendlyError(err.message));
    }
  });

  // ============ NOTES ============
  async function loadNotes() {
    const data = await api('GET', '/boards/' + encodeURIComponent(currentBoardId) + '/notes');
    notes = data.notes;
    renderNotes();
    // refresh sidebar counts
    const target = boards.find(b => b.id === currentBoardId);
    if (target) target.note_count = notes.length;
    renderBoardList();
  }

  function renderNotes(animateNewestId = null) {
    boardEl.querySelectorAll('.note').forEach(n => n.remove());
    counterEl.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');
    emptyMsg.style.display = notes.length === 0 ? '' : 'none';

    notes.forEach((n) => {
      const el = document.createElement('div');
      el.className = 'note';
      el.style.background = n.color;
      el.style.setProperty('--rot', n.rot + 'deg');
      el.style.setProperty('--x', n.x + '%');
      el.style.setProperty('--y', n.y + '%');
      el.style.zIndex = String(100 + n.z);
      el.dataset.id = n.id;

      const txt = document.createElement('div');
      txt.className = 'text';
      txt.textContent = n.text;

      const meta = document.createElement('div');
      meta.className = 'meta';
      const author = document.createElement('span');
      author.className = 'author';
      author.textContent = n.author_display;
      const date = document.createElement('span');
      date.className = 'date';
      date.textContent = formatDate(n.created_at);
      meta.appendChild(author);
      meta.appendChild(date);

      el.appendChild(txt);
      el.appendChild(meta);

      if (currentUser && n.author === currentUser.username) {
        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.textContent = '✕';
        del.title = 'Delete this note';
        del.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          if (!confirm('Delete this note?')) return;
          try {
            await api('DELETE', '/notes/' + encodeURIComponent(n.id));
            notes = notes.filter(x => x.id !== n.id);
            renderNotes();
          } catch (err) {
            alert(friendlyError(err.message));
          }
        });
        el.appendChild(del);
      }

      el.addEventListener('click', () => bringToFront(n.id));

      if (animateNewestId && n.id === animateNewestId) {
        el.classList.add('appearing');
        setTimeout(() => el.classList.remove('appearing'), 550);
      }
      boardEl.appendChild(el);
    });
  }

  async function bringToFront(noteId) {
    const target = notes.find(x => x.id === noteId);
    if (!target) return;
    try {
      const { z } = await api('PATCH', '/notes/' + encodeURIComponent(noteId) + '/front');
      target.z = z;
      const el = boardEl.querySelector('.note[data-id="' + CSS.escape(noteId) + '"]');
      if (el) el.style.zIndex = String(100 + z);
    } catch (err) {
      // ignore
    }
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
  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = noteText.value.trim();
    if (!text || !currentBoardId) return;
    const pos = randomPosition();
    const rot = randInt(-8, 8);
    try {
      const { note } = await api('POST', '/boards/' + encodeURIComponent(currentBoardId) + '/notes', {
        text, color: selectedColor, rot, x: pos.x, y: pos.y
      });
      notes.push(note);
      noteText.value = '';
      renderNotes(note.id);
      const target = boards.find(b => b.id === currentBoardId);
      if (target) target.note_count = notes.length;
      renderBoardList();
    } catch (err) {
      alert(friendlyError(err.message));
    }
  });

  // Shuffle locally re-randomizes positions in the UI only; positions
  // belong to whoever placed the note, so we don't persist a global shuffle.
  shuffleBtn.addEventListener('click', () => {
    notes.forEach(n => {
      const p = randomPosition();
      n.x = p.x;
      n.y = p.y;
      n.rot = randInt(-8, 8);
    });
    renderNotes();
  });

  // ============ BOOTSTRAP ============
  async function enterApp() {
    authScreen.classList.add('hidden');
    appShell.classList.remove('hidden');
    userDisplay.textContent = currentUser.displayName || currentUser.username;
    await loadBoards();
    if (boards.length === 0) {
      // shouldn't happen — server seeds one on signup — but guard anyway
      const { board } = await api('POST', '/boards', { name: 'General', description: '', theme: 'cork' });
      boards.push(board);
      renderBoardList();
    }
    const lastId = localStorage.getItem(LAST_BOARD_KEY);
    const start = boards.find(b => b.id === lastId) || boards[0];
    await switchBoard(start.id);
  }

  async function autoLogin() {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    try {
      const { user } = await api('GET', '/me');
      currentUser = user;
      await enterApp();
    } catch {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  autoLogin();
})();
