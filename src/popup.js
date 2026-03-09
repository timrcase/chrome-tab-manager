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
  const list = document.getElementById('spTagList');
  list.innerHTML = '';
  pendingTags.forEach((tag, i) => {
    const chip = document.createElement('span');
    chip.className = 'sp-tag-chip';
    chip.innerHTML = `${tag} <button class="sp-tag-remove" title="Remove">×</button>`;
    chip.querySelector('.sp-tag-remove').onclick = () => {
      pendingTags.splice(i, 1);
      renderTags();
    };
    list.appendChild(chip);
  });
}

function addTag() {
  const input = document.getElementById('spTagInput');
  const val = input.value.trim().toLowerCase();
  if (val && !pendingTags.includes(val)) {
    pendingTags.push(val);
    renderTags();
  }
  input.value = '';
  input.focus();
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
  document.getElementById('spTagAddBtn').onclick = addTag;
  document.getElementById('spTagInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
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
