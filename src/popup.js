// ─── State ───────────────────────────────────────────────────────────────────
let state = {
  savedTabs: [],
  backupList: [],
  archiveList: [],
  settings: {},
  activeTags: new Set(),
};

// ─── Utilities ───────────────────────────────────────────────────────────────
function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

function formatDate(ms) {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDaysAgo(ms) {
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor(diff / 60000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return `${mins}m ago`;
}

function daysUntilPurge(closedAt, purgeDays) {
  if (!purgeDays) return null;
  const expiresAt = closedAt + purgeDays * 86400000;
  const remaining = Math.ceil((expiresAt - Date.now()) / 86400000);
  return remaining;
}

function makeFavicon(favIconUrl, title) {
  if (favIconUrl) {
    const img = document.createElement('img');
    img.src = favIconUrl;
    img.className = 'item-favicon';
    img.onerror = () => img.replaceWith(makePlaceholder(title));
    return img;
  }
  return makePlaceholder(title);
}

function makePlaceholder(title) {
  const el = document.createElement('div');
  el.className = 'item-favicon-placeholder';
  el.textContent = (title || '?')[0].toUpperCase();
  return el;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Data loading ─────────────────────────────────────────────────────────────
async function loadAll() {
  const data = await chrome.storage.local.get(['savedTabs', 'backupList', 'archiveList', 'settings']);
  state.savedTabs = data.savedTabs || [];
  state.backupList = data.backupList || [];
  state.archiveList = data.archiveList || [];
  state.settings = data.settings || {};
  render();
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  renderCounts();
  renderSaved();
  renderBackup();
  renderArchive();
}

function renderCounts() {
  document.getElementById('savedCount').textContent = state.savedTabs.length;
  document.getElementById('backupCount').textContent = state.backupList.length;
  document.getElementById('archiveCount').textContent = state.archiveList.length;
}

// ─── Saved tabs ───────────────────────────────────────────────────────────────
function getAllTags() {
  const tags = new Set();
  state.savedTabs.forEach((t) => (t.tags || []).forEach((tag) => tags.add(tag)));
  return [...tags].sort();
}

function filterSaved() {
  if (state.activeTags.size === 0) return state.savedTabs;
  return state.savedTabs.filter((tab) =>
    [...state.activeTags].every((tag) => (tab.tags || []).includes(tag))
  );
}

function renderTagFilters() {
  const allTags = getAllTags();
  const area = document.getElementById('tagFilterArea');
  const chipsEl = document.getElementById('tagChips');
  const clearBtn = document.getElementById('clearTagFilter');

  area.style.display = allTags.length ? 'flex' : 'none';

  chipsEl.innerHTML = '';
  allTags.forEach((tag) => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip' + (state.activeTags.has(tag) ? ' active' : '');
    chip.textContent = tag;
    chip.onclick = () => {
      if (state.activeTags.has(tag)) {
        state.activeTags.delete(tag);
      } else {
        state.activeTags.add(tag);
      }
      renderSaved();
    };
    chipsEl.appendChild(chip);
  });

  clearBtn.style.display = state.activeTags.size ? 'block' : 'none';
}

function renderSaved() {
  renderTagFilters();
  const container = document.getElementById('savedList');
  const filtered = filterSaved();

  const expandedIds = new Set(
    [...container.querySelectorAll('.item-card.expanded')].map((el) => el.dataset.id)
  );

  if (filtered.length === 0) {
    const msg = state.savedTabs.length === 0
      ? 'No saved tabs yet.<br>Click the extension icon to save &amp; close a tab.'
      : 'No tabs match the selected filters.';
    container.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  container.innerHTML = '';
  // Show newest first
  [...filtered].reverse().forEach((tab) => {
    const card = makeSavedCard(tab);
    if (expandedIds.has(tab.id)) card.classList.add('expanded');
    container.appendChild(card);
  });
}

function makeSavedCard(tab) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.id = tab.id;

  // Main row (clickable to expand)
  const main = document.createElement('div');
  main.className = 'item-main';

  main.appendChild(makeFavicon(tab.favIconUrl, tab.title));

  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = `<div class="item-title">${escapeHtml(tab.title)}</div>
    <div class="item-url">${escapeHtml(tab.url)}</div>`;
  main.appendChild(info);

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  if (tab.goCode) {
    const badge = document.createElement('span');
    badge.className = 'go-badge';
    badge.textContent = `go ${tab.goCode}`;
    meta.appendChild(badge);
  }

  (tab.tags || []).slice(0, 3).forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.textContent = tag;
    meta.appendChild(pill);
  });

  const expandIcon = document.createElement('span');
  expandIcon.className = 'expand-icon';
  expandIcon.textContent = '▾';
  meta.appendChild(expandIcon);

  main.appendChild(meta);
  main.onclick = () => card.classList.toggle('expanded');
  card.appendChild(main);

  // Detail panel
  const detail = document.createElement('div');
  detail.className = 'item-detail';
  detail.appendChild(makeTagEditor(tab));
  detail.appendChild(makeGoCodeEditor(tab));
  detail.appendChild(makeSavedMeta(tab));
  detail.appendChild(makeSavedActions(tab));
  card.appendChild(detail);

  return card;
}

