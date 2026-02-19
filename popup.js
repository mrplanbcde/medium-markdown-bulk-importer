const STORAGE_KEY = 'medium_md_queue_articles_v1';

const fileInput = document.getElementById('mdFiles');
const articleList = document.getElementById('articleList');
const copyBtn = document.getElementById('copyBtn');
const removeBtn = document.getElementById('removeBtn');
const clearBtn = document.getElementById('clearBtn');
const statusEl = document.getElementById('status');
const metaEl = document.getElementById('meta');

let articles = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#b42318' : '#333';
}

function extractTitle(markdown, fallbackName = 'Untitled') {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const h1 = trimmed.match(/^#\s+(.+)$/);
    if (h1) return h1[1].trim();

    return trimmed.replace(/^#{1,6}\s+/, '').trim();
  }
  return fallbackName;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseInline(text) {
  let out = escapeHtml(text);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/_([^_]+)_/g, '<em>$1</em>');
  return out;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let inCode = false;

  for (const rawLine of lines) {
    const line = rawLine || '';
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      html.push(inCode ? '</code></pre>' : '<pre><code>');
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!trimmed) {
      html.push('<p><br></p>');
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      html.push(`<h${level}>${parseInline(heading[2])}</h${level}>`);
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      html.push(`<ul><li>${parseInline(ul[1])}</li></ul>`);
      continue;
    }

    const ol = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ol) {
      html.push(`<ol><li>${parseInline(ol[1])}</li></ol>`);
      continue;
    }

    html.push(`<p>${parseInline(trimmed)}</p>`);
  }

  if (inCode) {
    html.push('</code></pre>');
  }

  return html.join('');
}

async function writeRichClipboard(markdown) {
  const plainText = String(markdown || '');
  const html = markdownToHtml(plainText);

  if (window.ClipboardItem && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' })
    });
    await navigator.clipboard.write([item]);
    return;
  }

  await navigator.clipboard.writeText(plainText);
}

function getSelectedIndex() {
  const value = articleList.value;
  if (!value) return -1;
  return articles.findIndex((a) => a.id === value);
}

function updateMeta() {
  const idx = getSelectedIndex();
  if (idx === -1) {
    metaEl.textContent = `${articles.length} article${articles.length === 1 ? '' : 's'} loaded`;
    return;
  }

  const a = articles[idx];
  const bytes = new Blob([a.content || '']).size;
  metaEl.textContent = `${idx + 1}/${articles.length} • ${a.title} • ${bytes} bytes`;
}

function updateButtons() {
  const hasItems = articles.length > 0;
  const hasSelected = getSelectedIndex() !== -1;

  copyBtn.disabled = !hasSelected;
  removeBtn.disabled = !hasSelected;
  clearBtn.disabled = !hasItems;
}

function renderList(selectId = null) {
  articleList.innerHTML = '';

  for (const article of articles) {
    const opt = document.createElement('option');
    opt.value = article.id;
    opt.textContent = article.title || article.name || 'Untitled';
    articleList.appendChild(opt);
  }

  if (selectId) {
    articleList.value = selectId;
  } else if (articles.length) {
    articleList.selectedIndex = 0;
  }

  updateMeta();
  updateButtons();
}

async function saveQueue() {
  await chrome.storage.local.set({ [STORAGE_KEY]: articles });
}

async function loadQueue() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  const loaded = Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  articles = loaded.filter((a) => a && typeof a.content === 'string');
  renderList();
}

function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

async function addFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;

  setStatus(`Loading ${files.length} file${files.length === 1 ? '' : 's'}...`);

  let added = 0;
  let lastId = null;

  for (const file of files) {
    if (!/\.md$/i.test(file.name) && file.type !== 'text/markdown' && file.type !== 'text/plain') {
      continue;
    }

    const content = await readFileText(file);
    const title = extractTitle(content, file.name.replace(/\.md$/i, ''));

    const existingIndex = articles.findIndex((a) => a.name === file.name);
    const payload = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      title,
      content,
      addedAt: new Date().toISOString()
    };

    if (existingIndex !== -1) {
      payload.id = articles[existingIndex].id;
      articles[existingIndex] = payload;
      lastId = payload.id;
    } else {
      articles.push(payload);
      lastId = payload.id;
      added += 1;
    }
  }

  await saveQueue();
  renderList(lastId);
  setStatus(added > 0 ? `Loaded ${added} new file${added === 1 ? '' : 's'}.` : 'Updated existing files.');

  fileInput.value = '';
}

async function copySelected() {
  const idx = getSelectedIndex();
  if (idx === -1) {
    setStatus('Select one article first.', true);
    return;
  }

  const article = articles[idx];
  await writeRichClipboard(article.content);
  setStatus(`Copied rich text: ${article.title}`);
}

async function removeSelected() {
  const idx = getSelectedIndex();
  if (idx === -1) return;

  const removed = articles[idx];
  articles.splice(idx, 1);
  await saveQueue();
  renderList();
  setStatus(`Removed: ${removed.title}`);
}

async function clearAll() {
  articles = [];
  await saveQueue();
  renderList();
  setStatus('Cleared all loaded files.');
}

fileInput.addEventListener('change', async () => {
  try {
    await addFiles(fileInput.files);
  } catch (error) {
    setStatus(error.message || 'Failed to load files.', true);
  }
});

articleList.addEventListener('change', () => {
  updateMeta();
  updateButtons();
});

copyBtn.addEventListener('click', async () => {
  try {
    await copySelected();
  } catch (error) {
    setStatus(error.message || 'Clipboard copy failed.', true);
  }
});

removeBtn.addEventListener('click', async () => {
  try {
    await removeSelected();
  } catch (error) {
    setStatus(error.message || 'Could not remove item.', true);
  }
});

clearBtn.addEventListener('click', async () => {
  try {
    await clearAll();
  } catch (error) {
    setStatus(error.message || 'Could not clear list.', true);
  }
});

(async () => {
  try {
    await loadQueue();
    setStatus('Ready. Choose Markdown files to build your queue.');
  } catch (error) {
    setStatus(error.message || 'Failed to load saved queue.', true);
  }
})();
