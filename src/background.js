// ─── Default settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  defaultManagerPage: "open",
  iconAction: "popup",
  backupEnabled: true,
  backupIntervalMinutes: 60,
  backupMaxSnapshots: 10,
  backupIgnoreGroups: false,
  archiveEnabled: true,
  archivePurgeDays: 30,
  archiveStaleThresholdDays: 14,
};


// ─── Dev badge ───────────────────────────────────────────────────────────────
if (!chrome.runtime.getManifest().update_url) {
  chrome.action.setBadgeText({ text: "β" });
  chrome.action.setBadgeBackgroundColor({ color: "#e8710a" });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async () => {
  await initSettings();
  await applyIconActionFromStorage();
  await rescheduleAlarms();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "openTabManager",
      title: "Open Tab Manager",
      contexts: ["action"],
    });
  });
});

// Toggle whether the toolbar icon opens the popup or jumps straight to the
// manager page. Empty popup string makes chrome.action.onClicked fire instead.
async function applyIconAction(iconAction) {
  const popup = iconAction === "page" ? "" : "popup.html";
  try {
    await chrome.action.setPopup({ popup });
  } catch (e) {
    // ignore — action may be unavailable in some contexts
  }
}

chrome.action.onClicked.addListener(() => {
  openOrFocusTab(chrome.runtime.getURL("manager.html"));
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
});

chrome.runtime.onStartup.addListener(async () => {
  await applyIconActionFromStorage();
  await rescheduleAlarms();
});

async function applyIconActionFromStorage() {
  const { settings } = await chrome.storage.local.get("settings");
  await applyIconAction(settings?.iconAction || DEFAULT_SETTINGS.iconAction);
}

async function initSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  if (!settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  } else {
    // Fill in any missing keys from defaults (handles extension updates)
    const legacyStaleThreshold = settings.staleTabThresholdDays;
    const merged = {
      ...DEFAULT_SETTINGS,
      ...settings,
      archiveStaleThresholdDays:
        settings.archiveStaleThresholdDays ?? legacyStaleThreshold ?? DEFAULT_SETTINGS.archiveStaleThresholdDays,
    };
    delete merged.staleTabThresholdDays;
    delete merged.staleThresholdDays;
    await chrome.storage.local.set({ settings: merged });
  }
}

// ─── Alarms ──────────────────────────────────────────────────────────────────
async function rescheduleAlarms() {
  await chrome.alarms.clearAll();

  const { settings = DEFAULT_SETTINGS } =
    await chrome.storage.local.get("settings");

  if (settings.backupEnabled !== false || settings.archiveEnabled !== false) {
    const period = Math.max(1, settings.backupIntervalMinutes || 60);
    chrome.alarms.create("backup", { periodInMinutes: period });
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "backup") {
    await runBackup();
    await runStaleArchive();
    await runArchivePurge();
  }
});

async function runBackup() {
  const { settings = DEFAULT_SETTINGS } =
    await chrome.storage.local.get("settings");
  if (settings.backupEnabled === false) return;

  const maxSnapshots = settings.backupMaxSnapshots || 10;

  const ignoreGroups = settings.backupIgnoreGroups === true;
  const allTabs = await chrome.tabs.query({});
  const allGroups = ignoreGroups ? [] : await chrome.tabGroups.query({});
  const snapshot = {
    id: crypto.randomUUID(),
    capturedAt: Date.now(),
    ignoresGroups: ignoreGroups,
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
      .map((t) => {
        const entry = {
          url: t.url,
          title: t.title || t.url,
          favIconUrl: t.favIconUrl || null,
        };
        if (!ignoreGroups) entry.groupId = t.groupId;
        return entry;
      }),
  };

  const { backupList = [] } = await chrome.storage.local.get("backupList");
  backupList.push(snapshot);
  const trimmed = backupList.slice(-Math.max(1, maxSnapshots));
  await chrome.storage.local.set({ backupList: trimmed });
}

