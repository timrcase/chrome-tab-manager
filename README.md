# Tab Manager

A Chrome extension for power users who accumulate tabs. Save, tag, back up, and archive tabs without breaking flow.

## Features

**Save tabs** — Close a tab and save it with optional tags and a `go:` shortcode for instant recall from the address bar.

**Tag & filter** — Organize saved tabs with freeform tags. Filter by one or more tags to find what you need fast.

**`go:` shortcuts** — Assign a shortcode to any saved tab. Type `go keyword` in the address bar to navigate directly to it.

**Backup** — Automatically snapshot all open tabs on a configurable schedule. Restore individual tabs or entire snapshots into a new window, preserving tab groups.

**Archive** — Every tab you close is silently archived with its title, URL, and timestamp. Search by title or URL, restore with one click, or let old entries auto-purge on a configurable schedule.

**Cleanup** — Right-click the extension icon → Cleanup Tabs to find duplicate tabs (keeps the most recently accessed copy) and stale tabs that haven't been touched in N days.

**Storage usage** — Options page shows a live breakdown of storage used by saved tabs, archive, and backups against Chrome's 10 MB local storage limit.

## Installation

Load unpacked from Chrome:

1. Clone this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `src/` folder

## Usage

| Action                             | How                                           |
| ---------------------------------- | --------------------------------------------- |
| Save current tab                   | Click the extension icon                      |
| Open Tab Manager                   | Right-click extension icon → Open Tab Manager |
| Cleanup duplicates / stale tabs    | Right-click extension icon → Cleanup Tabs     |
| Navigate via shortcode             | Type `go <shortcode>` in the address bar      |
| Configure backup, archive, cleanup | Options page (⚙ button in header)             |

## Privacy

All data stays on your device. No external servers. See [PRIVACY.md](PRIVACY.md).