function makeTagEditor(tab) {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const label = document.createElement('span');
  label.className = 'detail-label';
  label.textContent = 'Tags';
  row.appendChild(label);

  const val = document.createElement('div');
  val.className = 'detail-value';

  const tagList = document.createElement('div');
  tagList.className = 'tag-list';

  const renderTags = () => {
    tagList.innerHTML = '';
    (tab.tags || []).forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'tag-removable';
      pill.innerHTML = `${escapeHtml(tag)} <button class="tag-remove-btn" title="Remove tag">×</button>`;
      pill.querySelector('.tag-remove-btn').onclick = async (e) => {
        e.stopPropagation();
        tab.tags = tab.tags.filter((t) => t !== tag);
        await send({ action: 'updateSavedTab', id: tab.id, patch: { tags: tab.tags } });
        renderTags();
        renderTagFilters();
        renderCounts();
      };
      tagList.appendChild(pill);
    });
  };
  renderTags();
  val.appendChild(tagList);

  // Add tag input
  const addRow = document.createElement('div');
  addRow.style.display = 'flex';
  addRow.style.gap = '6px';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input';
  input.placeholder = 'Add tag…';
  input.style.width = '140px';
  input.maxLength = 30;

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-secondary btn-sm';
  addBtn.textContent = 'Add';

  const doAdd = async () => {
    const newTag = input.value.trim().toLowerCase();
    if (!newTag || (tab.tags || []).includes(newTag)) { input.value = ''; return; }
    tab.tags = [...(tab.tags || []), newTag];
    await send({ action: 'updateSavedTab', id: tab.id, patch: { tags: tab.tags } });
    input.value = '';
    renderTags();
    renderTagFilters();
  };

  addBtn.onclick = doAdd;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  val.appendChild(addRow);
  row.appendChild(val);
  return row;
}

function makeGoCodeEditor(tab) {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const label = document.createElement('span');
  label.className = 'detail-label';
  label.textContent = 'Go code';
  row.appendChild(label);

  const val = document.createElement('div');
  val.className = 'detail-value';

  const inputRow = document.createElement('div');
  inputRow.style.display = 'flex';
  inputRow.style.gap = '6px';
  inputRow.style.alignItems = 'center';

  const prefix = document.createElement('span');
  prefix.style.color = 'var(--text-dim)';
  prefix.style.fontFamily = 'monospace';
  prefix.style.fontSize = '13px';
  prefix.textContent = 'go ';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-input';
  input.value = tab.goCode || '';
  input.placeholder = 'shortcode';
  input.style.width = '120px';
  input.maxLength = 20;
  input.pattern = '[a-z0-9\\-]+';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-secondary btn-sm';
  saveBtn.textContent = 'Save';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn-ghost btn-sm';
  clearBtn.textContent = 'Clear';

  const errMsg = document.createElement('div');
  errMsg.className = 'error-msg';
  errMsg.style.display = 'none';

  const doSave = async () => {
    const code = input.value.trim().toLowerCase();
    errMsg.style.display = 'none';
    input.classList.remove('error');

    if (code && !/^[a-z0-9-]+$/.test(code)) {
      errMsg.textContent = 'Only lowercase letters, numbers, hyphens.';
      errMsg.style.display = 'block';
      input.classList.add('error');
      return;
    }

    // Check uniqueness
    const duplicate = state.savedTabs.find((t) => t.id !== tab.id && t.goCode === code && code !== '');
    if (duplicate) {
      errMsg.textContent = `Code "${code}" is already used by "${duplicate.title}".`;
      errMsg.style.display = 'block';
      input.classList.add('error');
      return;
    }

    tab.goCode = code || null;
    await send({ action: 'updateSavedTab', id: tab.id, patch: { goCode: tab.goCode } });
    // Re-render the card's meta badges
    renderSaved();
  };

  clearBtn.onclick = async () => {
    input.value = '';
    tab.goCode = null;
    await send({ action: 'updateSavedTab', id: tab.id, patch: { goCode: null } });
    renderSaved();
  };

  saveBtn.onclick = doSave;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSave(); });

  inputRow.appendChild(prefix);
  inputRow.appendChild(input);
  inputRow.appendChild(saveBtn);
  if (tab.goCode) inputRow.appendChild(clearBtn);

  val.appendChild(inputRow);
  val.appendChild(errMsg);
  row.appendChild(val);
  return row;
}

