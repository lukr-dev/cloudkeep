# CloudKeep for Chrome

Run `vp install`, then `vp run extension#build` from the repository root.
In `chrome://extensions`, enable Developer mode and **Load unpacked**, selecting
`apps/extension/dist`. Rebuild and reload the extension after changes.

Open the extension's options, enter your server URL (defaults to
https://cloudkeep.toastnet.work), email and password, and grant access to that
server. Only the session token is retained; cookies and passwords are not stored.

Click the toolbar icon or press **Alt+Shift+K** to open the popup.
Change the shortcut in `chrome://extensions/shortcuts` if Chrome reserves it.
Options has two per-device share modes:

- **Quick save** (default) saves immediately, optionally into a **Quick save list**.
  If that list was deleted, the page is saved without it; options shows a warning so you can replace it
  or choose “No list”. Save errors open the picker for retry.
- **Ask** checks whether the page is saved first, even with badges disabled.
  New pages show a list picker (up to 30 lists, valid default pre-selected) and
  **Save**. Closing without saving writes nothing. Existing pages show their
  lists and **Move to top**; list changes apply immediately.

Saved duplicates show “Already saved · moved to top”. New saves have **Undo**.
Type to filter list chips; Enter toggles the first match, and 1–9 toggle visible
chips with an empty filter. In the new-page picker, Enter with an empty filter
or Ctrl/Cmd+Enter saves. Escape closes. “Open CloudKeep” opens the full web app.

Saving, list changes, and Undo run in the background worker and continue when the
popup closes. Quick save reuses the same tab's worker session; Ask checks again
when reopened. Worker sessions last until the worker restarts, the tab closes,
or the account changes.

The duplicate badge is on by default. Options can disable background page lookups;
Ask still checks on opening. Background lookups are debounced and cached for one
minute. Signing out or changing accounts clears the list cache and default list,
while the share mode stays on the device. Disabling badges aborts pending
background lookups.

Validation: `vp check`, `vp test`, `vp run extension#typecheck`.
A tag `extension-v<version>` publishes a zip; its version must match package.json.
