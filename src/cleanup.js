// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  duplicateGroups: [],
  staleTabs: [],
  staleThresholdDays: 15,
  settings: {},
  totalOpen: 0,
};

const CLEANUP_THRESHOLD_STEP = 15;
const CLEANUP_THRESHOLD_MAX = 360;
let cleanupThresholdPointerActive = false;
let cleanupThresholdCommitPromise = null;
let pendingCleanupThreshold = null;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeThreshold(value, fallback) {
  const n = parseInt(value, 10);
  const raw = Number.isNaN(n) ? fallback : n;
  if (raw <= 0) return 0;
  const snapped = Math.round(raw / CLEANUP_THRESHOLD_STEP) * CLEANUP_THRESHOLD_STEP;
  return Math.max(CLEANUP_THRESHOLD_STEP, Math.min(CLEANUP_THRESHOLD_MAX, snapped));
}

function formatThresholdLabel(value) {
  return value === 0 ? 'off' : `${value}d`;
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

function setButtonBusy(btn, label) {
  btn.disabled = true;
  if (btn.classList.contains('btn-icon')) {
    btn.title = label;
    btn.setAttribute('aria-label', label);
  } else {
    btn.textContent = label;
  }
}

function markButtonError(btn, label) {
  btn.disabled = false;
  if (btn.classList.contains('btn-icon')) {
    btn.title = label;
    btn.setAttribute('aria-label', label);
  } else {
    btn.textContent = label;
  }
  btn.classList.add('btn-error-flash');
  setTimeout(() => btn.classList.remove('btn-error-flash'), 600);
}

function getRowsByTabIds(tabIds) {
  const wanted = new Set(tabIds.map(String));
  return [...document.querySelectorAll('.tab-row')].filter((row) =>
    wanted.has(row.dataset.tabId),
  );
}

async function confirmRows(tabIds, action) {
  const rows = getRowsByTabIds(tabIds);
  if (rows.length === 0) return;

  const isSave = action === 'save';
  rows.forEach((row) => {
    row.classList.add('tab-row--committed', isSave ? 'tab-row--saved' : 'tab-row--closed');
    row.querySelectorAll('button, input').forEach((control) => {
      control.disabled = true;
    });

    const status = document.createElement('div');
    status.className = 'tab-row-status';

    const icon = document.createElement('span');
    icon.className = 'material-symbols-outlined';
    icon.textContent = isSave ? 'check' : 'close';
    status.appendChild(icon);

    const label = document.createElement('span');
    label.textContent = isSave ? 'Saved' : 'Closed';
    status.appendChild(label);

    row.appendChild(status);
  });

  await delay(420);
  rows.forEach((row) => row.classList.add('tab-row--exiting'));
  await delay(140);
}

// ─── Row builder ─────────────────────────────────────────────────────────────
function makeTabRow(tab, options = {}) {
  const { selectable = true, showActions = true, onSelectionChange = null } = options;
  const row = document.createElement('div');
  row.className = 'tab-row';
  row.dataset.tabId = tab.tabId;

  if (selectable) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-checkbox';
    checkbox.dataset.tabId = tab.tabId;
    if (tab.pinned) {
      checkbox.disabled = true;
      checkbox.title = 'Pinned tabs cannot be closed here';
    }
    if (onSelectionChange) {
      checkbox.addEventListener('change', onSelectionChange);
    }
    row.appendChild(checkbox);
  }

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

  if (showActions) {
    row.classList.add('tab-row--actions');

    const actions = document.createElement('div');
    actions.className = 'tab-row-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn-ghost btn-icon';
    saveBtn.title = tab.pinned ? 'Pinned tabs cannot be closed here' : 'Save';
    saveBtn.setAttribute('aria-label', 'Save');
    saveBtn.disabled = tab.pinned;
    const saveIcon = document.createElement('span');
    saveIcon.className = 'material-symbols-outlined';
    saveIcon.textContent = 'save';
    saveBtn.appendChild(saveIcon);
    saveBtn.addEventListener('click', () => handleSaveTabs([tab.tabId], saveBtn));
    actions.appendChild(saveBtn);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-danger btn-icon';
    closeBtn.title = tab.pinned ? 'Pinned tabs cannot be closed here' : 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.disabled = tab.pinned;
    const closeIcon = document.createElement('span');
    closeIcon.className = 'material-symbols-outlined';
    closeIcon.textContent = 'close';
    closeBtn.appendChild(closeIcon);
    closeBtn.addEventListener('click', () => handleCloseTabs([tab.tabId], closeBtn));
    actions.appendChild(closeBtn);

    row.appendChild(actions);
  }
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
    const groupEl = document.createElement('div');
    groupEl.className = 'dup-group';

    const row = document.createElement('div');
    row.className = 'dup-url-row';

    const firstTab = group.tabs.reduce((mostRecent, t) => {
      if (mostRecent === null) return t;
      if (t.openedAt === null) return mostRecent;
      if (mostRecent.openedAt === null) return t;
      return t.openedAt > mostRecent.openedAt ? t : mostRecent;
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

    groupEl.appendChild(row);

    const tabsEl = document.createElement('div');
    tabsEl.className = 'dup-tab-list item-list';
    group.tabs
      .slice()
      .sort((a, b) => {
        if (a.openedAt === null) return 1;
        if (b.openedAt === null) return -1;
        return b.openedAt - a.openedAt;
      })
      .forEach((tab) => {
        tabsEl.appendChild(makeTabRow(tab, { selectable: false, showActions: false }));
      });
    groupEl.appendChild(tabsEl);

    listEl.appendChild(groupEl);
  });
}

