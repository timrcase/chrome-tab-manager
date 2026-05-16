# Privacy Policy

Tab Manager does not collect, store, or transmit any personal data or browsing information.

All data — saved tabs, backups, archived tabs, and settings — is stored exclusively in your browser's local storage (`chrome.storage.local`). No data is sent to any external server.

## Permissions

- `tabs`: Used to read tab titles, URLs, and favicons in order to save, display, and manage your open tabs.
- `storage`: Used to persist saved tabs, backup snapshots, the stale-tab archive, and extension settings on your device.
- `alarms`: Used to schedule periodic tab backups, stale-tab archiving, and automatic archive purges.
- `omnibox`: Used to provide the `go` keyword shortcut for navigating to saved tabs directly from the address bar.
- `tabGroups`: Used to capture and restore tab group names and colors when creating or restoring backup snapshots.
- `contextMenus`: Used to add "Open Tab Manager" and "Cleanup Tabs" entries to the extension icon's right-click menu.
- `host_permissions` (`<all_urls>`): Used to load favicons from visited sites for display in the saved tabs and archive lists.

## Contact

If you have any questions, please open an issue on the [GitHub repository](https://github.com/timrcase/chrome-tab-manager).