async function runStaleArchive() {
  const { settings = DEFAULT_SETTINGS, archiveList = [] } =
    await chrome.storage.local.get(["settings", "archiveList"]);

  if (settings.archiveEnabled === false) return;

  const thresholdDays =
    settings.archiveStaleThresholdDays ??
    settings.staleTabThresholdDays ??
    DEFAULT_SETTINGS.archiveStaleThresholdDays;
  if (thresholdDays <= 0) return;

  const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000;
  const allTabs = await chrome.tabs.query({});
  const staleTabs = allTabs.filter(
    (tab) =>
      isSaveableTab(tab) &&
      !tab.pinned &&
      !tab.active &&
      tab.lastAccessed !== undefined &&
      tab.lastAccessed < cutoff,
  );

  if (staleTabs.length === 0) return;

  const now = Date.now();
  const entries = staleTabs.map((tab) => ({
    id: crypto.randomUUID(),
    url: tab.url,
    title: tab.title || tab.url,
    favIconUrl: tab.favIconUrl || null,
    closedAt: now,
  }));

  await chrome.storage.local.set({ archiveList: archiveList.concat(entries) });

  await chrome.tabs.remove(staleTabs.map((tab) => tab.id));
}

async function runArchivePurge() {
  const { settings = DEFAULT_SETTINGS, archiveList = [] } =
    await chrome.storage.local.get(["settings", "archiveList"]);
  if (settings.archiveEnabled === false) return;

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
      savedAt: Date.now(),
  };
}

function numberSetting(value, fallback, min) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, parsed);
}

function staleSetting(settings, key, legacyFallback) {
  return numberSetting(
    settings[key] ?? settings.staleTabThresholdDays,
    legacyFallback,
    0,
  );
}


// ─── Message handler (from popup.js / options.js) ────────────────────────────
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

    case "archiveToSaved": {
      const { archiveList = [], savedTabs = [] } =
        await chrome.storage.local.get(["archiveList", "savedTabs"]);
      const entry = archiveList.find((e) => e.id === msg.id);
      if (!entry) return { ok: false, error: "Not found" };
      const saved = makeSavedTabEntry({
        url: entry.url,
        title: entry.title,
        favIconUrl: entry.favIconUrl,
      });
      const filtered = archiveList.filter((e) => e.id !== msg.id);
      try {
        await chrome.storage.local.set({
          savedTabs: savedTabs.concat(saved),
          archiveList: filtered,
        });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }
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
        defaultManagerPage: ["saved", "open", "backup", "archive"].includes(
          s.defaultManagerPage,
        )
          ? s.defaultManagerPage
          : DEFAULT_SETTINGS.defaultManagerPage,
        iconAction: ["popup", "page"].includes(s.iconAction)
          ? s.iconAction
          : DEFAULT_SETTINGS.iconAction,
        backupEnabled: Boolean(s.backupEnabled),
        backupIgnoreGroups: Boolean(s.backupIgnoreGroups),
        backupIntervalMinutes: numberSetting(
          s.backupIntervalMinutes,
          DEFAULT_SETTINGS.backupIntervalMinutes,
          1,
        ),
        backupMaxSnapshots: numberSetting(
          s.backupMaxSnapshots,
          DEFAULT_SETTINGS.backupMaxSnapshots,
          1,
        ),
        archiveEnabled: Boolean(s.archiveEnabled),
        archivePurgeDays: numberSetting(
          s.archivePurgeDays,
          DEFAULT_SETTINGS.archivePurgeDays,
          0,
        ),
        archiveStaleThresholdDays: staleSetting(
          s,
          "archiveStaleThresholdDays",
          DEFAULT_SETTINGS.archiveStaleThresholdDays,
        ),
      };
      await chrome.storage.local.set({ settings: validated });
      await rescheduleAlarms();
      await applyIconAction(validated.iconAction);
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
      };
      const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
      savedTabs.push(entry);
      try {
        await chrome.storage.local.set({ savedTabs });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }
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
      await chrome.tabs.remove(tabIds);
      return { ok: true, saved: tabIds.length, closed: tabIds.length };
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

      await chrome.tabs.remove(closeable);
      return { ok: true, closed: closeable.length };
    }

    case "activateTab": {
      const tabId = msg.tabId;
      if (typeof tabId !== "number") return { ok: false, error: "No tabId" };
      try {
        const tab = await chrome.tabs.get(tabId);
        await chrome.tabs.update(tabId, { active: true });
        if (tab.windowId != null) {
          await chrome.windows.update(tab.windowId, { focused: true });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: "Tab not found" };
      }
    }

    default:
      return { ok: false, error: "Unknown action" };
  }
}
