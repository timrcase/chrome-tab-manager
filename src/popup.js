const pendingTags = [];

function makeFavicon(favIconUrl, title) {
  if (favIconUrl) {
    const img = document.createElement('img');
    img.src = favIconUrl;
    img.className = 'sp-favicon';
    img.onerror = () => img.replaceWith(makePlaceholder(title));
    return img;
  }
  return makePlaceholder(title);
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
  input.placeholder = pendingTags.length ? '' : 'Add tags…';
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

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const unsaveable = !tab?.url
    || tab.url.startsWith('chrome://')
    || tab.url.startsWith('chrome-extension://');

  if (unsaveable) {
    document.getElementById('spPreview').style.display = 'none';
    document.getElementById('spUnsaveable').style.display = 'block';
    return;
  }

  // Populate preview
  document.getElementById('spFavicon').appendChild(makeFavicon(tab.favIconUrl, tab.title));
  document.getElementById('spTitle').textContent = tab.title || tab.url;
  document.getElementById('spUrl').textContent = tab.url;
  document.getElementById('spForm').style.display = '';

  // Tag controls
  document.getElementById('spTagArea').onclick = () => document.getElementById('spTagInput').focus();
  document.getElementById('spTagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && e.target.value === '') {
      pendingTags.pop();
      renderTags();
    }
  });

  // Save button
  document.getElementById('spSaveBtn').onclick = async () => {
    const saveBtn = document.getElementById('spSaveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    const goCode = document.getElementById('spGoInput').value.trim().toLowerCase() || null;
    const res = await chrome.runtime.sendMessage({
      action: 'saveCurrentTab',
      tags: [...pendingTags],
      goCode,
    });

    if (res?.ok) {
      window.close();
    } else {
      const err = document.getElementById('spError');
      err.textContent = 'Could not save this tab.';
      err.style.display = 'block';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save & Close';
    }
  };

  // View saved tabs
  document.getElementById('spViewBtn').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    window.close();
  };
}

init();
