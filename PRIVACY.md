# Privacy Policy

Tab Manager does not collect, store, or transmit any personal data or browsing information by default.

When Raindrop is disabled, all data — saved tabs, backups, archived tabs, and settings — is stored exclusively in your browser's local storage (`chrome.storage.local`). No data is sent to any external server.

If you enable the optional Raindrop integration, saved tab URLs, titles, and tags are sent directly from your browser to the Raindrop.io API using the API token you provide. The token is stored locally in `chrome.storage.local`, is used only for Raindrop API calls, and is redacted from Tab Manager exports.

## Permissions

- `tabs`: Used to read tab titles, URLs, and favicons in order to save, display, and manage your open tabs.
- `storage`: Used to persist saved tabs, backup snapshots, the stale-tab archive, and extension settings on your device.
- `alarms`: Used to schedule periodic tab backups, stale-tab archiving, and automatic archive purges.
- `tabGroups`: Used to capture and restore tab group names and colors when creating or restoring backup snapshots.
- `contextMenus`: Used to add an "Open Tab Manager" entry to the extension icon's right-click menu.
- Host access to `https://api.raindrop.io/`: Used only when the optional Raindrop integration is enabled.

## Contact

If you have any questions, please open an issue on the [GitHub repository](https://github.com/timrcase/chrome-tab-manager).
