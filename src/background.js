// ─── Default settings ────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  defaultManagerPage: "open",
  iconAction: "popup",
  runIntervalMinutes: 60,
  backupEnabled: true,
  backupMaxSnapshots: 10,
  backupIgnoreGroups: false,
  archiveEnabled: true,
  archivePurgeDays: 30,
  archiveStaleThresholdDays: 14,
  raindropEnabled: false,
  raindropToken: "",
  raindropCollectionId: -1,
  raindropCollectionTitle: "Unsorted",
};

const RAINDROP_SYNC_ALARM = "raindropSync";
const RAINDROP_API_URL = "https://api.raindrop.io/rest/v1";

let raindropSyncInFlight = false;

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
        settings.archiveStaleThresholdDays ??
        legacyStaleThreshold ??
        DEFAULT_SETTINGS.archiveStaleThresholdDays,
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
    const period = Math.max(1, settings.runIntervalMinutes || 60);
    chrome.alarms.create("backup", { periodInMinutes: period });
  }

  chrome.alarms.create(RAINDROP_SYNC_ALARM, { periodInMinutes: 5 });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "backup") {
    await runBackup();
    await runStaleArchive();
    await runArchivePurge();
  } else if (alarm.name === RAINDROP_SYNC_ALARM) {
    await processRaindropQueue();
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
      .filter(isSaveableTab)
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

// Only ever open http(s) URLs. Stored data can be tampered with via import,
// so every restore path is gated through this before chrome.tabs/windows.create.
function isRestorableUrl(url) {
  return (
    typeof url === "string" &&
    (url.startsWith("https://") || url.startsWith("http://"))
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

function hasRaindropConfig(settings) {
  return (
    settings?.raindropEnabled === true &&
    typeof settings.raindropToken === "string" &&
    settings.raindropToken.trim() !== ""
  );
}

function hasRaindropToken(settings) {
  return (
    typeof settings?.raindropToken === "string" &&
    settings.raindropToken.trim() !== ""
  );
}

function normalizeRaindropCollectionId(value) {
  const id = parseInt(value, 10);
  if (Number.isNaN(id)) return -1;
  return id;
}

function raindropHeaders(settings) {
  return {
    Authorization: `Bearer ${settings.raindropToken.trim()}`,
    "Content-Type": "application/json",
  };
}

function makeRaindropQueueEntry(tab, settings) {
  return {
    id: crypto.randomUUID(),
    action: "create",
    savedTabId: tab.id,
    link: tab.url,
    title: tab.title || tab.url,
    tags: Array.isArray(tab.tags) ? tab.tags : [],
    collectionId: normalizeRaindropCollectionId(settings?.raindropCollectionId),
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
}

function toRaindropItem(entry) {
  return {
    link: entry.link,
    title: entry.title,
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    collection: { $id: normalizeRaindropCollectionId(entry.collectionId) },
    pleaseParse: {},
  };
}

function getRaindropCreateBatch(queue) {
  const batch = [];
  for (const entry of queue) {
    if ((entry.action || "create") !== "create") break;
    batch.push(entry);
    if (batch.length === 100) break;
  }
  return batch;
}

function sameTags(a, b) {
  const left = Array.isArray(a) ? a : [];
  const right = Array.isArray(b) ? b : [];
  return (
    left.length === right.length &&
    left.every((tag, index) => tag === right[index])
  );
}

function makeRaindropTagUpdateQueueEntry(tab) {
  return {
    id: crypto.randomUUID(),
    action: "updateTags",
    savedTabId: tab.id,
    raindropId: tab.raindropId,
    tags: Array.isArray(tab.tags) ? tab.tags : [],
    queuedAt: Date.now(),
    attempts: 0,
    lastError: null,
  };
}

async function markRaindropSynced(batch, items) {
  const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
  if (savedTabs.length === 0) return;

  const syncedAt = Date.now();
  const syncedBySavedTabId = new Map(
    batch.map((entry, index) => [
      entry.savedTabId,
      {
        createTags: Array.isArray(entry.tags) ? entry.tags : [],
        raindropId: items?.[index]?._id || items?.[index]?.id || null,
        raindropSyncedAt: syncedAt,
      },
    ]),
  );

  let changed = false;
  const followUpTagUpdates = [];
  const updated = savedTabs.map((tab) => {
    const sync = syncedBySavedTabId.get(tab.id);
    if (!sync) return tab;
    changed = true;

    const syncedTab = {
      ...tab,
      raindropId: sync.raindropId,
      raindropSyncedAt: sync.raindropSyncedAt,
    };
    if (sync.raindropId && !sameTags(tab.tags, sync.createTags)) {
      followUpTagUpdates.push(makeRaindropTagUpdateQueueEntry(syncedTab));
    }
    return syncedTab;
  });

  if (changed) {
    await chrome.storage.local.set({ savedTabs: updated });
  }
  if (followUpTagUpdates.length) {
    const { raindropQueue = [] } =
      await chrome.storage.local.get("raindropQueue");
    await chrome.storage.local.set({
      raindropQueue: raindropQueue.concat(followUpTagUpdates),
    });
  }
}

async function markRaindropTagSynced(entry) {
  const { savedTabs = [] } = await chrome.storage.local.get("savedTabs");
  let changed = false;
  const updated = savedTabs.map((tab) => {
    if (tab.id !== entry.savedTabId) return tab;
    changed = true;
    return {
      ...tab,
      raindropSyncedAt: Date.now(),
    };
  });

  if (changed) {
    await chrome.storage.local.set({ savedTabs: updated });
  }
}

async function queueRaindropTagSync(tab, settings) {
  if (!hasRaindropConfig(settings)) return;

  try {
    const { raindropQueue = [] } =
      await chrome.storage.local.get("raindropQueue");
    const tags = Array.isArray(tab.tags) ? tab.tags : [];

    if (tab.raindropId) {
      await chrome.storage.local.set({
        raindropQueue: raindropQueue.concat(makeRaindropTagUpdateQueueEntry(tab)),
      });
      kickRaindropSync();
      return;
    }

    let changed = false;
    const updated = raindropQueue.map((entry) => {
      const action = entry.action || "create";
      if (action !== "create" || entry.savedTabId !== tab.id) return entry;
      changed = true;
      return { ...entry, tags };
    });

    if (changed) {
      await chrome.storage.local.set({ raindropQueue: updated });
      kickRaindropSync();
    }
  } catch (err) {
    console.warn("Raindrop tag sync queue failed:", err.message);
  }
}

function kickRaindropSync() {
  processRaindropQueue().catch((err) => {
    console.warn("Raindrop sync launcher failed:", err.message);
  });
}

async function syncRaindropCreates(batch, settings) {
  const res = await fetch(`${RAINDROP_API_URL}/raindrops`, {
    method: "POST",
    headers: raindropHeaders(settings),
    body: JSON.stringify({ items: batch.map(toRaindropItem) }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({ result: true }));
  if (json.result === false) {
    throw new Error(json.errorMessage || "Raindrop rejected the batch");
  }

  await markRaindropSynced(batch, json.items || []);
}

async function syncRaindropTagUpdate(entry, settings) {
  const res = await fetch(`${RAINDROP_API_URL}/raindrop/${entry.raindropId}`, {
    method: "PUT",
    headers: raindropHeaders(settings),
    body: JSON.stringify({
      tags: Array.isArray(entry.tags) ? entry.tags : [],
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const json = await res.json().catch(() => ({ result: true }));
  if (json.result === false) {
    throw new Error(json.errorMessage || "Raindrop rejected the tag update");
  }

  await markRaindropTagSynced(entry);
}

async function queueRaindropEntries(entries, settings) {
  if (!hasRaindropConfig(settings) || entries.length === 0) return;

  try {
    const { raindropQueue = [] } =
      await chrome.storage.local.get("raindropQueue");
    await chrome.storage.local.set({
      raindropQueue: raindropQueue.concat(
        entries.map((entry) => makeRaindropQueueEntry(entry, settings)),
      ),
    });
    kickRaindropSync();
  } catch (err) {
    console.warn("Raindrop queue failed:", err.message);
  }
}

async function processRaindropQueue() {
  if (raindropSyncInFlight) return;
  raindropSyncInFlight = true;

  try {
    while (true) {
      const { settings = DEFAULT_SETTINGS, raindropQueue = [] } =
        await chrome.storage.local.get(["settings", "raindropQueue"]);

      if (!hasRaindropConfig(settings) || raindropQueue.length === 0) return;

      const first = raindropQueue[0];
      const action = first.action || "create";
      const batch = action === "create" ? getRaindropCreateBatch(raindropQueue) : [first];

      if (action === "create") {
        await syncRaindropCreates(batch, settings);
      } else if (action === "updateTags") {
        await syncRaindropTagUpdate(first, settings);
      } else {
        throw new Error(`Unknown Raindrop queue action: ${action}`);
      }

      const syncedIds = new Set(batch.map((entry) => entry.id));
      const latest = await chrome.storage.local.get("raindropQueue");
      const remaining = (latest.raindropQueue || []).filter(
        (entry) => !syncedIds.has(entry.id),
      );
      await chrome.storage.local.set({ raindropQueue: remaining });
    }
  } catch (err) {
    const message = err.message || "Raindrop sync failed";
    const { raindropQueue = [] } =
      await chrome.storage.local.get("raindropQueue");
    const firstAction = raindropQueue[0]?.action || "create";
    const failedIds = new Set(
      firstAction === "create"
        ? getRaindropCreateBatch(raindropQueue).map((entry) => entry.id)
        : raindropQueue.slice(0, 1).map((entry) => entry.id),
    );
    const updated = raindropQueue.map((entry) => {
      if (!failedIds.has(entry.id)) return entry;
      return {
        ...entry,
        attempts: (entry.attempts || 0) + 1,
        lastError: message,
        lastAttemptAt: Date.now(),
      };
    });
    await chrome.storage.local.set({ raindropQueue: updated });
    console.warn("Raindrop sync failed:", message);
  } finally {
    raindropSyncInFlight = false;
  }
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
      const { savedTabs = [], settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get(["savedTabs", "settings"]);
      const idx = savedTabs.findIndex((t) => t.id === msg.id);
      if (idx === -1) return { ok: false };
      savedTabs[idx] = { ...savedTabs[idx], ...msg.patch };
      await chrome.storage.local.set({ savedTabs });
      if (Object.prototype.hasOwnProperty.call(msg.patch || {}, "tags")) {
        await queueRaindropTagSync(savedTabs[idx], settings);
      }
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
      if (!tab || !isRestorableUrl(tab.url)) {
        return { ok: false, error: "Invalid URL" };
      }
      chrome.tabs.create({ url: tab.url, active: true });
      return { ok: true };
    }

    case "restoreSnapshot": {
      const { backupList = [] } = await chrome.storage.local.get("backupList");
      const snapshot = backupList.find((s) => s.id === msg.id);
      if (!snapshot) return { ok: false };

      // Filter before creating the window so URL list and group-index mapping stay aligned.
      const restorable = snapshot.tabs.filter((t) => isRestorableUrl(t.url));
      if (restorable.length === 0) return { ok: false };

      const urls = restorable.map((t) => t.url);
      const win = await chrome.windows.create({ url: urls, focused: true });

      if (snapshot.groups?.length && win.tabs?.length) {
        const groupMeta = new Map(snapshot.groups.map((g) => [g.id, g]));
        const groupTabs = new Map();
        restorable.forEach((t, i) => {
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
      if (!isRestorableUrl(msg.url)) {
        return { ok: false, error: "Invalid URL" };
      }
      chrome.tabs.create({ url: msg.url, active: true });
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
        runIntervalMinutes: numberSetting(
          s.runIntervalMinutes,
          DEFAULT_SETTINGS.runIntervalMinutes,
          1,
        ),
        backupEnabled: Boolean(s.backupEnabled),
        backupIgnoreGroups: Boolean(s.backupIgnoreGroups),
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
        raindropEnabled: Boolean(s.raindropEnabled),
        raindropToken:
          typeof s.raindropToken === "string" ? s.raindropToken.trim() : "",
        raindropCollectionId: normalizeRaindropCollectionId(
          s.raindropCollectionId,
        ),
        raindropCollectionTitle:
          typeof s.raindropCollectionTitle === "string" &&
          s.raindropCollectionTitle.trim()
            ? s.raindropCollectionTitle.trim()
            : DEFAULT_SETTINGS.raindropCollectionTitle,
      };
      await chrome.storage.local.set({ settings: validated });
      await rescheduleAlarms();
      await applyIconAction(validated.iconAction);
      if (hasRaindropConfig(validated)) kickRaindropSync();
      return { ok: true };
    }

    case "getRaindropCollections": {
      const { settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get("settings");
      if (!hasRaindropToken(settings)) {
        return { ok: false, error: "Missing Raindrop token" };
      }

      const [rootRes, childRes] = await Promise.all([
        fetch(`${RAINDROP_API_URL}/collections`, {
          headers: raindropHeaders(settings),
        }),
        fetch(`${RAINDROP_API_URL}/collections/childrens`, {
          headers: raindropHeaders(settings),
        }),
      ]);

      if (!rootRes.ok) return { ok: false, error: `HTTP ${rootRes.status}` };
      if (!childRes.ok) return { ok: false, error: `HTTP ${childRes.status}` };

      const rootJson = await rootRes.json();
      const childJson = await childRes.json();
      if (rootJson.result === false) {
        return { ok: false, error: rootJson.errorMessage || "Raindrop failed" };
      }
      if (childJson.result === false) {
        return { ok: false, error: childJson.errorMessage || "Raindrop failed" };
      }

      const byId = new Map();
      [...(rootJson.items || []), ...(childJson.items || [])].forEach(
        (collection) => {
          if (!collection?._id) return;
          const existing = byId.get(collection._id);
          const parentId = collection.parent?.$id ?? existing?.parentId ?? null;
          byId.set(collection._id, {
            id: collection._id,
            title: collection.title || existing?.title || "Untitled",
            parentId,
          });
        },
      );

      return {
        ok: true,
        collections: [...byId.values()],
      };
    }

    case "createRaindropCollection": {
      const title = typeof msg.title === "string" ? msg.title.trim() : "";
      if (!title) return { ok: false, error: "Collection name required" };

      const { settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get("settings");
      if (!hasRaindropToken(settings)) {
        return { ok: false, error: "Missing Raindrop token" };
      }

      const res = await fetch(`${RAINDROP_API_URL}/collection`, {
        method: "POST",
        headers: raindropHeaders(settings),
        body: JSON.stringify({ title, public: false }),
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

      const json = await res.json();
      if (json.result === false || !json.item?._id) {
        return {
          ok: false,
          error: json.errorMessage || "Raindrop failed to create collection",
        };
      }

      const collection = {
        id: json.item._id,
        title: json.item.title || title,
        parentId: json.item.parent?.$id ?? null,
      };
      const updatedSettings = {
        ...settings,
        raindropCollectionId: collection.id,
        raindropCollectionTitle: collection.title,
      };
      await chrome.storage.local.set({ settings: updatedSettings });
      return { ok: true, collection };
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
      const { savedTabs = [], settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get(["savedTabs", "settings"]);
      savedTabs.push(entry);
      try {
        await chrome.storage.local.set({ savedTabs });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }
      await queueRaindropEntries([entry], settings);
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

      const { savedTabs = [], settings = DEFAULT_SETTINGS } =
        await chrome.storage.local.get(["savedTabs", "settings"]);
      const entries = saveable.map(makeSavedTabEntry);
      try {
        await chrome.storage.local.set({
          savedTabs: savedTabs.concat(entries),
        });
      } catch (err) {
        return { ok: false, reason: "storage_full" };
      }

      await queueRaindropEntries(entries, settings);
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
