const DEFAULT_SETTINGS = {
  defaultManagerPage: 'open',
  iconAction: 'popup',
  backupEnabled: true,
  backupIntervalMinutes: 60,
  backupMaxSnapshots: 10,
  backupIgnoreGroups: false,
  archiveEnabled: true,
  archivePurgeDays: 30,
  archiveStaleThresholdDays: 14,
};

const NUMBER_FIELDS = {
  backupIntervalMinutes: { min: 1, max: 10080 },
  backupMaxSnapshots: { min: 1, max: 100 },
  archivePurgeDays: { min: 0, max: 3650 },
  archiveStaleThresholdDays: { min: 0, max: 365 },
};

const TOGGLE_FIELDS = ['backupEnabled', 'backupIgnoreGroups', 'archiveEnabled'];

// ─── Load settings into form ──────────────────────────────────────────────────
async function loadSettings() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  const s = {
    ...DEFAULT_SETTINGS,
    ...settings,
    archiveStaleThresholdDays:
      settings.archiveStaleThresholdDays ?? settings.staleTabThresholdDays ?? DEFAULT_SETTINGS.archiveStaleThresholdDays,
  };

  document.getElementById('defaultManagerPage').value = s.defaultManagerPage || 'open';
  document.getElementById('iconAction').value = s.iconAction || 'popup';
  document.getElementById('backupEnabled').checked = s.backupEnabled !== false;
  document.getElementById('backupIntervalMinutes').value = s.backupIntervalMinutes;
  document.getElementById('backupMaxSnapshots').value = s.backupMaxSnapshots;
  document.getElementById('backupIgnoreGroups').checked = s.backupIgnoreGroups === true;
  document.getElementById('archiveEnabled').checked = s.archiveEnabled !== false;
  document.getElementById('archivePurgeDays').value = s.archivePurgeDays;
  document.getElementById('archiveStaleThresholdDays').value = s.archiveStaleThresholdDays;

  updateBackupRowVisibility();
  updateArchiveRowVisibility();
}

function updateBackupRowVisibility() {
  const backupEnabled = document.getElementById('backupEnabled').checked;
  const archiveEnabled = document.getElementById('archiveEnabled').checked;
  const intervalEnabled = backupEnabled || archiveEnabled;
  document.getElementById('backupIntervalRow').style.opacity = intervalEnabled ? '1' : '0.4';
  document.getElementById('backupMaxRow').style.opacity = backupEnabled ? '1' : '0.4';
  document.getElementById('backupIgnoreGroupsRow').style.opacity = backupEnabled ? '1' : '0.4';
  document.getElementById('backupIntervalMinutes').disabled = !intervalEnabled;
  document.getElementById('backupMaxSnapshots').disabled = !backupEnabled;
  document.getElementById('backupIgnoreGroups').disabled = !backupEnabled;
}

function updateArchiveRowVisibility() {
  const enabled = document.getElementById('archiveEnabled').checked;
  document.getElementById('archiveStaleThresholdRow').style.opacity = enabled ? '1' : '0.4';
  document.getElementById('archivePurgeRow').style.opacity = enabled ? '1' : '0.4';
  document.getElementById('archiveStaleThresholdDays').disabled = !enabled;
  document.getElementById('archivePurgeDays').disabled = !enabled;
}

// ─── Autosave ─────────────────────────────────────────────────────────────────
async function saveField(key, value) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  await chrome.runtime.sendMessage({
    action: 'updateSettings',
    settings: { ...DEFAULT_SETTINGS, ...settings, [key]: value },
  });
}

function flashSaved(wrap) {
  wrap.classList.remove('saved');
  void wrap.offsetWidth;
  wrap.classList.add('saved');
  setTimeout(() => wrap.classList.remove('saved'), 600);
}

function showError(key, msg) {
  const errEl = document.querySelector(`.form-error[data-for="${key}"]`);
  if (errEl) {
    errEl.textContent = msg;
    errEl.classList.add('visible');
  }
  document.getElementById(key).closest('.num-input-wrap').classList.add('error');
}

function clearError(key) {
  const errEl = document.querySelector(`.form-error[data-for="${key}"]`);
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('visible');
  }
  document.getElementById(key).closest('.num-input-wrap').classList.remove('error');
}

async function restoreFieldFromStorage(key) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  document.getElementById(key).value = merged[key];
}

function bindNumberField(key) {
  const input = document.getElementById(key);
  const wrap = input.closest('.num-input-wrap');
  const { min, max } = NUMBER_FIELDS[key];

  input.addEventListener('change', async () => {
    const raw = input.value.trim();
    if (raw === '') {
      clearError(key);
      await restoreFieldFromStorage(key);
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) {
      showError(key, 'Must be a number.');
      return;
    }
    if (n < min) { showError(key, `Must be at least ${min}.`); return; }
    if (n > max) { showError(key, `Must be at most ${max}.`); return; }

    clearError(key);
    await saveField(key, n);
    flashSaved(wrap);
  });
}

function bindToggleField(key) {
  const input = document.getElementById(key);
  input.addEventListener('change', async () => {
    await saveField(key, input.checked);
  });
}

Object.keys(NUMBER_FIELDS).forEach(bindNumberField);
TOGGLE_FIELDS.forEach(bindToggleField);

document.getElementById('defaultManagerPage').addEventListener('change', (e) => {
  saveField('defaultManagerPage', e.target.value);
});

document.getElementById('iconAction').addEventListener('change', (e) => {
  saveField('iconAction', e.target.value);
});

