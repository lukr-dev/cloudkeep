# CloudKeep for Chrome

Run `vp install`, then `vp run extension#build` from the repository root.
In `chrome://extensions`, enable Developer mode and **Load unpacked**, selecting
`apps/extension/dist`. Rebuild and reload the extension after changes.

Open the extension's options, enter your server URL (defaults to
https://cloudkeep.toastnet.work), email and password, and grant access to that
server. Only the session token is retained; cookies and passwords are not stored.

Click the toolbar icon or press **Alt+Shift+K** to save the current page immediately.
Change the shortcut in `chrome://extensions/shortcuts` if Chrome reserves it.
Type to filter list chips; Enter toggles the first result, and 1–9 toggle visible
chips with an empty filter. Escape closes. New saves have an Undo button.
“Open CloudKeep” opens the full web app.

Saving, list changes, and Undo run in the background worker and continue when the
popup closes. Reopening the same tab reuses its worker session. Lists appear as
soon as they load, so you can toggle chips before the save finishes. Worker
sessions last until the worker restarts, the tab closes, or the account changes.

The duplicate badge is on by default. Options can disable it to stop background
page lookups. Lookups are debounced and cached for one minute. Signing out clears
the session and list cache. Disabling badges aborts pending lookups.

Validation: `vp check`, `vp test`, `vp run extension#typecheck`.
A tag `extension-v<version>` publishes a zip; its version must match package.json.