function makeSavedMeta(tab) {
  const row = document.createElement('div');
  row.className = 'detail-row';

  const label = document.createElement('span');
  label.className = 'detail-label';
  label.textContent = 'Saved';

  const val = document.createElement('div');
  val.className = 'detail-value';
  val.style.color = 'var(--text-dim)';
  val.style.fontSize = '12px';
  val.style.paddingTop = '6px';
  val.textContent = formatDate(tab.savedAt);

  row.appendChild(label);
  row.appendChild(val);
  return row;
}

function makeSavedActions(tab) {
  const actions = document.createElement('div');
  actions.className = 'detail-actions';

  const openBtn = document.createElement('button');
  openBtn.className = 'btn btn-primary btn-sm';
  openBtn.textContent = 'Open tab';
  openBtn.onclick = () => send({ action: 'restoreSavedTab', id: tab.id });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-danger btn-sm';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = async () => {
    await send({ action: 'deleteSavedTab', id: tab.id });
    state.savedTabs = state.savedTabs.filter((t) => t.id !== tab.id);
    state.activeTags = new Set([...state.activeTags].filter((tag) => getAllTags().includes(tag)));
    render();
  };

  actions.appendChild(openBtn);
  actions.appendChild(deleteBtn);
  return actions;
}

// ─── Backup section ───────────────────────────────────────────────────────────
function renderBackup() {
  const container = document.getElementById('backupList');
  if (state.backupList.length === 0) {
    container.innerHTML = '<div class="empty-state">No backups yet.<br>Configure backup interval in Options.</div>';
    return;
  }

  container.innerHTML = '';
  // Newest first
  [...state.backupList].reverse().forEach((snapshot) => {
    container.appendChild(makeSnapshotCard(snapshot));
  });
}

function makeSnapshotCard(snapshot) {
  const card = document.createElement('div');
  card.className = 'snapshot-card';

  const header = document.createElement('div');
  header.className = 'snapshot-header';

  const time = document.createElement('span');
  time.className = 'snapshot-time';
  time.textContent = formatDate(snapshot.capturedAt);

  const count = document.createElement('span');
  count.className = 'snapshot-count';
  count.textContent = `${snapshot.tabs.length} tab${snapshot.tabs.length !== 1 ? 's' : ''}`;

  const spacer = document.createElement('span');
  spacer.className = 'snapshot-spacer';

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-ghost btn-sm';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = async (e) => {
    e.stopPropagation();
    await send({ action: 'deleteBackupSnapshot', id: snapshot.id });
    state.backupList = state.backupList.filter((s) => s.id !== snapshot.id);
    render();
  };

  const expandIcon = document.createElement('span');
  expandIcon.className = 'expand-icon';
  expandIcon.textContent = '▾';

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'btn btn-ghost btn-sm';
  restoreBtn.textContent = 'Restore all';
  restoreBtn.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm(`Open all ${snapshot.tabs.length} tab${snapshot.tabs.length !== 1 ? 's' : ''} in a new window?`)) return;
    await send({ action: 'restoreSnapshot', id: snapshot.id });
  };

  header.appendChild(time);
  header.appendChild(count);
  header.appendChild(spacer);
  header.appendChild(restoreBtn);
  header.appendChild(deleteBtn);
  header.appendChild(expandIcon);
  header.onclick = (e) => {
    if (e.target === restoreBtn || e.target === deleteBtn) return;
    card.classList.toggle('expanded');
  };
  card.appendChild(header);

  // Tab list
  const tabsEl = document.createElement('div');
  tabsEl.className = 'snapshot-tabs';

  if (snapshot.tabs.length === 0) {
    tabsEl.innerHTML = '<div style="color:var(--text-dim);padding:8px 0;font-size:13px">No tabs captured.</div>';
  } else {
    const groupMap = new Map((snapshot.groups || []).map((g) => [g.id, g]));
    let lastGroupId = undefined;

    snapshot.tabs.forEach((t) => {
      const groupId = t.groupId ?? -1;

      if (groupId !== -1 && groupId !== lastGroupId) {
        const group = groupMap.get(groupId);
        const groupHeader = document.createElement('div');
        groupHeader.className = `snapshot-group-header snapshot-group-${group?.color || 'grey'}`;
        groupHeader.textContent = group?.title || 'Unnamed group';
        tabsEl.appendChild(groupHeader);
      } else if (groupId === -1 && lastGroupId !== -1 && lastGroupId !== undefined) {
        // Transitioning out of a group — no header needed, just reset
      }
      lastGroupId = groupId;

      const row = document.createElement('div');
      row.className = groupId !== -1 ? 'snapshot-tab-row snapshot-tab-row--grouped' : 'snapshot-tab-row';

      row.appendChild(makeFavicon(t.favIconUrl, t.title));

      const title = document.createElement('span');
      title.className = 'snapshot-tab-title';
      title.textContent = t.title || t.url;

      const url = document.createElement('span');
      url.className = 'snapshot-tab-url';
      url.textContent = t.url;

      const openBtn = document.createElement('button');
      openBtn.className = 'btn btn-ghost btn-sm';
      openBtn.textContent = 'Open';
      openBtn.onclick = () => send({ action: 'restoreBackupTab', url: t.url });

      row.appendChild(title);
      row.appendChild(url);
      row.appendChild(openBtn);
      tabsEl.appendChild(row);
    });
  }

  card.appendChild(tabsEl);
  return card;
}

