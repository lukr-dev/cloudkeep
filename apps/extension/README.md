# CloudKeep for Chrome

Run `vp install`, then `vp run extension#build` from the repository root.
In `chrome://extensions`, enable Developer mode and **Load unpacked**, selecting
`apps/extension/dist`. Rebuild and reload the extension after changes.

Open the full-tab settings page to sign in with your server URL (defaults to
https://cloudkeep.toastnet.work), email and password, and grant server access.
Only the session token is retained; cookies and passwords are not stored.

Click the toolbar icon or press **Alt+Shift+K** to save immediately. Change the
shortcut in `chrome://extensions/shortcuts` if needed. In settings, choose a
**Default list** for new saves. If it was deleted, the page is saved without a
list and a warning appears. Failed saves show **Retry**; expired sessions show
**Sign in**. Duplicates show “Already saved · moved to top”.

The popup's **Lists** chips apply changes immediately. Selected chips show a
check. With more than eight lists, type to filter; Enter toggles the first match.
With an empty filter, 1–9 toggle visible chips. **Done** or Escape closes the
popup. **Undo** removes a new save; **Open CloudKeep ↗** opens the web app.
Saving, list changes, and Undo continue in the background after the popup closes.
Reopening starts another save once previous work finishes.

The page indicator is on by default: saved pages have a green toolbar icon and
✓ badge; unknown or unsaved pages use a neutral bookmark. Turn off the indicator
in settings to stop background page lookups. Popup saves still detect duplicates
and update the icon and badge; Undo resets them. Lookups are debounced, cached
for one minute, and aborted when disabled. Signing out resets open tabs and
clears the list cache and account-specific default list.

Regenerate the committed toolbar PNGs with `node apps/extension/scripts/icons.mjs`.
Validation: `vp check`, `vp test`, `vp run extension#typecheck`,
`vp run extension#build`. A tag `extension-v<version>` publishes a zip; its
version must match package.json.
