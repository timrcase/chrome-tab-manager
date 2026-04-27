const pendingTags = [];

function googleFaviconUrl(pageUrl) {
  try {
    const { hostname } = new URL(pageUrl);
    return hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=16` : null;
  } catch { return null; }
}

function makeFavicon(favIconUrl, tabUrl, title) {
  const primary = favIconUrl || googleFaviconUrl(tabUrl);
  const secondary = favIconUrl ? googleFaviconUrl(tabUrl) : null;

  if (!primary) return makePlaceholder(title);

  const img = document.createElement('img');
  img.src = primary;
  img.className = 'sp-favicon';
  img.onerror = () => {
    if (secondary && img.src !== secondary) {
      img.src = secondary;
      img.onerror = () => img.replaceWith(makePlaceholder(title));
    } else {
      img.replaceWith(makePlaceholder(title));
    }
  };
  return img;
}

function makePlaceholder(title) {
  const el = document.createElement('div');
  el.className = 'sp-favicon-placeholder';
  el.textContent = (title || '?')[0].toUpperCase();
  return el;
}

function renderTags() {
  const area = document.getElementById('spTagArea');
  const input = document.getElementById('spTagInput');
  area.querySelectorAll('.sp-tag-chip').forEach(el => el.remove());
  pendingTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'sp-tag-chip';
    chip.textContent = tag;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'sp-tag-remove';
    removeBtn.title = 'Remove';
    removeBtn.textContent = '×';
    chip.appendChild(removeBtn);
    removeBtn.onclick = (e) => {
      e.stopPropagation();
      pendingTags.splice(i, 1);
      renderTags();
    };
    area.insertBefore(chip, input);
  });
  input.placeholder = pendingTags.length ? '' : 'add tags…';
}

function addTag() {
  const input = document.getElementById('spTagInput');
  const val = input.value.trim().toLowerCase();
  if (val && !pendingTags.includes(val)) {
    pendingTags.push(val);
    renderTags();
  }
  input.value = '';
}

async function save() {
  const saveBtn = document.getElementById('spSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const goCode = document.getElementById('spGoInput').value.trim().toLowerCase() || null;
    const res = await chrome.runtime.sendMessage({
      action: 'saveCurrentTab',
      tags: [...pendingTags],
      goCode,
    });

    if (res?.ok) {
      window.close();
      return;
    }

    showError(res?.reason === 'storage_full'
      ? 'Storage is full. Free up space in Options.'
      : 'Could not save this tab.');
  } catch {
    showError('Could not save this tab.');
  }

  saveBtn.disabled = false;
  saveBtn.textContent = 'Save';
}

function showError(msg) {
  const err = document.getElementById('spError');
  err.textContent = msg;
  err.style.display = 'block';
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const unsaveable = !tab?.url
    || tab.url.startsWith('chrome://')
    || tab.url.startsWith('chrome-extension://');

  // Always populate preview so the user knows which page triggered the state
  if (tab?.url) {
    document.getElementById('spFavicon').appendChild(makeFavicon(tab.favIconUrl, tab.url, tab.title));
    document.getElementById('spTitle').textContent = tab.title || tab.url;
    document.getElementById('spUrl').textContent = tab.url;
  }

  if (unsaveable) {
    document.getElementById('spUnsaveable').style.display = 'block';
    return;
  }

  document.getElementById('spForm').style.display = '';

  const tagInput = document.getElementById('spTagInput');

  document.getElementById('spTagArea').onclick = () => tagInput.focus();

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (tagInput.value.trim()) {
        e.preventDefault();
        addTag();
        // cursor stays in tag input; empty Tab moves to go-code naturally
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (tagInput.value.trim()) {
        addTag();
      } else {
        save();
      }
    } else if (e.key === 'Backspace' && tagInput.value === '') {
      pendingTags.pop();
      renderTags();
    }
  });

  // Comma commits the current tag and lets typing continue
  tagInput.addEventListener('input', () => {
    if (tagInput.value.includes(',')) {
      tagInput.value = tagInput.value.replace(',', '').trim();
      addTag();
    }
  });

  document.getElementById('spSaveBtn').onclick = save;

  // Open manager in new tab without closing or resetting the popup
  document.getElementById('spViewBtn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  };

  tagInput.focus();
}

init();
