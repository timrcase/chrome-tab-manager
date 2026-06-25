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

function purgeCountdownText(closedAt, purgeDays) {
  if (purgeDays === 0) return 'Kept forever';

  const days = daysUntilPurge(closedAt, purgeDays);
  if (days === null) return '';
  if (days <= 0) return 'Deletes soon';
  if (days === 1) return 'Deletes in 1d';
  return `Deletes in ${days}d`;
}

function makeFavicon(favIconUrl, title) {
  if (!favIconUrl) return makePlaceholder(title);

  const img = document.createElement('img');
  img.src = favIconUrl;
  img.className = 'item-favicon';
  img.onerror = () => img.replaceWith(makePlaceholder(title));
  return img;
}

function makeIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.classList.add('ui-icon');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `icons/ui-icons.svg#${name}`);
  svg.appendChild(use);
  return svg;
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
  const validPages = ['saved', 'open', 'backup', 'archive'];
  const defaultPage = validPages.includes(state.settings.defaultManagerPage)
    ? state.settings.defaultManagerPage
    : 'open';
  activateSection(defaultPage);
  // Eager-preload open tabs so counts/switching is instant even when default page isn't Open
  if (defaultPage !== 'open' && !otState.loaded) loadOpenTabs();
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

  const existing = [...chipsEl.querySelectorAll('.tag-chip')];
  const existingTags = existing.map((c) => c.dataset.tag);
  const sameSet = existingTags.length === allTags.length && allTags.every((t, i) => t === existingTags[i]);

  if (sameSet) {
    existing.forEach((c) => c.classList.toggle('active', state.activeTags.has(c.dataset.tag)));
  } else {
    chipsEl.innerHTML = '';
    allTags.forEach((tag) => {
      const chip = document.createElement('button');
      chip.className = 'tag-chip' + (state.activeTags.has(tag) ? ' active' : '');
      chip.dataset.tag = tag;
      chip.textContent = tag;
      chip.onclick = () => {
        if (state.activeTags.has(tag)) state.activeTags.delete(tag);
        else state.activeTags.add(tag);
        renderSaved();
      };
      chipsEl.appendChild(chip);
    });
  }

  clearBtn.style.visibility = state.activeTags.size ? 'visible' : 'hidden';
}

function renderSaved() {
  renderTagFilters();
  const container = document.getElementById('savedList');
  const filtered = [...filterSaved()].reverse();

  if (filtered.length === 0) {
    const msg = state.savedTabs.length === 0
      ? 'No saved tabs yet.<br>Click the extension icon to save a tab.'
      : 'No tabs match the selected filters.';
    container.innerHTML = `<div class="empty-state">${msg}</div>`;
    return;
  }

  // Remove empty-state if present
  const empty = container.querySelector('.empty-state');
  if (empty) empty.remove();

  // Remove cards no longer in filtered set
  const filteredIds = new Set(filtered.map((t) => t.id));
  container.querySelectorAll('.item-card').forEach((el) => {
    if (!filteredIds.has(el.dataset.id)) el.remove();
  });

  // Insert/reorder cards without full rebuild
  filtered.forEach((tab, i) => {
    const existing = container.querySelector(`.item-card[data-id="${tab.id}"]`);
    const refNode = container.children[i] || null;
    if (existing) {
      if (existing !== refNode) container.insertBefore(existing, refNode);
    } else {
      container.insertBefore(makeSavedCard(tab), refNode);
    }
  });
}

