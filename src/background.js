// ─── In-memory state ────────────────────────────────────────────────────────
// Maps Chrome tab IDs to their last-known data so onRemoved can archive them.
const tabCache = new Map();

// Tab IDs closed by the extension itself — skip archiving these.
const tabsClosedByExtension = new Set();

// ─── Default settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  backupEnabled: true,
  backupIntervalMinutes: 60,
  backupMaxSnapshots: 10,
  archiveEnabled: true,
  archivePurgeDays: 30,
  staleTabThresholdDays: 14,
};

// ─── Dev badge ───────────────────────────────────────────────────────────────
if (!chrome.runtime.getManifest().update_url) {
  chrome.action.setBadgeText({ text: "β" });
  chrome.action.setBadgeBackgroundColor({ color: "#e8710a" });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await initSettings();
  await warmTabCache();
  await rescheduleAlarms();
  chrome.omnibox.setDefaultSuggestion({
    description: "Type a go code to navigate",
  });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "openTabManager",
      title: "Open Tab Manager",
      contexts: ["action"],
    });
    chrome.contextMenus.create({
      id: "openCleanupPage",
      title: "Cleanup Tabs",
      contexts: ["action"],
    });
  });
});

async function openOrFocusTab(url) {
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find((t) => t.url === url);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    chrome.tabs.create({ url });
  }
}

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === "openTabManager")
    openOrFocusTab(chrome.runtime.getURL("manager.html"));
  if (info.menuItemId === "openCleanupPage")
    openOrFocusTab(chrome.runtime.getURL("cleanup.html"));
});

chrome.runtime.onStartup.addListener(async () => {
  await warmTabCache();
  await rescheduleAlarms();
});

async function initSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    // Fill in any missing keys from defaults (handles extension updates)
    const merged = { ...DEFAULT_SETTINGS, ...settings };
    await chrome.storage.local.set({ settings: merged });
  }
}

async function warmTabCache() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (
      tab.url &&
      !tab.url.startsWith("chrome://") &&
      !tab.url.startsWith("chrome-extension://")
    ) {
      tabCache.set(tab.id, {
        url: tab.url,
        title: tab.title || tab.url,
        favIconUrl: tab.favIconUrl || null,
      });
    }
  }
}

