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

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