function makeSavedCard(tab) {
  const card = document.createElement('div');
  card.className = 'item-card';
  card.dataset.id = tab.id;

  const main = document.createElement('div');
  main.className = 'item-main';

  main.appendChild(makeFavicon(tab.favIconUrl, tab.title));

  const info = document.createElement('div');
  info.className = 'item-info';

  const titleEl = document.createElement('div');
  titleEl.className = 'item-title';
  titleEl.textContent = tab.title;

  const urlEl = document.createElement('button');
  urlEl.type = 'button';
  urlEl.className = 'item-url item-open-target';
  urlEl.textContent = tab.url;
  urlEl.title = 'Open saved tab';
  urlEl.onclick = () => send({ action: 'restoreSavedTab', id: tab.id });

  info.appendChild(titleEl);
  info.appendChild(urlEl);
  main.appendChild(info);

  main.appendChild(makeInlineTags(tab));

  const meta = document.createElement('div');
  meta.className = 'item-meta';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn btn-primary btn-icon';
  openBtn.title = 'Open saved tab';
  openBtn.setAttribute('aria-label', 'Open saved tab');
  openBtn.appendChild(makeIcon('open-in-new'));
  openBtn.onclick = () => send({ action: 'restoreSavedTab', id: tab.id });
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-ghost btn-icon saved-delete-btn';
  deleteBtn.title = 'Delete';
  deleteBtn.setAttribute('aria-label', 'Delete saved tab');
  deleteBtn.appendChild(makeIcon('delete'));
  deleteBtn.onclick = async () => {
    await send({ action: 'deleteSavedTab', id: tab.id });
    state.savedTabs = state.savedTabs.filter((t) => t.id !== tab.id);
    state.activeTags = new Set([...state.activeTags].filter((tag) => getAllTags().includes(tag)));
    render();
  };
  meta.appendChild(deleteBtn);
  meta.appendChild(openBtn);

  main.appendChild(meta);
  card.appendChild(main);
  return card;
}

function makeInlineTags(tab) {
  const wrap = document.createElement('div');
  wrap.className = 'saved-tags';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'saved-tag-input';
  input.placeholder = '+ tag';
  input.maxLength = 30;

  const renderPills = () => {
    wrap.querySelectorAll('.saved-tag-pill').forEach((el) => el.remove());
    (tab.tags || []).forEach((tag) => {
      const pill = document.createElement('span');
      pill.className = 'saved-tag-pill';
      pill.textContent = tag;
      pill.title = 'Click to remove';
      pill.onclick = async (e) => {
        e.stopPropagation();
        tab.tags = tab.tags.filter((t) => t !== tag);
        await send({ action: 'updateSavedTab', id: tab.id, patch: { tags: tab.tags } });
        renderPills();
        renderTagFilters();
        renderCounts();
      };
      wrap.appendChild(pill);
    });
  };

  wrap.appendChild(input);
  wrap.onclick = () => input.focus();
  renderPills();

  const doAdd = async () => {
    const val = input.value.trim().toLowerCase();
    if (!val || (tab.tags || []).includes(val)) { input.value = ''; return; }
    tab.tags = [...(tab.tags || []), val];
    await send({ action: 'updateSavedTab', id: tab.id, patch: { tags: tab.tags } });
    input.value = '';
    renderPills();
    renderTagFilters();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      doAdd();
    } else if (e.key === 'Backspace' && input.value === '' && (tab.tags || []).length) {
      tab.tags = tab.tags.slice(0, -1);
      send({ action: 'updateSavedTab', id: tab.id, patch: { tags: tab.tags } });
      renderPills();
      renderTagFilters();
    }
  });

  return wrap;
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

  const groupMode = document.createElement('span');
  groupMode.className = 'snapshot-badge-groups';
  groupMode.textContent = 'groups ignored';
  groupMode.style.display = snapshot.ignoresGroups ? '' : 'none';

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
  header.appendChild(groupMode);
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
    tabsEl.innerHTML = '<div style="color:var(--text-muted);padding:8px 0;font-size:13px">No tabs captured.</div>';
  } else {
    const groupMap = new Map((snapshot.groups || []).map((g) => [g.id, g]));
    let lastGroupId = undefined;
    let currentGroupWrap = null;

    snapshot.tabs.forEach((t) => {
      const groupId = t.groupId ?? -1;

      if (groupId !== -1 && groupId !== lastGroupId) {
        const group = groupMap.get(groupId);
        const color = group?.color || 'grey';
        currentGroupWrap = document.createElement('div');
        currentGroupWrap.className = `snapshot-group-wrap snapshot-group-${color}`;
        tabsEl.appendChild(currentGroupWrap);

        const groupHeader = document.createElement('div');
        groupHeader.className = `snapshot-group-header snapshot-group-${color}`;
        groupHeader.textContent = group?.title || 'Unnamed group';
        currentGroupWrap.appendChild(groupHeader);
      } else if (groupId === -1) {
        currentGroupWrap = null;
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
      openBtn.className = 'btn btn-ghost btn-icon';
      openBtn.title = 'Open tab';
      openBtn.appendChild(makeIcon('open-in-new'));
      openBtn.onclick = () => send({ action: 'restoreBackupTab', url: t.url });

      row.appendChild(title);
      row.appendChild(url);
      row.appendChild(openBtn);
      (currentGroupWrap || tabsEl).appendChild(row);
    });
  }

  card.appendChild(tabsEl);
  return card;
}

