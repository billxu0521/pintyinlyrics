'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let currentData = null;
let isEditMode  = false;
let currentMode = 'input';

// ─── Pinyin helpers ──────────────────────────────────────────────────────────

function getPinyinFn() {
  return window.pinyinPro && window.pinyinPro.pinyin;
}

function isChineseChar(ch) {
  const cp = ch.codePointAt(0);
  return (
    (cp >= 0x4e00 && cp <= 0x9fff)   ||
    (cp >= 0x3400 && cp <= 0x4dbf)   ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0xf900 && cp <= 0xfaff)
  );
}

function processLine(line) {
  const pinyinFn = getPinyinFn();
  const chars = [...line];
  if (!chars.length) return [];

  let pinyinArr = [];
  if (pinyinFn) {
    try {
      pinyinArr = pinyinFn(line, { toneType: 'symbol', type: 'array' }) || [];
    } catch (_) { /* ignore */ }
  }

  return chars.map((ch, i) => {
    if (!isChineseChar(ch)) return { char: ch, pinyin: null };

    let py = '';
    if (pinyinArr.length === chars.length && pinyinArr[i]) {
      py = pinyinArr[i];
    } else if (pinyinFn) {
      try { py = pinyinFn(ch, { toneType: 'symbol' }) || ''; } catch (_) { py = ''; }
    }
    return { char: ch, pinyin: py };
  });
}

// ─── Mode switching ───────────────────────────────────────────────────────────

function setMode(mode) {
  // Update tab styles
  document.querySelectorAll('.tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );

  // Show/hide screens
  document.getElementById('screen-input').classList.toggle('hidden', mode !== 'input');
  document.getElementById('screen-preview').classList.toggle('hidden', mode === 'input');

  // Sync edit mode state
  const wantEdit = (mode === 'edit');
  if (wantEdit !== isEditMode) toggleEditMode();

  // Edit hint bar
  document.getElementById('edit-hint').classList.toggle('hidden', mode !== 'edit');

  currentMode = mode;
}

// ─── Convert ─────────────────────────────────────────────────────────────────

function convert() {
  const text = document.getElementById('lyrics-input').value;
  if (!text.trim()) { alert('請先輸入歌詞'); return; }

  if (!getPinyinFn()) {
    alert('拼音庫尚未載入，請稍候再試（需要網路連線）');
    return;
  }

  const title = document.getElementById('song-title').value.trim();
  currentData = {
    title,
    lines: text.split('\n').map(line => (line.trim() === '' ? null : processLine(line))),
  };

  render(currentData);
  setActionsEnabled(true);
  setMode('view');
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render(data) {
  const preview = document.getElementById('preview');
  preview.innerHTML = '';
  preview.classList.remove('edit-mode');

  const content = document.createElement('div');
  content.className = 'lyrics-content';

  if (data.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'song-title';
    titleEl.textContent = data.title;
    content.appendChild(titleEl);
  }

  data.lines.forEach((line, lineIdx) => {
    if (line === null) {
      content.appendChild(document.createElement('br'));
      return;
    }

    const lineEl = document.createElement('div');
    lineEl.className = 'lyric-line';

    line.forEach((token, tokenIdx) => {
      if (token.pinyin !== null) {
        const ruby = document.createElement('ruby');
        ruby.appendChild(document.createTextNode(token.char));

        const rt = document.createElement('rt');
        rt.textContent = token.pinyin;
        rt.dataset.lineIdx  = lineIdx;
        rt.dataset.tokenIdx = tokenIdx;

        rt.addEventListener('input', () => {
          currentData.lines[lineIdx][tokenIdx].pinyin = rt.textContent.trim() || '';
        });
        rt.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); rt.blur(); }
        });

        ruby.appendChild(rt);
        lineEl.appendChild(ruby);
      } else {
        lineEl.appendChild(document.createTextNode(token.char));
      }
    });

    content.appendChild(lineEl);
  });

  preview.appendChild(content);
}

// ─── Edit mode toggle ─────────────────────────────────────────────────────────

function toggleEditMode() {
  isEditMode = !isEditMode;
  const preview = document.getElementById('preview');
  preview.classList.toggle('edit-mode', isEditMode);
  preview.querySelectorAll('rt').forEach(rt => {
    rt.contentEditable = isEditMode ? 'true' : 'false';
  });
}

// ─── Live title sync ─────────────────────────────────────────────────────────

function syncTitle() {
  if (!currentData) return;
  const newTitle = document.getElementById('song-title').value.trim();
  currentData.title = newTitle;
  const existing = document.querySelector('.song-title');
  if (newTitle) {
    if (existing) { existing.textContent = newTitle; }
    else { render(currentData); }
  } else {
    if (existing) { render(currentData); }
  }
}

// ─── Download JSON ───────────────────────────────────────────────────────────

function downloadJSON() {
  if (!currentData) return;
  const filename = (currentData.title || 'lyrics') + '-pinyin.json';
  const blob = new Blob([JSON.stringify(currentData, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Upload JSON ─────────────────────────────────────────────────────────────

function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !Array.isArray(data.lines)) throw new Error('格式不符');

      currentData = data;
      document.getElementById('song-title').value = data.title || '';
      render(data);
      setActionsEnabled(true);
      setMode('view');
    } catch (_) {
      alert('無法讀取檔案，請確認格式正確（需包含 lines 陣列）');
    }
  };
  reader.readAsText(file, 'utf-8');
  event.target.value = '';
}

// ─── Print ───────────────────────────────────────────────────────────────────

function printPreview() {
  const original = document.title;
  if (currentData && currentData.title) document.title = currentData.title;
  window.print();
  document.title = original;
}

// ─── UI helpers ──────────────────────────────────────────────────────────────

function setActionsEnabled(enabled) {
  ['view', 'edit'].forEach(m => {
    document.querySelector(`.tab[data-mode="${m}"]`).disabled = !enabled;
  });
  document.getElementById('btn-download').disabled = !enabled;
  document.getElementById('btn-print').disabled    = !enabled;
}

// ─── Unload guard ────────────────────────────────────────────────────────────

window.addEventListener('beforeunload', e => {
  if (currentData) {
    e.preventDefault();
    e.returnValue = 'unsaved';
  }
});

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(tab =>
    tab.addEventListener('click', () => setMode(tab.dataset.mode))
  );

  document.getElementById('btn-convert').addEventListener('click', convert);
  document.getElementById('btn-download').addEventListener('click', downloadJSON);
  document.getElementById('input-upload').addEventListener('change', handleUpload);
  document.getElementById('btn-print').addEventListener('click', printPreview);
  document.getElementById('song-title').addEventListener('input', syncTitle);

  document.getElementById('lyrics-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      convert();
    }
  });
});