// ─── Archive section ──────────────────────────────────────────────────────────
function renderArchive() {
  const container = document.getElementById('archiveList');
  const noteEl = document.getElementById('archivePurgeNote');
  const purgeDays = state.settings.archivePurgeDays ?? 30;

  noteEl.textContent = purgeDays === 0
    ? 'Archive is kept forever (no purge configured).'
    : `Tabs are automatically removed after ${purgeDays} day${purgeDays !== 1 ? 's' : ''}.`;

  if (state.archiveList.length === 0) {
    container.innerHTML = '<div class="empty-state">No archived tabs.</div>';
    return;
  }

  container.innerHTML = '';
  // Newest first
  [...state.archiveList].reverse().forEach((entry) => {
    container.appendChild(makeArchiveCard(entry, purgeDays));
  });
}

function makeArchiveCard(entry, purgeDays) {
  const card = document.createElement('div');
  card.className = 'item-card';

  const main = document.createElement('div');
  main.className = 'item-main';
  main.style.cursor = 'default';

  main.appendChild(makeFavicon(entry.favIconUrl, entry.title));

  const info = document.createElement('div');
  info.className = 'item-info';
  info.innerHTML = `<div class="item-title">${escapeHtml(entry.title)}</div>
    <div class="item-url">${escapeHtml(entry.url)}</div>`;
  main.appendChild(info);

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const ago = document.createElement('span');
  ago.className = 'days-remaining';
  ago.textContent = formatDaysAgo(entry.closedAt);
  meta.appendChild(ago);

  if (purgeDays > 0) {
    const days = daysUntilPurge(entry.closedAt, purgeDays);
    if (days !== null && days <= 3) {
      const warn = document.createElement('span');
      warn.className = 'days-remaining';
      warn.style.color = 'var(--danger)';
      warn.textContent = days <= 0 ? 'Purging soon' : `Purges in ${days}d`;
      meta.appendChild(warn);
    }
  }

  const restoreBtn = document.createElement('button');
  restoreBtn.className = 'btn btn-ghost btn-sm';
  restoreBtn.textContent = 'Restore';
  restoreBtn.onclick = () => send({ action: 'restoreBackupTab', url: entry.url });
  meta.appendChild(restoreBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'btn btn-ghost btn-sm';
  deleteBtn.style.color = 'var(--danger)';
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = async () => {
    await send({ action: 'deleteArchiveEntry', id: entry.id });
    state.archiveList = state.archiveList.filter((e) => e.id !== entry.id);
    render();
  };
  meta.appendChild(deleteBtn);

  main.appendChild(meta);
  card.appendChild(main);
  return card;
}

// ─── Tab navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`section-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Event bindings ───────────────────────────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('clearTagFilter').addEventListener('click', () => {
  state.activeTags.clear();
  renderSaved();
});

document.getElementById('clearArchive').addEventListener('click', async () => {
  if (!confirm('Clear all archived tabs?')) return;
  await send({ action: 'clearArchive' });
  state.archiveList = [];
  render();
});

document.getElementById('runBackupNow').addEventListener('click', async () => {
  const btn = document.getElementById('runBackupNow');
  btn.disabled = true;
  btn.textContent = 'Backing up…';
  await send({ action: 'runBackupNow' });
  // Reload backup data
  const data = await chrome.storage.local.get('backupList');
  state.backupList = data.backupList || [];
  renderBackup();
  renderCounts();
  btn.disabled = false;
  btn.textContent = 'Backup now';
});

// ─── Storage change listener (live updates) ───────────────────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let changed = false;
  if (changes.savedTabs) { state.savedTabs = changes.savedTabs.newValue || []; changed = true; }
  if (changes.backupList) { state.backupList = changes.backupList.newValue || []; changed = true; }
  if (changes.archiveList) { state.archiveList = changes.archiveList.newValue || []; changed = true; }
  if (changes.settings) { state.settings = changes.settings.newValue || {}; changed = true; }
  if (changed) render();
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadAll();