function renderStale(tabs) {
  const listEl = document.getElementById('staleList');
  const emptyEl = document.getElementById('staleEmpty');
  const countEl = document.getElementById('staleCount');
  const infoIcon = document.getElementById('staleInfoIcon');
  const actionsEl = document.getElementById('staleActions');
  const selectBtn = document.getElementById('staleSelectAll');
  const thresholdInput = document.getElementById('cleanupStaleThresholdDays');
  const thresholdValue = document.getElementById('cleanupStaleThresholdValue');
  const threshold = normalizeThreshold(state.staleThresholdDays, 15);

  thresholdInput.value = threshold;
  thresholdValue.textContent = formatThresholdLabel(threshold);

  if (threshold === 0) {
    infoIcon.dataset.tooltip = 'Stale tab detection is disabled. Set inactive days above 0.';
    infoIcon.textContent = 'info';
    actionsEl.style.display = '';
    listEl.innerHTML = '';
    emptyEl.style.display = '';
    emptyEl.textContent = 'Stale tab detection is disabled.';
    countEl.textContent = 0;
    selectBtn.disabled = true;
    updateSelectedButtons('stale');
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
    updateSelectedButtons('stale');
    return;
  }

  emptyEl.style.display = 'none';
  selectBtn.disabled = false;
  listEl.innerHTML = '';

  tabs.forEach((tab) => {
    const row = makeTabRow(tab, {
      onSelectionChange: () => updateSelectedButtons('stale'),
    });
    listEl.appendChild(row);
  });

  updateSelectedButtons('stale');
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

// ─── Selection button state ──────────────────────────────────────────────────
function updateSelectedButtons(section) {
  const listEl = document.getElementById(`${section}List`);
  const closeBtn = document.getElementById(`${section}CloseSelected`);
  const saveBtn = document.getElementById(`${section}SaveSelected`);
  const selectBtn = document.getElementById(`${section}SelectAll`);

  const checkboxes = listEl.querySelectorAll('input[type="checkbox"]:not(:disabled)');
  const checked = listEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');

  closeBtn.disabled = checked.length === 0;
  closeBtn.textContent = checked.length > 0 ? `Close ${checked.length}` : 'Close selected';

  if (saveBtn) {
    saveBtn.disabled = checked.length === 0;
    saveBtn.textContent = checked.length > 0 ? `Save ${checked.length}` : 'Save selected';
  }

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
  updateSelectedButtons(section);
}

function getSelectedTabIds(section) {
  const listEl = document.getElementById(`${section}List`);
  const checked = listEl.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)');
  return [...checked].map((cb) => parseInt(cb.dataset.tabId, 10));
}

async function handleSaveTabs(tabIds, btn) {
  if (tabIds.length === 0) return;

  const originalLabel = btn.getAttribute('aria-label') || btn.textContent;
  setButtonBusy(btn, `Saving ${tabIds.length}…`);

  const res = await send({ action: 'saveTabs', tabIds });
  if (!res?.ok) {
    markButtonError(btn, res?.reason === 'storage_full' ? 'Storage full' : originalLabel);
    return;
  }

  await confirmRows(tabIds, 'save');
  await loadData({ silent: true });
}