// ─── Archive section ──────────────────────────────────────────────────────────
function getTimeBucket(ms) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const entryDay = new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), new Date(ms).getDate());
  const diffDays = Math.round((today - entryDay) / 86400000);

  if (diffDays === 0) return { key: 0, label: 'Today' };
  if (diffDays === 1) return { key: 1, label: 'Yesterday' };

  const dow = today.getDay();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  if (entryDay >= startOfWeek) return { key: 2, label: 'This Week' };

  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfWeek.getDate() - 7);
  if (entryDay >= startOfLastWeek) return { key: 3, label: 'Last Week' };

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (entryDay >= startOfMonth) return { key: 4, label: 'This Month' };

  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  if (entryDay >= startOfLastMonth) return { key: 5, label: 'Last Month' };

  return { key: 6, label: 'Older' };
}

function renderArchive() {
  const container = document.getElementById('archiveList');
  const noteEl = document.getElementById('archivePurgeNote');
  const purgeDays = state.settings.archivePurgeDays ?? 30;
  const query = (document.getElementById('archiveSearch')?.value || '').trim().toLowerCase();

  noteEl.textContent = purgeDays === 0
    ? 'Archive is kept forever (no purge configured).'
    : `Archived stale tabs are permanently removed after ${purgeDays} day${purgeDays !== 1 ? 's' : ''}.`;

  const entries = [...state.archiveList].reverse().filter((entry) => {
    if (!query) return true;
    return entry.title.toLowerCase().includes(query) || entry.url.toLowerCase().includes(query);
  });

  if (entries.length === 0) {
    container.innerHTML = query
      ? '<div class="empty-state">No results.</div>'
      : '<div class="empty-state">No archived tabs.</div>';
    return;
  }

  container.innerHTML = '';
  let lastBucketKey = null;
  entries.forEach((entry) => {
    const bucket = getTimeBucket(entry.closedAt);
    if (bucket.key !== lastBucketKey) {
      const header = document.createElement('div');
      header.className = 'archive-group-header';
      header.textContent = bucket.label;
      container.appendChild(header);
      lastBucketKey = bucket.key;
    }
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

  const archivedAt = document.createElement('span');
  archivedAt.className = 'archive-meta archive-meta--archived';
  archivedAt.textContent = `Archived ${formatDaysAgo(entry.closedAt)}`;
  archivedAt.title = `Archived ${formatDate(entry.closedAt)}`;
  meta.appendChild(archivedAt);

  const purgeAt = document.createElement('span');
  const days = daysUntilPurge(entry.closedAt, purgeDays);
  purgeAt.className = 'archive-meta archive-meta--delete';
  if (purgeDays > 0 && days !== null && days <= 3) {
    purgeAt.classList.add('archive-meta--danger');
  }
  purgeAt.textContent = purgeCountdownText(entry.closedAt, purgeDays);
  purgeAt.title = purgeDays === 0
    ? 'Automatic deletion is disabled'
    : `Deletes after ${formatDate(entry.closedAt + purgeDays * 86400000)}`;
  meta.appendChild(purgeAt);

  const restoreBtn = document.createElement('button');
  restoreBtn.type = 'button';
  restoreBtn.className = 'btn btn-primary btn-icon';
  restoreBtn.title = 'Restore tab';
  restoreBtn.setAttribute('aria-label', 'Restore tab');
  restoreBtn.appendChild(makeIcon('open-in-new'));
  restoreBtn.onclick = async () => {
    await send({ action: 'restoreBackupTab', url: entry.url });
    await send({ action: 'deleteArchiveEntry', id: entry.id });
    state.archiveList = state.archiveList.filter((e) => e.id !== entry.id);
    render();
  };

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-ghost btn-icon';
  saveBtn.title = 'Move to Saved Tabs';
  saveBtn.setAttribute('aria-label', 'Move to Saved Tabs');
  saveBtn.appendChild(makeIcon('save'));
  saveBtn.onclick = async () => {
    await send({ action: 'archiveToSaved', id: entry.id });
    state.archiveList = state.archiveList.filter((e) => e.id !== entry.id);
    const { savedTabs } = await chrome.storage.local.get('savedTabs');
    state.savedTabs = savedTabs || [];
    render();
  };

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'btn btn-ghost btn-icon saved-delete-btn';
  deleteBtn.title = 'Delete';
  deleteBtn.setAttribute('aria-label', 'Delete archived tab');
  deleteBtn.appendChild(makeIcon('delete'));
  deleteBtn.onclick = async () => {
    await send({ action: 'deleteArchiveEntry', id: entry.id });
    state.archiveList = state.archiveList.filter((e) => e.id !== entry.id);
    render();
  };
  meta.appendChild(deleteBtn);
  meta.appendChild(saveBtn);
  meta.appendChild(restoreBtn);

  main.appendChild(meta);
  card.appendChild(main);
  return card;
}

// ─── Open tabs ────────────────────────────────────────────────────────────────
const otState = {
  tabs: [],
  sortCol: 'index',
  sortDir: 'asc',
  filter: 'all',
  selected: new Set(),
  loaded: false,
};

function otDomain(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

// Mirrors isSaveableTab in background.js (separate script, can't be shared directly).
function isManageableTab(t) {
  return t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://');
}

async function loadOpenTabs() {
  const [all, groups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
  ]);
  const manageable = all.filter(isManageableTab);

  const groupMap = new Map(groups.map(g => [g.id, g]));

  const urlCounts = new Map();
  for (const t of manageable) {
    const key = t.url.replace(/\/$/, '');
    urlCounts.set(key, (urlCounts.get(key) || 0) + 1);
  }

  otState.tabs = manageable
    .map(t => {
      const group = t.groupId != null && t.groupId !== -1 ? groupMap.get(t.groupId) : null;
      return {
        tabId: t.id,
        windowId: t.windowId,
        index: t.index,
        title: t.title || t.url,
        url: t.url,
        favIconUrl: t.favIconUrl || null,
        domain: otDomain(t.url),
        group: group ? (group.title || 'Unnamed group') : '',
        groupColor: group ? group.color : '',
        lastAccessed: t.lastAccessed || 0,
        pinned: t.pinned,
        active: t.active,
        isDupe: urlCounts.get(t.url.replace(/\/$/, '')) > 1,
      };
    });

  // Purge stale selections
  const tabIdSet = new Set(otState.tabs.map(t => t.tabId));
  for (const id of otState.selected) { if (!tabIdSet.has(id)) otState.selected.delete(id); }

  otState.loaded = true;
  renderOpenTabs();
}

function otGetVisible() {
  const query = (document.getElementById('otSearch')?.value || '').trim().toLowerCase();
  let tabs = otState.tabs.filter(t => {
    if (otState.filter === 'dupes') return t.isDupe;
    return true;
  });
  if (query) {
    tabs = tabs.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.url.toLowerCase().includes(query) ||
      t.domain.toLowerCase().includes(query)
    );
  }
  const pinned = tabs.filter(t => t.pinned);
  const unpinned = tabs.filter(t => !t.pinned);
  const { sortCol, sortDir } = otState;
  unpinned.sort((a, b) => {
    let av = a[sortCol], bv = b[sortCol];
    if (sortCol === 'lastAccessed' || sortCol === 'index') { av = av || 0; bv = bv || 0; }
    else { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  return [...pinned, ...unpinned];
}

function renderOpenTabs() {
  document.getElementById('openCount').textContent = otState.tabs.length;
  document.getElementById('otCountAll').textContent = otState.tabs.length;
  document.getElementById('otCountDupes').textContent = otState.tabs.filter(t => t.isDupe).length;

  document.querySelectorAll('.ot-sortable').forEach(th => {
    th.querySelector('.ot-sort-icon').textContent = th.dataset.col === otState.sortCol
      ? (otState.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  });

  const visible = otGetVisible();
  const body = document.getElementById('otBody');

  if (!otState.loaded) {
    body.innerHTML = '<tr><td colspan="8" class="ot-empty">Loading…</td></tr>';
    otUpdateBulkBar();
    return;
  }

  if (visible.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="ot-empty">No tabs match.</td></tr>';
    otUpdateBulkBar();
    return;
  }

  body.innerHTML = '';
  for (const tab of visible) {
    body.appendChild(otMakeRow(tab));
  }

  otUpdateBulkBar();
}

function otMakeRow(tab) {
  const tr = document.createElement('tr');
  if (tab.pinned) tr.classList.add('ot-pinned');
  if (otState.selected.has(tab.tabId)) tr.classList.add('ot-selected');

  // Checkbox / pin icon
  const tdChk = document.createElement('td');
  tdChk.className = 'ot-chk-cell';
  if (tab.pinned) {
    const pin = document.createElement('span');
    pin.className = 'ot-pin-icon-wrap';
    pin.title = 'Pinned';
    pin.appendChild(makeIcon('push-pin'));
    tdChk.appendChild(pin);
  } else {
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.className = 'ot-row-chk';
    chk.checked = otState.selected.has(tab.tabId);
    chk.onchange = () => {
      if (chk.checked) otState.selected.add(tab.tabId); else otState.selected.delete(tab.tabId);
      tr.classList.toggle('ot-selected', chk.checked);
      otUpdateBulkBar();
    };
    tdChk.appendChild(chk);
  }
  tr.appendChild(tdChk);

  // Position
  const tdPos = document.createElement('td');
  tdPos.className = 'ot-pos';
  tdPos.textContent = tab.index + 1;
  tr.appendChild(tdPos);

  // Favicon
  const tdFav = document.createElement('td');
  tdFav.appendChild(makeFavicon(tab.favIconUrl, tab.title));
  tr.appendChild(tdFav);

  // Title + URL
  const tdTitle = document.createElement('td');
  const titleRow = document.createElement('div');
  titleRow.className = 'ot-title-row';
  const titleEl = document.createElement('span');
  titleEl.className = 'ot-title ot-title-link';
  titleEl.textContent = tab.title;
  titleEl.title = 'Switch to tab';
  titleEl.onclick = () => send({ action: 'activateTab', tabId: tab.tabId, windowId: tab.windowId });
  titleRow.appendChild(titleEl);
  if (tab.isDupe) {
    const b = document.createElement('span');
    b.className = 'ot-badge ot-badge-dupe';
    b.textContent = 'dupe';
    titleRow.appendChild(b);
  }
  const urlEl = document.createElement('div');
  urlEl.className = 'ot-url';
  urlEl.textContent = tab.url;
  tdTitle.appendChild(titleRow);
  tdTitle.appendChild(urlEl);
  tr.appendChild(tdTitle);

  // Group
  const tdGroup = document.createElement('td');
  tdGroup.className = 'ot-group-cell';
  if (tab.groupColor) {
    const chip = document.createElement('span');
    chip.className = `ot-group-chip ot-group-${tab.groupColor}`;
    chip.textContent = tab.group;
    chip.title = `Group: ${tab.group}`;
    tdGroup.appendChild(chip);
  }
  tr.appendChild(tdGroup);

  // Domain
  const tdDomain = document.createElement('td');
  tdDomain.className = 'ot-domain';
  tdDomain.textContent = tab.domain;
  tr.appendChild(tdDomain);

  // Last accessed
  const tdAccessed = document.createElement('td');
  tdAccessed.className = 'ot-accessed';
  tdAccessed.textContent = tab.lastAccessed ? formatDaysAgo(tab.lastAccessed) : '—';
  tdAccessed.title = tab.lastAccessed ? formatDate(tab.lastAccessed) : '';
  tr.appendChild(tdAccessed);

  // Actions
  const tdActions = document.createElement('td');
  tdActions.className = 'ot-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn-ghost btn-sm btn-icon';
  saveBtn.title = 'Save & close';
  saveBtn.disabled = tab.pinned;
  saveBtn.appendChild(makeIcon('save'));
  saveBtn.onclick = async (e) => {
    e.stopPropagation();
    await send({ action: 'saveTabs', tabIds: [tab.tabId] });
    const data = await chrome.storage.local.get('savedTabs');
    state.savedTabs = data.savedTabs || [];
    otState.tabs = otState.tabs.filter(t => t.tabId !== tab.tabId);
    otState.selected.delete(tab.tabId);
    renderCounts();
    renderSaved();
    renderOpenTabs();
  };

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-ghost btn-sm btn-icon';
  closeBtn.title = 'Close tab';
  closeBtn.disabled = tab.pinned;
  closeBtn.appendChild(makeIcon('close'));
  closeBtn.onclick = async (e) => {
    e.stopPropagation();
    await send({ action: 'closeTabs', tabIds: [tab.tabId] });
    otState.tabs = otState.tabs.filter(t => t.tabId !== tab.tabId);
    otState.selected.delete(tab.tabId);
    renderOpenTabs();
  };

  tdActions.appendChild(saveBtn);
  tdActions.appendChild(closeBtn);
  tr.appendChild(tdActions);

  return tr;
}

function otUpdateBulkBar() {
  const bulk = document.getElementById('otBulk');
  const count = otState.selected.size;
  bulk.style.display = count > 0 ? 'flex' : 'none';
  document.getElementById('otSelCount').textContent = `${count} selected`;
}


// ─── Tab navigation ───────────────────────────────────────────────────────────
function activateSection(key) {
  const btn = document.querySelector(`.tab-btn[data-tab="${key}"]`);
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.section').forEach((s) => s.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`section-${key}`).classList.add('active');
  if (key === 'open' && !otState.loaded) loadOpenTabs();
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => activateSection(btn.dataset.tab));
});

// ─── Event bindings ───────────────────────────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('options.html');
});

document.getElementById('clearTagFilter').addEventListener('click', () => {
  state.activeTags.clear();
  renderSaved();
});

document.getElementById('archiveSearch').addEventListener('input', () => renderArchive());

document.getElementById('clearArchive').addEventListener('click', async () => {
  if (!confirm('Clear all archived tabs?')) return;
  await send({ action: 'clearArchive' });
  state.archiveList = [];
  render();
});

document.getElementById('clearSavedTabs').addEventListener('click', async () => {
  if (!confirm('Clear all saved tabs? This cannot be undone.')) return;
  await send({ action: 'clearSavedTabs' });
  state.savedTabs = [];
  state.activeTags.clear();
  render();
});

document.getElementById('clearBackupList').addEventListener('click', async () => {
  if (!confirm('Clear all backup snapshots? This cannot be undone.')) return;
  await send({ action: 'clearBackupList' });
  state.backupList = [];
  render();
});

document.getElementById('runBackupNow').addEventListener('click', async () => {
  const btn = document.getElementById('runBackupNow');
  btn.disabled = true;
  btn.textContent = 'Backing up…';
  await send({ action: 'runBackupNow' });
  const data = await chrome.storage.local.get('backupList');
  state.backupList = data.backupList || [];
  renderBackup();
  renderCounts();
  btn.disabled = false;
  btn.textContent = 'Backup now';
});

// ─── Open tabs event bindings ─────────────────────────────────────────────────
document.getElementById('refreshOpenTabs').addEventListener('click', () => loadOpenTabs());

document.getElementById('otSearch').addEventListener('input', () => renderOpenTabs());

document.getElementById('otFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-filter]');
  if (!btn) return;
  otState.filter = btn.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(b => b.classList.toggle('active', b === btn));
  otState.selected.clear();
  renderOpenTabs();
});


