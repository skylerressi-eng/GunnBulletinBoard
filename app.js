(function () {
  'use strict';

  const STORAGE_KEY = 'gunn-bb-notes-v1';
  const NAME_KEY = 'gunn-bb-last-name';

  const COLORS = [
    '#fff176', // yellow
    '#ff9aa2', // pink
    '#a0e7a0', // green
    '#9ad0f5', // blue
    '#d6b3ff', // purple
    '#ffb870', // orange
    '#f5f5f5'  // white
  ];

  const form        = document.getElementById('note-form');
  const textEl      = document.getElementById('note-text');
  const nameEl      = document.getElementById('note-name');
  const pickerEl    = document.getElementById('color-picker');
  const stackEl     = document.getElementById('stack');
  const emptyMsg    = document.getElementById('empty-msg');
  const viewBtn     = document.getElementById('view-toggle');
  const board       = document.getElementById('board');
  const counterEl   = document.getElementById('counter');
  const hintEl      = document.getElementById('hint');

  let selectedColor = COLORS[0];
  let notes = loadNotes();
  let boardView = false;

  // Restore last name
  const savedName = localStorage.getItem(NAME_KEY);
  if (savedName) nameEl.value = savedName;

  // Build color picker
  COLORS.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'color-swatch' + (i === 0 ? ' active' : '');
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener('click', () => {
      selectedColor = c;
      pickerEl.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
      sw.classList.add('active');
    });
    pickerEl.appendChild(sw);
  });

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    }) + ' • ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }

  function makeNoteEl(note, index, total) {
    const el = document.createElement('div');
    el.className = 'note';
    el.style.background = note.color;
    el.style.setProperty('--rot', note.rot + 'deg');
    el.dataset.id = note.id;

    // Stack ordering: top of array = newest = on top
    el.style.zIndex = String(1000 - index);

    // slight cascade offset so you can see notes beneath
    const offsetX = (total - index - 1) * 1.2;
    const offsetY = (total - index - 1) * 1.2;
    el.style.marginLeft = offsetX + 'px';
    el.style.marginTop  = offsetY + 'px';

    // board view scattered positions
    if (note.bx == null || note.by == null) {
      note.bx = randInt(15, 85);
      note.by = randInt(15, 85);
    }
    el.style.setProperty('--bx', note.bx + '%');
    el.style.setProperty('--by', note.by + '%');

    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.textContent = note.text;

    const metaDiv = document.createElement('div');
    metaDiv.className = 'meta';

    const author = document.createElement('span');
    author.className = 'author';
    author.textContent = note.author;

    const date = document.createElement('span');
    date.className = 'date';
    date.textContent = formatDate(note.ts);

    metaDiv.appendChild(author);
    metaDiv.appendChild(date);
    el.appendChild(textDiv);
    el.appendChild(metaDiv);

    el.addEventListener('click', () => {
      if (boardView) return;
      // Only the top note (index 0) can be peeled
      if (notes[0] && notes[0].id === note.id) {
        peelTop();
      }
    });

    return el;
  }

  function render(animateNew = false) {
    stackEl.innerHTML = '';

    if (notes.length === 0) {
      stackEl.appendChild(emptyMsg);
      emptyMsg.style.display = '';
    } else {
      emptyMsg.style.display = 'none';
    }

    counterEl.textContent = notes.length + (notes.length === 1 ? ' note' : ' notes');

    notes.forEach((n, i) => {
      const el = makeNoteEl(n, i, notes.length);
      stackEl.appendChild(el);
      if (animateNew && i === 0) {
        el.classList.add('appearing');
        setTimeout(() => el.classList.remove('appearing'), 500);
      }
    });

    hintEl.style.display = (notes.length > 0 && !boardView) ? '' : 'none';
  }

  function peelTop() {
    if (notes.length === 0) return;
    const topEl = stackEl.querySelector('.note');
    if (!topEl) return;
    topEl.classList.add('peeling');

    setTimeout(() => {
      const peeled = notes.shift();
      // send to bottom of stack so older notes are revealed but nothing is lost
      notes.push(peeled);
      saveNotes();
      render(false);
    }, 650);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textEl.value.trim();
    const author = nameEl.value.trim();
    if (!text || !author) return;

    const newNote = {
      id: 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      text,
      author,
      color: selectedColor,
      rot: randInt(-8, 8),
      ts: Date.now(),
      bx: randInt(15, 85),
      by: randInt(15, 85)
    };

    notes.unshift(newNote);
    saveNotes();
    localStorage.setItem(NAME_KEY, author);
    textEl.value = '';
    render(true);
  });

  viewBtn.addEventListener('click', () => {
    boardView = !boardView;
    board.classList.toggle('board-view', boardView);
    viewBtn.textContent = boardView ? 'Stack view' : 'Board view';
    render(false);
  });

  render(false);
})();
