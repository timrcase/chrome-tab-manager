const DEFAULT_SETTINGS = {
  backupEnabled: true,
  backupIntervalMinutes: 60,
  backupMaxSnapshots: 10,
  archiveEnabled: true,
  archivePurgeDays: 30,
  staleTabThresholdDays: 14,
};

// ─── Load settings into form ──────────────────────────────────────────────────
async function loadSettings() {
  const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULT_SETTINGS, ...settings };

  document.getElementById('backupEnabled').checked = s.backupEnabled !== false;
  document.getElementById('backupIntervalMinutes').value = s.backupIntervalMinutes;
  document.getElementById('backupMaxSnapshots').value = s.backupMaxSnapshots;
  document.getElementById('archiveEnabled').checked = s.archiveEnabled !== false;
  document.getElementById('archivePurgeDays').value = s.archivePurgeDays;
  document.getElementById('staleTabThresholdDays').value = s.staleTabThresholdDays;

  updateBackupRowVisibility();
}

function updateBackupRowVisibility() {
  const enabled = document.getElementById('backupEnabled').checked;
  document.getElementById('backupIntervalRow').style.opacity = enabled ? '1' : '0.4';
  document.getElementById('backupMaxRow').style.opacity = enabled ? '1' : '0.4';
  document.getElementById('backupIntervalMinutes').disabled = !enabled;
  document.getElementById('backupMaxSnapshots').disabled = !enabled;
}

document.getElementById('backupEnabled').addEventListener('change', updateBackupRowVisibility);

// ─── Save settings ────────────────────────────────────────────────────────────
document.getElementById('saveSettings').addEventListener('click', async () => {
  const backupIntervalMinutes = Math.max(1, parseInt(document.getElementById('backupIntervalMinutes').value, 10) || 60);
  const backupMaxSnapshots = Math.max(1, parseInt(document.getElementById('backupMaxSnapshots').value, 10) || 10);
  const archivePurgeDays = Math.max(0, parseInt(document.getElementById('archivePurgeDays').value, 10) || 0);
  const staleTabThresholdDays = Math.max(0, parseInt(document.getElementById('staleTabThresholdDays').value, 10) || 0);

  const settings = {
    backupEnabled: document.getElementById('backupEnabled').checked,
    backupIntervalMinutes,
    backupMaxSnapshots,
    archiveEnabled: document.getElementById('archiveEnabled').checked,
    archivePurgeDays,
    staleTabThresholdDays,
  };

  // Update inputs to reflect clamped values
  document.getElementById('backupIntervalMinutes').value = backupIntervalMinutes;
  document.getElementById('backupMaxSnapshots').value = backupMaxSnapshots;
  document.getElementById('archivePurgeDays').value = archivePurgeDays;
  document.getElementById('staleTabThresholdDays').value = staleTabThresholdDays;

  await chrome.runtime.sendMessage({ action: 'updateSettings', settings });

  const msg = document.getElementById('saveMsg');
  msg.classList.add('visible');
  setTimeout(() => msg.classList.remove('visible'), 2500);
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

document.getElementById('clearSavedTabs').addEventListener('click', async () => {
  if (!confirm('Clear all saved tabs? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ action: 'clearSavedTabs' });
});

document.getElementById('clearBackupList').addEventListener('click', async () => {
  if (!confirm('Clear all backup snapshots? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ action: 'clearBackupList' });
});

document.getElementById('clearArchive').addEventListener('click', async () => {
  if (!confirm('Clear the entire archive? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ action: 'clearArchive' });
});

// ─── Storage usage ────────────────────────────────────────────────────────────
const USAGE_SEGMENTS = [
  { id: 'segSaved',   key: 'savedTabs',  label: 'Saved',   color: '#3dba6e' },
  { id: 'segArchive', key: 'archiveList', label: 'Archive', color: '#5a9a8a' },
  { id: 'segBackup',  key: 'backupList',  label: 'Backups', color: '#9aba3d' },
  { id: 'segOther',   key: null,          label: 'Other',   color: '#3a5a3a' },
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
    document.getElementById(seg.id).style.width = `${pct}%`;

    const item = document.createElement('div');
    item.className = 'legend-item';
    const dot = document.createElement('span');
    dot.className = 'legend-dot';
    dot.style.background = seg.color;
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

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
loadStorageUsage();