document.getElementById('backupEnabled').addEventListener('change', updateBackupRowVisibility);
document.getElementById('archiveEnabled').addEventListener('change', () => {
  updateBackupRowVisibility();
  updateArchiveRowVisibility();
});

// ─── Storage management ───────────────────────────────────────────────────────
document.getElementById('exportData').addEventListener('click', async () => {
  const data = await chrome.storage.local.get(['savedTabs', 'backupList', 'archiveList', 'settings']);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tab-manager-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// ─── Import modal ─────────────────────────────────────────────────────────────
const importDialog = document.getElementById('importDialog');
const dropZone = document.getElementById('dropZone');
const dropZonePrimary = document.getElementById('dropZonePrimary');
const dropZoneSecondary = document.getElementById('dropZoneSecondary');
const importFileInput = document.getElementById('importFile');
const importError = document.getElementById('importError');
const confirmImportBtn = document.getElementById('confirmImport');

let pendingImport = null;

function resetImportDialog() {
  pendingImport = null;
  importFileInput.value = '';
  dropZone.classList.remove('has-file', 'dragover');
  dropZonePrimary.textContent = 'Drop a backup file here';
  dropZoneSecondary.textContent = 'or click to choose';
  importError.hidden = true;
  importError.textContent = '';
  confirmImportBtn.disabled = true;
}

function showImportError(msg) {
  importError.textContent = msg;
  importError.hidden = false;
  pendingImport = null;
  confirmImportBtn.disabled = true;
}

async function loadImportFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const keys = ['savedTabs', 'backupList', 'archiveList', 'settings'];
    const valid = keys.some((k) => k in data);
    if (!valid) {
      showImportError('Invalid export file. No recognized data found.');
      return;
    }
    pendingImport = {};
    keys.forEach((k) => { if (k in data) pendingImport[k] = data[k]; });
    importError.hidden = true;
    dropZone.classList.add('has-file');
    dropZonePrimary.textContent = file.name;
    dropZoneSecondary.textContent = `${(file.size / 1024).toFixed(1)} KB ready to import`;
    confirmImportBtn.disabled = false;
  } catch {
    showImportError('Failed to read file. Must be a valid Tab Manager export.');
  }
}

document.getElementById('importData').addEventListener('click', () => {
  resetImportDialog();
  importDialog.showModal();
});

document.getElementById('closeImport').addEventListener('click', () => importDialog.close());
document.getElementById('cancelImport').addEventListener('click', () => importDialog.close());

importDialog.addEventListener('close', resetImportDialog);

dropZone.addEventListener('click', () => importFileInput.click());
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    importFileInput.click();
  }
});

importFileInput.addEventListener('change', (e) => {
  loadImportFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
});
['dragleave'].forEach((ev) => {
  dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover'));
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) loadImportFile(file);
});

confirmImportBtn.addEventListener('click', async () => {
  if (!pendingImport) return;
  await chrome.storage.local.set(pendingImport);
  importDialog.close();
  location.reload();
});

// ─── Storage usage ────────────────────────────────────────────────────────────
const USAGE_SEGMENTS = [
  { id: 'segSaved',   key: 'savedTabs',   label: 'Saved',   dotClass: 'legend-dot--saved' },
  { id: 'segArchive', key: 'archiveList', label: 'Archive', dotClass: 'legend-dot--archive' },
  { id: 'segBackup',  key: 'backupList',  label: 'Backups', dotClass: 'legend-dot--backup' },
  { id: 'segOther',   key: null,          label: 'Other',   dotClass: 'legend-dot--other' },
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadStorageUsage() {
  const QUOTA = chrome.storage.local.QUOTA_BYTES;
  const [total, savedBytes, archiveBytes, backupBytes] = await Promise.all([
    chrome.storage.local.getBytesInUse(null),
    chrome.storage.local.getBytesInUse('savedTabs'),
    chrome.storage.local.getBytesInUse('archiveList'),
    chrome.storage.local.getBytesInUse('backupList'),
  ]);

  const knownBytes = savedBytes + archiveBytes + backupBytes;
  const otherBytes = Math.max(0, total - knownBytes);

  const bytesMap = { segSaved: savedBytes, segArchive: archiveBytes, segBackup: backupBytes, segOther: otherBytes };

  const legend = document.getElementById('storageLegend');
  legend.innerHTML = '';

  for (const seg of USAGE_SEGMENTS) {
    const bytes = bytesMap[seg.id];
    const pct = QUOTA > 0 ? (bytes / QUOTA) * 100 : 0;
    const segEl = document.getElementById(seg.id);
    segEl.style.width = `${pct}%`;

    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = `legend-dot ${seg.dotClass}`;
    const labelEl = document.createElement('span');
    labelEl.className = 'legend-label';
    labelEl.textContent = seg.label;
    const bytesEl = document.createElement('span');
    bytesEl.className = 'legend-bytes';
    bytesEl.textContent = formatBytes(bytes);
    item.append(dot, labelEl, bytesEl);
    legend.appendChild(item);
  }

  const pctUsed = QUOTA > 0 ? ((total / QUOTA) * 100).toFixed(1) : '0';
  document.getElementById('storageTotal').textContent =
    `${formatBytes(total)} of ${formatBytes(QUOTA)} used (${pctUsed}%)`;
}

// ─── Navigation ──────────────────────────────────────────────────────────────
document.querySelector('.app-title').addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('manager.html');
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
loadStorageUsage();
