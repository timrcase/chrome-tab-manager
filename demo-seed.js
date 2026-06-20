// Demo data for store screenshots. Two consoles, two purposes:
//
// 1. SERVICE WORKER console (chrome://extensions -> "service worker"):
//    Paste this whole file, then run demoSeed() to load Saved / Backup / Archive
//    demo data into storage. Run demoReset() afterward to restore your real data.
//
// 2. MANAGER PAGE console (right-click manager.html -> Inspect):
//    Paste this whole file, then run demoOpenTabs() to fill the Open Tabs table
//    with fake tabs WITHOUT touching your real tabs. (The Open Tabs view reads
//    live tabs, so it can't be seeded via storage.) Don't click Refresh after —
//    just reload the page to clear.

// Wrapped in an IIFE so re-pasting (or pasting alongside background.js/options.js)
// never throws "Identifier already declared". Callables are exposed on globalThis.
(() => {
console.log('[demo] demo-seed.js evaluated — defining demoSeed / demoReset / demoOpenTabs…');
const now = Date.now();
const min = 60_000;
const hr  = 3_600_000;
const day = 86_400_000;

const demoData = {
  savedTabs: [
    {
      id: 'demo-1',
      title: 'Google',
      url: 'https://www.google.com',
      favIconUrl: null,
      tags: [],
      savedAt: now - 2 * min,
    },
    {
      id: 'demo-2',
      title: 'YouTube',
      url: 'https://www.youtube.com',
      favIconUrl: null,
      tags: ['entertainment'],
      savedAt: now - 15 * min,
    },
    {
      id: 'demo-3',
      title: 'Reddit — the front page of the internet',
      url: 'https://www.reddit.com',
      favIconUrl: null,
      tags: ['social', 'news'],
      savedAt: now - 1 * hr,
    },
    {
      id: 'demo-4',
      title: 'Amazon.com: Online Shopping',
      url: 'https://www.amazon.com',
      favIconUrl: null,
      tags: ['shopping'],
      savedAt: now - 2 * hr,
    },
    {
      id: 'demo-5',
      title: 'Wikipedia — The Free Encyclopedia',
      url: 'https://www.wikipedia.org',
      favIconUrl: null,
      tags: ['research'],
      savedAt: now - 3 * hr,
    },
    {
      id: 'demo-6',
      title: 'The New York Times — Breaking News, World News & Multimedia',
      url: 'https://www.nytimes.com',
      favIconUrl: null,
      tags: ['news'],
      savedAt: now - 5 * hr,
    },
    {
      id: 'demo-7',
      title: 'LinkedIn',
      url: 'https://www.linkedin.com/in/',
      favIconUrl: null,
      tags: ['work', 'social'],
      savedAt: now - 1 * day,
    },
    {
      id: 'demo-8',
      title: 'GitHub — Build and ship software',
      url: 'https://www.github.com',
      favIconUrl: null,
      tags: ['work'],
      savedAt: now - 1 * day - 2 * hr,
    },
    {
      id: 'demo-9',
      title: 'Netflix',
      url: 'https://www.netflix.com',
      favIconUrl: null,
      tags: ['entertainment'],
      savedAt: now - 2 * day,
    },
    {
      id: 'demo-10',
      title: 'ESPN — Sports News, Scores, Highlights',
      url: 'https://www.espn.com',
      favIconUrl: null,
      tags: [],
      savedAt: now - 2 * day - 4 * hr,
    },
    {
      id: 'demo-11',
      title: 'X (formerly Twitter)',
      url: 'https://www.x.com',
      favIconUrl: null,
      tags: ['social', 'news'],
      savedAt: now - 3 * day,
    },
    {
      id: 'demo-12',
      title: 'Weather.com — Local & National Forecast',
      url: 'https://www.weather.com',
      favIconUrl: null,
      tags: [],
      savedAt: now - 4 * day,
    },
  ],

  backupList: [
    {
      id: 'demo-backup-1',
      capturedAt: now - 2 * hr,
      ignoresGroups: false,
      tabs: [
        { title: 'GitHub — Build and ship software', url: 'https://www.github.com', favIconUrl: null, groupId: -1 },
        { title: 'Pull Request #42 · timrcase/chrome-tab-manager', url: 'https://github.com/timrcase/chrome-tab-manager/pull/42', favIconUrl: null, groupId: 101 },
        { title: 'Issues · timrcase/chrome-tab-manager', url: 'https://github.com/timrcase/chrome-tab-manager/issues', favIconUrl: null, groupId: 101 },
        { title: 'Stack Overflow — Where Developers Learn', url: 'https://stackoverflow.com', favIconUrl: null, groupId: -1 },
        { title: 'MDN Web Docs', url: 'https://developer.mozilla.org', favIconUrl: null, groupId: -1 },
        { title: 'Gmail', url: 'https://mail.google.com', favIconUrl: null, groupId: -1 },
        { title: 'Google Calendar', url: 'https://calendar.google.com', favIconUrl: null, groupId: -1 },
        { title: 'Hacker News', url: 'https://news.ycombinator.com', favIconUrl: null, groupId: -1 },
      ],
      groups: [
        { id: 101, title: 'tab-manager PR', color: 'blue' },
      ],
    },
    {
      id: 'demo-backup-2',
      capturedAt: now - 1 * day - 3 * hr,
      ignoresGroups: false,
      tabs: [
        { title: 'Google', url: 'https://www.google.com', favIconUrl: null, groupId: -1 },
        { title: 'YouTube', url: 'https://www.youtube.com', favIconUrl: null, groupId: -1 },
        { title: 'Reddit', url: 'https://www.reddit.com', favIconUrl: null, groupId: -1 },
        { title: 'The New York Times', url: 'https://www.nytimes.com', favIconUrl: null, groupId: -1 },
        { title: 'ESPN', url: 'https://www.espn.com', favIconUrl: null, groupId: -1 },
      ],
      groups: [],
    },
  ],

  archiveList: [
    { id: 'demo-arc-1',  title: 'React Documentation',                         url: 'https://react.dev',                    favIconUrl: null, closedAt: now - 30 * min },
    { id: 'demo-arc-2',  title: 'Tailwind CSS — Rapidly build modern websites', url: 'https://tailwindcss.com',              favIconUrl: null, closedAt: now - 2 * hr },
    { id: 'demo-arc-3',  title: 'ChatGPT',                                      url: 'https://chatgpt.com',                  favIconUrl: null, closedAt: now - 4 * hr },
    { id: 'demo-arc-4',  title: 'Hacker News',                                  url: 'https://news.ycombinator.com',         favIconUrl: null, closedAt: now - 1 * day },
    { id: 'demo-arc-5',  title: 'Stack Overflow',                               url: 'https://stackoverflow.com',            favIconUrl: null, closedAt: now - 1 * day - 2 * hr },
    { id: 'demo-arc-6',  title: 'MDN Web Docs — CSS',                           url: 'https://developer.mozilla.org/css',    favIconUrl: null, closedAt: now - 2 * day },
    { id: 'demo-arc-7',  title: 'Google Maps',                                  url: 'https://maps.google.com',              favIconUrl: null, closedAt: now - 2 * day - 6 * hr },
    { id: 'demo-arc-8',  title: 'Vercel Dashboard',                             url: 'https://vercel.com/dashboard',         favIconUrl: null, closedAt: now - 3 * day },
    { id: 'demo-arc-9',  title: 'Figma — Design Tool',                          url: 'https://figma.com',                    favIconUrl: null, closedAt: now - 4 * day },
    { id: 'demo-arc-10', title: 'Stripe Dashboard',                             url: 'https://dashboard.stripe.com',         favIconUrl: null, closedAt: now - 5 * day },
    { id: 'demo-arc-11', title: 'Notion',                                       url: 'https://notion.so',                    favIconUrl: null, closedAt: now - 6 * day },
    { id: 'demo-arc-12', title: 'Dropbox',                                      url: 'https://dropbox.com',                  favIconUrl: null, closedAt: now - 8 * day },
  ],

  settings: {
    defaultManagerPage: 'saved', // open straight to the seeded Saved tabs
    iconAction: 'popup',
    runIntervalMinutes: 60,
    backupEnabled: true,
    backupMaxSnapshots: 10,
    backupIgnoreGroups: false,
    archiveEnabled: true,
    archivePurgeDays: 30,
    archiveStaleThresholdDays: 14,
  },
};

// ─── Seed ─────────────────────────────────────────────────────────────────────
async function demoSeed() {
  // Guard against double-seeding: a second snapshot would capture demo data as
  // "real" and demoReset() would then restore demo data instead of your tabs.
  const existing = await chrome.storage.local.get('_demoRealDataBackup');
  if (existing._demoRealDataBackup) {
    console.warn('[demo] Already seeded. Run demoReset() before seeding again.');
    return;
  }
  // Snapshot real data under a backup key so demoReset() can restore it.
  const real = await chrome.storage.local.get(['savedTabs', 'backupList', 'archiveList', 'settings']);
  await chrome.storage.local.set({ _demoRealDataBackup: real });
  await chrome.storage.local.set(demoData);
  console.log('[demo] Real data backed up. Seeded: %d saved, %d backups, %d archive',
    demoData.savedTabs.length,
    demoData.backupList.length,
    demoData.archiveList.length,
  );
}

// ─── Restore ──────────────────────────────────────────────────────────────────
async function demoReset() {
  const { _demoRealDataBackup } = await chrome.storage.local.get('_demoRealDataBackup');
  if (!_demoRealDataBackup) {
    console.warn('[demo] No backup found — was demoSeed() run first?');
    return;
  }
  await chrome.storage.local.set(_demoRealDataBackup);
  await chrome.storage.local.remove('_demoRealDataBackup');
  console.log('[demo] Real data restored.');
}

// ─── Open Tabs (manager page console only) ──────────────────────────────────────
// The Open Tabs view reads live tabs via chrome.tabs.query, so it can't be seeded
// through storage. demoOpenTabs() injects fake rows straight into the table without
// touching your real tabs. Reload manager.html to clear (don't click Refresh).
const demoOpenTabsData = [
  { tabId: 1,  windowId: 1, index: 0,  title: 'GitHub — Build and ship software',                url: 'https://github.com',                                       favIconUrl: null, domain: 'github.com',              lastAccessed: now - 5 * min,            pinned: true,  active: false, isDupe: false },
  { tabId: 2,  windowId: 1, index: 1,  title: 'Gmail',                                            url: 'https://mail.google.com',                                  favIconUrl: null, domain: 'mail.google.com',         lastAccessed: now - 8 * min,            pinned: true,  active: false, isDupe: false },
  { tabId: 3,  windowId: 1, index: 2,  title: 'Pull Request #42 · timrcase/chrome-tab-manager',   url: 'https://github.com/timrcase/chrome-tab-manager/pull/42',   favIconUrl: null, domain: 'github.com',              lastAccessed: now - 20 * min,           pinned: false, active: true,  isDupe: false },
  { tabId: 4,  windowId: 1, index: 3,  title: 'Stack Overflow — Where Developers Learn',          url: 'https://stackoverflow.com',                                favIconUrl: null, domain: 'stackoverflow.com',       lastAccessed: now - 1 * hr,             pinned: false, active: false, isDupe: false },
  { tabId: 5,  windowId: 1, index: 4,  title: 'MDN Web Docs',                                     url: 'https://developer.mozilla.org',                            favIconUrl: null, domain: 'developer.mozilla.org',   lastAccessed: now - 2 * hr,             pinned: false, active: false, isDupe: true  },
  { tabId: 6,  windowId: 1, index: 5,  title: 'MDN Web Docs',                                     url: 'https://developer.mozilla.org',                            favIconUrl: null, domain: 'developer.mozilla.org',   lastAccessed: now - 1 * day,            pinned: false, active: false, isDupe: true  },
  { tabId: 7,  windowId: 1, index: 6,  title: 'Hacker News',                                      url: 'https://news.ycombinator.com',                             favIconUrl: null, domain: 'news.ycombinator.com',    lastAccessed: now - 3 * hr,             pinned: false, active: false, isDupe: false },
  { tabId: 8,  windowId: 1, index: 7,  title: 'Figma — The Collaborative Interface Design Tool',  url: 'https://figma.com',                                        favIconUrl: null, domain: 'figma.com',               lastAccessed: now - 5 * hr,             pinned: false, active: false, isDupe: false },
  { tabId: 9,  windowId: 1, index: 8,  title: 'Notion — Your connected workspace',                url: 'https://notion.so',                                        favIconUrl: null, domain: 'notion.so',               lastAccessed: now - 1 * day - 2 * hr,   pinned: false, active: false, isDupe: false },
  { tabId: 10, windowId: 1, index: 9,  title: 'Google Calendar',                                  url: 'https://calendar.google.com',                              favIconUrl: null, domain: 'calendar.google.com',     lastAccessed: now - 1 * day - 6 * hr,   pinned: false, active: false, isDupe: false },
  { tabId: 11, windowId: 1, index: 10, title: 'Wikipedia — The Free Encyclopedia',                url: 'https://www.wikipedia.org',                                favIconUrl: null, domain: 'www.wikipedia.org',       lastAccessed: now - 2 * day,            pinned: false, active: false, isDupe: false },
  { tabId: 12, windowId: 1, index: 11, title: 'Linear — Plan and build products',                 url: 'https://linear.app',                                       favIconUrl: null, domain: 'linear.app',              lastAccessed: now - 2 * day - 5 * hr,   pinned: false, active: false, isDupe: false },
  { tabId: 13, windowId: 1, index: 12, title: 'Vercel Dashboard',                                 url: 'https://vercel.com/dashboard',                             favIconUrl: null, domain: 'vercel.com',              lastAccessed: now - 3 * day,            pinned: false, active: false, isDupe: false },
  { tabId: 14, windowId: 1, index: 13, title: 'Read the Docs — Documentation Simplified',         url: 'https://readthedocs.org',                                  favIconUrl: null, domain: 'readthedocs.org',         lastAccessed: now - 6 * day,            pinned: false, active: false, isDupe: false },
];

function demoOpenTabs() {
  if (typeof otState === 'undefined' || typeof renderOpenTabs !== 'function') {
    console.warn('[demo] Run this in the MANAGER PAGE console (Inspect manager.html), not the service worker.');
    return;
  }
  otState.tabs = demoOpenTabsData;
  otState.selected.clear();
  otState.loaded = true;
  renderOpenTabs();
  console.log('[demo] Injected %d fake open tabs. Reload the page to clear.', demoOpenTabsData.length);
}

// Expose for the console (SW console uses demoSeed/demoReset; manager page uses demoOpenTabs).
globalThis.demoSeed = demoSeed;
globalThis.demoReset = demoReset;
globalThis.demoOpenTabs = demoOpenTabs;
console.log('[demo] Ready. Run demoSeed() (service worker) or demoOpenTabs() (manager page).');
})();
