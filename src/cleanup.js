// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  duplicateGroups: [],
  staleTabs: [],
  staleThresholdDays: 14,
  totalOpen: 0,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function formatAge(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  const days = Math.floor(secs / 86400);
  return `${days}d ago`;
}

function googleFaviconUrl(pageUrl) {
  try {
    const origin = new URL(pageUrl).origin;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(origin)}&sz=32`;
  } catch {
    return null;
  }
}

function makeFavicon(favIconUrl, pageUrl, title) {
  if (favIconUrl) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = favIconUrl;
    img.onerror = () => {
      const fallback = googleFaviconUrl(pageUrl);
      if (fallback && img.src !== fallback) { img.src = fallback; return; }
      img.replaceWith(makePlaceholder(title));
    };
    return img;
  }
  const fallback = googleFaviconUrl(pageUrl);
  if (fallback) {
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = fallback;
    img.onerror = () => img.replaceWith(makePlaceholder(title));
    return img;
  }
  return makePlaceholder(title);
}

function makePlaceholder(title) {
  const el = document.createElement('div');
  el.className = 'favicon-placeholder';
  el.textContent = (title || '?')[0].toUpperCase();
  return el;
}

// ─── Row builder ─────────────────────────────────────────────────────────────
function makeTabRow(tab) {
  const row = document.createElement('div');
  row.className = 'tab-row';
  row.dataset.tabId = tab.tabId;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'tab-checkbox';
  checkbox.dataset.tabId = tab.tabId;
  if (tab.pinned) {
    checkbox.disabled = true;
    checkbox.title = 'Pinned tabs cannot be closed here';
  }
  row.appendChild(checkbox);

  row.appendChild(makeFavicon(tab.favIconUrl, tab.url || '', tab.title));

  const info = document.createElement('div');
  info.className = 'tab-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'tab-title';
  titleEl.textContent = tab.title;

  if (tab.url) {
    const urlEl = document.createElement('div');
    urlEl.className = 'tab-url';
    urlEl.textContent = tab.url;
    info.appendChild(titleEl);
    info.appendChild(urlEl);
  } else {
    info.appendChild(titleEl);
  }

  row.appendChild(info);

  const meta = document.createElement('div');
  meta.className = 'tab-meta';

  if (tab.pinned) {
    const pinnedBadge = document.createElement('span');
    pinnedBadge.className = 'pinned-badge';
    pinnedBadge.textContent = 'PINNED';
    meta.appendChild(pinnedBadge);
  }

  const ageBadge = document.createElement('span');
  ageBadge.className = 'age-badge';
  if (tab.openedAt) {
    ageBadge.textContent = formatAge(tab.openedAt);
    ageBadge.title = `Last accessed: ${new Date(tab.openedAt).toLocaleString()}`;
  } else {
    ageBadge.textContent = 'age unknown';
    ageBadge.title = 'Tab was open before tracking began';
  }
  meta.appendChild(ageBadge);

  row.appendChild(meta);
  return row;
}

// ─── Render ──────────────────────────────────────────────────────────────────
function renderDuplicates(groups) {
  const listEl = document.getElementById('dupList');
  const emptyEl = document.getElementById('dupEmpty');
  const countEl = document.getElementById('dupCount');
  const closeBtn = document.getElementById('dupCloseExtras');

  countEl.textContent = groups.length;

  if (groups.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = '';
    closeBtn.disabled = true;
    closeBtn.textContent = 'Close extras';
    return;
  }

  const totalExtras = groups.reduce((sum, g) => sum + g.tabs.length - 1, 0);
  closeBtn.disabled = false;
  closeBtn.textContent = `Close ${totalExtras} extra${totalExtras !== 1 ? 's' : ''}`;

  emptyEl.style.display = 'none';
  listEl.style.display = '';
  listEl.innerHTML = '';

  groups.forEach((group) => {
    const extras = group.tabs.length - 1;
    const row = document.createElement('div');
    row.className = 'dup-url-row';

    const firstTab = group.tabs.reduce((oldest, t) => {
      if (oldest === null) return t;
      if (t.openedAt === null) return oldest;
      if (oldest.openedAt === null) return t;
      return t.openedAt < oldest.openedAt ? t : oldest;
    }, null) || group.tabs[0];

    row.appendChild(makeFavicon(firstTab.favIconUrl, group.url, group.url));

    const urlEl = document.createElement('span');
    urlEl.className = 'dup-url-text';
    urlEl.textContent = group.url;
    row.appendChild(urlEl);

    const badge = document.createElement('span');
    badge.className = 'dup-extras-badge';
    badge.textContent = `+${extras}`;
    row.appendChild(badge);

    listEl.appendChild(row);
  });
}

function renderStale(tabs) {
  const listEl = document.getElementById('staleList');
  const emptyEl = document.getElementById('staleEmpty');
  const countEl = document.getElementById('staleCount');
  const infoIcon = document.getElementById('staleInfoIcon');
  const actionsEl = document.getElementById('staleActions');
  const selectBtn = document.getElementById('staleSelectAll');
  const threshold = state.staleThresholdDays;

  if (threshold === 0) {
    infoIcon.dataset.tooltip = 'Stale tab detection is disabled. Enable it in Options.';
    infoIcon.textContent = 'info';
    actionsEl.style.display = 'none';
    listEl.innerHTML = '';
    emptyEl.style.display = 'none';
    countEl.textContent = 0;
    return;
  }

  actionsEl.style.display = '';
  infoIcon.dataset.tooltip = `Tabs not accessed in more than ${threshold} day${threshold !== 1 ? 's' : ''}.`;
  infoIcon.textContent = 'info';
  countEl.textContent = tabs.length;

  if (tabs.length === 0) {
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    emptyEl.textContent = `No tabs open longer than ${threshold} day${threshold !== 1 ? 's' : ''}.`;
    selectBtn.disabled = true;
    updateCloseButton('stale');
    return;
  }

  emptyEl.style.display = 'none';
  selectBtn.disabled = false;
  listEl.innerHTML = '';

  tabs.forEach((tab) => {
    const row = makeTabRow(tab);
    row.querySelector('input[type="checkbox"]').addEventListener('change', () => updateCloseButton('stale'));
    listEl.appendChild(row);
  });

  updateCloseButton('stale');
}

function renderSummary() {
  const bar = document.getElementById('summaryBar');
  const extras = state.duplicateGroups.reduce((s, g) => s + g.tabs.length - 1, 0);
  const parts = [`${state.totalOpen} tab${state.totalOpen !== 1 ? 's' : ''} open`];
  if (extras > 0) parts.push(`${extras} duplicate${extras !== 1 ? 's' : ''}`);
  if (state.staleTabs.length > 0) parts.push(`${state.staleTabs.length} stale`);
  bar.textContent = parts.join(' · ');
}

function render() {
  renderSummary();
  renderDuplicates(state.duplicateGroups);
  renderStale(state.staleTabs);
}

// ─── Close button state ───────────────────────────────────────────────────────
function updateCloseButton(section) {
  const listEl = document.getElementById(`${section}List`);
  const btn = document.getElementById(`${section}CloseSelected`);
  const selectBtn = document.getElementById(`${section}SelectAll`);

  const checkboxes = listEl.querySelectorAll('input[type="checkbox"]:not(:disabled)');
  const checked = listEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');

  btn.disabled = checked.length === 0;
  btn.textContent = checked.length > 0 ? `Close ${checked.length}` : 'Close selected';

  if (checkboxes.length > 0 && !selectBtn.disabled) {
    const allChecked = checked.length === checkboxes.length;
    selectBtn.textContent = allChecked ? 'Deselect all' : 'Select all';
  }
}

// ─── Select all toggle ───────────────────────────────────────────────────────
function toggleSelectAll(section) {
  const listEl = document.getElementById(`${section}List`);
  const checkboxes = listEl.querySelectorAll('input[type="checkbox"]:not(:disabled)');
  const allChecked = [...checkboxes].every((cb) => cb.checked);
  checkboxes.forEach((cb) => { cb.checked = !allChecked; });
  updateCloseButton(section);
}

// ─── Close handlers ──────────────────────────────────────────────────────────
async function handleCloseDuplicates() {
  const btn = document.getElementById('dupCloseExtras');
  const tabIds = [];

  for (const group of state.duplicateGroups) {
    const sorted = [...group.tabs].sort((a, b) => {
      if (a.openedAt === null) return 1;
      if (b.openedAt === null) return -1;
      return b.openedAt - a.openedAt;
    });
    // Keep most recently accessed (index 0), close the rest
    sorted.slice(1).forEach((t) => tabIds.push(t.tabId));
  }

  if (tabIds.length === 0) return;

  btn.disabled = true;
  btn.textContent = `Closing ${tabIds.length}…`;

  await send({ action: 'closeTabs', tabIds });
  await loadData();
}

async function handleCloseStale() {
  const listEl = document.getElementById('staleList');
  const btn = document.getElementById('staleCloseSelected');

  const checked = listEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
  const tabIds = [...checked].map((cb) => parseInt(cb.dataset.tabId, 10));

  if (tabIds.length === 0) return;

  btn.disabled = true;
  btn.textContent = `Closing ${tabIds.length}…`;

  await send({ action: 'closeTabs', tabIds });
  await loadData();
}

// ─── Data load ───────────────────────────────────────────────────────────────
async function loadData() {
  document.getElementById('loadingState').style.display = '';
  document.getElementById('mainContent').style.display = 'none';

  const res = await send({ action: 'getCleanupData' });

  if (!res?.ok) {
    document.getElementById('loadingState').textContent = 'Error loading tab data.';
    return;
  }

  state.duplicateGroups = res.duplicateGroups;
  state.staleTabs = res.staleTabs;
  state.staleThresholdDays = res.staleThresholdDays;
  state.totalOpen = res.totalOpen;

  document.getElementById('loadingState').style.display = 'none';
  document.getElementById('mainContent').style.display = '';

  render();
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.querySelector('.app-title').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('manager.html');
});
document.getElementById('openOptions').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('options.html');
});
document.getElementById('dupCloseExtras').addEventListener('click', handleCloseDuplicates);
document.getElementById('staleSelectAll').addEventListener('click', () => toggleSelectAll('stale'));
document.getElementById('staleCloseSelected').addEventListener('click', handleCloseStale);

loadData();