// ─── Tab tracking ────────────────────────────────────────────────────────────
chrome.tabs.onCreated.addListener((tab) => {
  if (
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    tabCache.set(tab.id, {
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || null,
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    tab.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  ) {
    tabCache.set(tabId, {
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || null,
    });
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  if (tabsClosedByExtension.has(tabId)) {
    tabsClosedByExtension.delete(tabId);
    tabCache.delete(tabId);
    return;
  }

  const cached = tabCache.get(tabId);
  tabCache.delete(tabId);

  if (!cached) return;

  const { settings = DEFAULT_SETTINGS } =
    await chrome.storage.local.get("settings");
  if (settings.archiveEnabled === false) return;

  const entry = {
    id: crypto.randomUUID(),
    url: cached.url,
    title: cached.title,
    favIconUrl: cached.favIconUrl,
    closedAt: Date.now(),
  };

  const { archiveList = [] } = await chrome.storage.local.get("archiveList");
  archiveList.push(entry);
  await chrome.storage.local.set({ archiveList });
});

// ─── Omnibox ─────────────────────────────────────────────────────────────────
function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const query = text.trim().toLowerCase();
  if (!query) {
    suggest([]);
    return;
  }

  const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
  const matches = savedTabs.filter(
    (t) => t.goCode && t.goCode.toLowerCase().startsWith(query),
  );

  suggest(
    matches.map((t) => ({
      content: t.goCode,
      description: `<match>${escapeXml(t.goCode)}</match> — <dim>${escapeXml(t.title)}</dim>`,
    })),
  );
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const code = text.trim().toLowerCase();
  const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
  const match = savedTabs.find(
    (t) => t.goCode && t.goCode.toLowerCase() === code,
  );

  if (!match) return;

  const url = match.url;
  if (disposition === "currentTab") {
    chrome.tabs.update({ url });
  } else if (disposition === "newForegroundTab") {
    chrome.tabs.create({ url, active: true });
  } else {
    chrome.tabs.create({ url, active: false });
  }
});

// ─── Alarms ──────────────────────────────────────────────────────────────────
async function rescheduleAlarms() {
  await chrome.alarms.clearAll();

  const { settings = DEFAULT_SETTINGS } =
    await chrome.storage.local.get("settings");

  if (settings.backupEnabled !== false) {
    const period = Math.max(1, settings.backupIntervalMinutes || 60);
    chrome.alarms.create("backup", { periodInMinutes: period });
  }

  // Archive purge runs daily
  chrome.alarms.create("archivePurge", { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "backup") await runBackup();
  if (alarm.name === "archivePurge") await runArchivePurge();
});

async function runBackup() {
  const { settings = DEFAULT_SETTINGS } =
    await chrome.storage.local.get("settings");
  const maxSnapshots = settings.backupMaxSnapshots || 10;

  const [allTabs, allGroups] = await Promise.all([
    chrome.tabs.query({}),
    chrome.tabGroups.query({}),
  ]);
  const snapshot = {
    id: crypto.randomUUID(),
    capturedAt: Date.now(),
    groups: allGroups.map((g) => ({
      id: g.id,
      title: g.title,
      color: g.color,
    })),
    tabs: allTabs
      .filter(
        (t) =>
          t.url &&
          !t.url.startsWith("chrome://") &&
          !t.url.startsWith("chrome-extension://"),
      )
      .map((t) => ({
        url: t.url,
        title: t.title || t.url,
        favIconUrl: t.favIconUrl || null,
        groupId: t.groupId,
      })),
  };

  const { backupList = [] } = await chrome.storage.local.get("backupList");
  backupList.push(snapshot);
  const trimmed = backupList.slice(-Math.max(1, maxSnapshots));
  await chrome.storage.local.set({ backupList: trimmed });
}

async function runArchivePurge() {
  const { settings = DEFAULT_SETTINGS, archiveList = [] } =
    await chrome.storage.local.get(["settings", "archiveList"]);
  const purgeDays = settings.archivePurgeDays ?? 30;

  if (purgeDays === 0) return; // 0 = never purge

  const cutoff = Date.now() - purgeDays * 24 * 60 * 60 * 1000;
  const filtered = archiveList.filter((entry) => entry.closedAt > cutoff);

  if (filtered.length !== archiveList.length) {
    await chrome.storage.local.set({ archiveList: filtered });
  }
}

function isSaveableTab(tab) {
  return (
    tab?.url &&
    !tab.url.startsWith("chrome://") &&
    !tab.url.startsWith("chrome-extension://")
  );
}

function makeSavedTabEntry(tab) {
  return {
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || null,
    tags: [],
    goCode: null,
    savedAt: Date.now(),
  };
}

// ─── Message handler (from popup.js / options.js / cleanup.js) ───────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.action) {
    case "updateSavedTab": {
      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      const idx = savedTabs.findIndex((t) => t.id === msg.id);
      if (idx === -1) return { ok: false };
      savedTabs[idx] = { ...savedTabs[idx], ...msg.patch };
      await chrome.storage.local.set({ savedTabs });
      return { ok: true };
    }

    case "deleteSavedTab": {
      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      const filtered = savedTabs.filter((t) => t.id !== msg.id);
      await chrome.storage.local.set({ savedTabs: filtered });
      return { ok: true };
    }

    case "restoreSavedTab": {
      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      const tab = savedTabs.find((t) => t.id === msg.id);
      if (tab) chrome.tabs.create({ url: tab.url, active: true });
      return { ok: true };
    }

    case "restoreSnapshot": {
      const { backupList = [] } = await chrome.storage.local.get("backupList");
      const snapshot = backupList.find((s) => s.id === msg.id);
      if (!snapshot || snapshot.tabs.length === 0) return { ok: false };

      const urls = snapshot.tabs.map((t) => t.url);
      const win = await chrome.windows.create({ url: urls, focused: true });

      if (snapshot.groups?.length && win.tabs?.length) {
        const groupMeta = new Map(snapshot.groups.map((g) => [g.id, g]));
        const groupTabs = new Map();
        snapshot.tabs.forEach((t, i) => {
          const gid = t.groupId ?? -1;
          if (gid !== -1) {
            if (!groupTabs.has(gid)) groupTabs.set(gid, []);
            groupTabs.get(gid).push(win.tabs[i].id);
          }
        });
        for (const [origId, tabIds] of groupTabs) {
          const meta = groupMeta.get(origId);
          const newGroupId = await chrome.tabs.group({
            tabIds,
            createProperties: { windowId: win.id },
          });
          if (meta) {
            const updateProps = { color: meta.color };
            if (meta.title) updateProps.title = meta.title;
            try {
              await chrome.tabGroups.update(newGroupId, updateProps);
            } catch (err) {
              console.error("tabGroups.update failed:", err.message);
            }
          }
        }
      }

      return { ok: true };
    }

    case "deleteBackupSnapshot": {
      const { backupList = [] } = await chrome.storage.local.get("backupList");
      const filtered = backupList.filter((s) => s.id !== msg.id);
      await chrome.storage.local.set({ backupList: filtered });
      return { ok: true };
    }

    case "restoreBackupTab": {
      const url = msg.url;
      if (!url || (!url.startsWith("https://") && !url.startsWith("http://"))) {
        return { ok: false, error: "Invalid URL" };
      }
      chrome.tabs.create({ url, active: true });
      return { ok: true };
    }

    case "deleteArchiveEntry": {
      const { archiveList = [] } =
        await chrome.storage.local.get("archiveList");
      const filtered = archiveList.filter((e) => e.id !== msg.id);
      await chrome.storage.local.set({ archiveList: filtered });
      return { ok: true };
    }

    case "clearArchive": {
      await chrome.storage.local.set({ archiveList: [] });
      return { ok: true };
    }

    case "clearSavedTabs": {
      await chrome.storage.local.set({ savedTabs: [] });
      return { ok: true };
    }

    case "clearBackupList": {
      await chrome.storage.local.set({ backupList: [] });
      return { ok: true };
    }

    case "updateSettings": {
      const s = msg.settings || {};
      const validated = {
        backupEnabled: Boolean(s.backupEnabled),
        backupIntervalMinutes: Math.max(
          1,
          parseInt(s.backupIntervalMinutes) ||
            DEFAULT_SETTINGS.backupIntervalMinutes,
        ),
        backupMaxSnapshots: Math.max(
          1,
          parseInt(s.backupMaxSnapshots) || DEFAULT_SETTINGS.backupMaxSnapshots,
        ),
        archiveEnabled: Boolean(s.archiveEnabled),
        archivePurgeDays: Math.max(
          0,
          parseInt(s.archivePurgeDays) || DEFAULT_SETTINGS.archivePurgeDays,
        ),
        staleTabThresholdDays: Math.max(
          0,
          parseInt(s.staleTabThresholdDays) || 0,
        ),
      };
      await chrome.storage.local.set({ settings: validated });
      await rescheduleAlarms();
      return { ok: true };
    }

    case "runBackupNow": {
      await runBackup();
      return { ok: true };
    }

    case "saveCurrentTab": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!isSaveableTab(tab)) {
        return { ok: false, reason: "unsaveable" };
      }
      const entry = {
        ...makeSavedTabEntry(tab),
        tags: msg.tags || [],
        goCode: msg.goCode || null,
      };
      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      savedTabs.push(entry);
      try {
        await chrome.storage.local.set({ savedTabs });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }
      tabsClosedByExtension.add(tab.id);
      await chrome.tabs.remove(tab.id);
      return { ok: true };
    }

    case "saveTabs": {
      const ids = Array.isArray(msg.tabIds) ? msg.tabIds : [];
      if (ids.length === 0) return { ok: true, saved: 0, closed: 0 };

      const requestedIds = new Set(ids);
      const allTabs = await chrome.tabs.query({});
      const saveable = allTabs.filter(
        (tab) => requestedIds.has(tab.id) && !tab.pinned && isSaveableTab(tab),
      );

      if (saveable.length === 0) return { ok: true, saved: 0, closed: 0 };

      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      const entries = saveable.map(makeSavedTabEntry);
      try {
        await chrome.storage.local.set({ savedTabs: savedTabs.concat(entries) });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }

      const tabIds = saveable.map((tab) => tab.id);
      tabIds.forEach((id) => tabsClosedByExtension.add(id));
      await chrome.tabs.remove(tabIds);
      return { ok: true, saved: tabIds.length, closed: tabIds.length };
    }

    case "getCleanupData": {
      const { settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get("settings");
      const allTabs = await chrome.tabs.query({});

      const usableTabs = allTabs.filter(
        (t) =>
          t.url &&
          !t.url.startsWith("chrome://") &&
          !t.url.startsWith("chrome-extension://"),
      );

      // Duplicates: group by normalized URL
      const urlGroups = new Map();
      for (const tab of usableTabs) {
        const key = tab.url.replace(/\/$/, "");
        if (!urlGroups.has(key)) urlGroups.set(key, []);
        urlGroups.get(key).push(tab);
      }
      const duplicateGroups = [];
      for (const [url, tabs] of urlGroups) {
        if (tabs.length < 2) continue;
        duplicateGroups.push({
          url,
          tabs: tabs.map((t) => ({
            tabId: t.id,
            title: t.title || t.url,
            url: t.url,
            favIconUrl: t.favIconUrl || null,
            pinned: t.pinned,
            active: t.active,
            openedAt: t.lastAccessed ?? null,
          })),
        });
      }

      // Stale tabs — based on lastAccessed (native Chrome property)
      const thresholdDays =
        settings.staleTabThresholdDays ??
        DEFAULT_SETTINGS.staleTabThresholdDays;
      let staleTabs = [];
      if (thresholdDays > 0) {
        const cutoff = Date.now() - thresholdDays * 86400000;
        staleTabs = usableTabs
          .filter(
            (t) => t.lastAccessed !== undefined && t.lastAccessed < cutoff,
          )
          .map((t) => ({
            tabId: t.id,
            title: t.title || t.url,
            url: t.url,
            favIconUrl: t.favIconUrl || null,
            pinned: t.pinned,
            active: t.active,
            openedAt: t.lastAccessed,
          }))
          .sort((a, b) => a.openedAt - b.openedAt);
      }

      return {
        ok: true,
        duplicateGroups,
        staleTabs,
        staleThresholdDays: thresholdDays,
        totalOpen: usableTabs.length,
      };
    }

    case "closeTabs": {
      const ids = Array.isArray(msg.tabIds) ? msg.tabIds : [];
      if (ids.length === 0) return { ok: true, closed: 0 };

      // Race condition guard: filter to existing, non-pinned tabs
      const allTabs = await chrome.tabs.query({});
      const existingIds = new Set(allTabs.map((t) => t.id));
      const pinnedIds = new Set(
        allTabs.filter((t) => t.pinned).map((t) => t.id),
      );
      const closeable = ids.filter(
        (id) => existingIds.has(id) && !pinnedIds.has(id),
      );

      if (closeable.length === 0) return { ok: true, closed: 0 };

      closeable.forEach((id) => tabsClosedByExtension.add(id));
      await chrome.tabs.remove(closeable);
      return { ok: true, closed: closeable.length };
    }

    default:
      return { ok: false, error: "Unknown action" };
  }
}