async function handleCloseTabs(tabIds, btn) {
  if (tabIds.length === 0) return;

  const originalLabel = btn.getAttribute('aria-label') || btn.textContent;
  setButtonBusy(btn, `Closing ${tabIds.length}…`);

  const res = await send({ action: 'closeTabs', tabIds });
  if (!res?.ok) {
    markButtonError(btn, originalLabel);
    return;
  }

  await confirmRows(tabIds, 'close');
  await loadData({ silent: true });
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

  await handleCloseTabs(tabIds, btn);
}

async function handleCloseStale() {
  const btn = document.getElementById('staleCloseSelected');
  await handleCloseTabs(getSelectedTabIds('stale'), btn);
}

async function handleSaveStale() {
  const btn = document.getElementById('staleSaveSelected');
  await handleSaveTabs(getSelectedTabIds('stale'), btn);
}

async function handleCleanupThresholdChange() {
  if (cleanupThresholdCommitPromise) {
    await cleanupThresholdCommitPromise;
  }

  const input = document.getElementById('cleanupStaleThresholdDays');
  const output = document.getElementById('cleanupStaleThresholdValue');

  const nextThreshold = pendingCleanupThreshold ?? normalizeThreshold(input.value, state.staleThresholdDays);
  input.value = nextThreshold;
  output.textContent = formatThresholdLabel(nextThreshold);
  pendingCleanupThreshold = null;

  if (nextThreshold === state.staleThresholdDays) return;

  const settings = {
    ...state.settings,
    cleanupStaleThresholdDays: nextThreshold,
  };

  cleanupThresholdCommitPromise = send({ action: 'updateSettings', settings });
  const res = await cleanupThresholdCommitPromise;
  cleanupThresholdCommitPromise = null;

  if (!res?.ok) {
    input.value = state.staleThresholdDays;
    output.textContent = formatThresholdLabel(state.staleThresholdDays);
    pendingCleanupThreshold = null;
    return;
  }

  state.settings = settings;
  state.staleThresholdDays = nextThreshold;
  await loadData({ silent: true });
}

function handleCleanupThresholdInput() {
  const input = document.getElementById('cleanupStaleThresholdDays');
  const output = document.getElementById('cleanupStaleThresholdValue');
  const nextThreshold = normalizeThreshold(input.value, state.staleThresholdDays);
  pendingCleanupThreshold = nextThreshold;
  output.textContent = formatThresholdLabel(nextThreshold);
}

function handleCleanupThresholdPointerDown() {
  cleanupThresholdPointerActive = true;
  pendingCleanupThreshold = normalizeThreshold(
    document.getElementById('cleanupStaleThresholdDays').value,
    state.staleThresholdDays,
  );
}

function handleCleanupThresholdPointerUp() {
  if (!cleanupThresholdPointerActive) return;
  cleanupThresholdPointerActive = false;
  handleCleanupThresholdChange();
}

function handleCleanupThresholdKeyUp(e) {
  if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') {
    handleCleanupThresholdChange();
  }
}

// ─── Data load ───────────────────────────────────────────────────────────────
async function loadData(options = {}) {
  const { silent = false } = options;

  if (!silent) {
    document.getElementById('loadingState').style.display = '';
    document.getElementById('mainContent').style.display = 'none';
  }

  const res = await send({ action: 'getCleanupData' });

  if (!res?.ok) {
    document.getElementById('loadingState').textContent = 'Error loading tab data.';
    return;
  }

  state.duplicateGroups = res.duplicateGroups;
  state.staleTabs = res.staleTabs;
  state.staleThresholdDays = res.staleThresholdDays;
  state.settings = res.settings || state.settings;
  state.totalOpen = res.totalOpen;
  pendingCleanupThreshold = null;

  if (!silent) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('mainContent').style.display = '';
  }

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
document.getElementById('staleSaveSelected').addEventListener('click', handleSaveStale);
document.getElementById('staleCloseSelected').addEventListener('click', handleCloseStale);
document.getElementById('cleanupStaleThresholdDays').addEventListener('input', handleCleanupThresholdInput);
document.getElementById('cleanupStaleThresholdDays').addEventListener('change', handleCleanupThresholdChange);
document.getElementById('cleanupStaleThresholdDays').addEventListener('pointerdown', handleCleanupThresholdPointerDown);
document.getElementById('cleanupStaleThresholdDays').addEventListener('pointerup', handleCleanupThresholdPointerUp);
document.getElementById('cleanupStaleThresholdDays').addEventListener('blur', handleCleanupThresholdChange);
document.getElementById('cleanupStaleThresholdDays').addEventListener('keyup', handleCleanupThresholdKeyUp);
document.addEventListener('pointerup', handleCleanupThresholdPointerUp);

loadData();