document.querySelectorAll('.ot-sortable').forEach(th => {
  th.addEventListener('click', () => {
    if (otState.sortCol === th.dataset.col) {
      otState.sortDir = otState.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      otState.sortCol = th.dataset.col;
      otState.sortDir = otState.sortCol === 'lastAccessed' ? 'asc' : 'asc';
    }
    renderOpenTabs();
  });
});


document.getElementById('otBulkSave').addEventListener('click', async () => {
  const ids = [...otState.selected];
  if (!ids.length) return;
  await send({ action: 'saveTabs', tabIds: ids });
  const data = await chrome.storage.local.get('savedTabs');
  state.savedTabs = data.savedTabs || [];
  otState.tabs = otState.tabs.filter(t => !otState.selected.has(t.tabId));
  otState.selected.clear();
  renderCounts();
  renderSaved();
  renderOpenTabs();
});

document.getElementById('otBulkClose').addEventListener('click', async () => {
  const ids = [...otState.selected];
  if (!ids.length) return;
  await send({ action: 'closeTabs', tabIds: ids });
  otState.tabs = otState.tabs.filter(t => !otState.selected.has(t.tabId));
  otState.selected.clear();
  renderOpenTabs();
});

document.getElementById('otBulkDeselect').addEventListener('click', () => {
  otState.selected.clear();
  renderOpenTabs();
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
