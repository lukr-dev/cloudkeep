# CloudKeep Android prototype

Vue Lynx frontend with a hand-written Kotlin Android host. The host loads `main.lynx.bundle` from packaged assets; the shipped app does not use Lynx Explorer. Android 8+ (API 26), ARM64 and x86_64. Bookmarks, search, list/tag filters, refresh, pagination, details, editable tags/list membership, list CRUD, manual saving, login/logout and share preferences are included. AI configuration, prompts and admin invites remain on the web.

## Layout

```text
src/                   App state/actions (App.vue), native bridge, API helpers and tests
  screens/             Presentational screens (login, feed, detail, lists, add, share, settings)
  components/          Shared UI: app bar, bottom nav, buttons, chips, cards, dialogs, icons
scripts/smoke-api.mjs   Fresh-local-server bearer authentication smoke check
android/               Gradle wrapper, Kotlin host and JVM tests
  app/src/main/        Activities, secure storage, native module, Android resources
  app/src/test/        Shared URL extraction and HTTP client tests
```

## Frontend development

From the repository root, use Node >=24.21.0, pnpm 12.14.0 (the root `devEngines` version) and Vite+:

```sh
vp install
vp run mobile#dev
vp run mobile#build
vp run mobile#typecheck
vp check
vp test
```

Rspeedy prints the bundle URL, normally `http://<machine-ip>:3000/main.lynx.bundle`. Open that URL in Lynx Explorer on an Android device that can reach your development machine. For Tailscale access, use the machine's tailnet hostname/IP and expose the dev server only within the tailnet. The frontend has no DOM/web entry: a browser cannot render this native bundle.

Explorer lacks the custom CloudKeep module. Its development fallback uses Lynx's `fetch` and keeps credentials only in memory. Android sharing, secure persistence, return-to-app and browser opening must be tested in the CloudKeep APK. For a local backend use a device-reachable server URL; `localhost` on a phone refers to the phone. Release APKs accept HTTPS connections only; debug APKs allow HTTP for local development.

The app uses native `default-value` / `@input` bindings (`event.detail.value`) and imperative `setValue` for programmatic changes because native `v-model` is not implemented in Vue Lynx. A small tested binding avoids rewriting native text on every keystroke (preserving cursor/focus), while resetting cleared passwords and pre-filling renamed lists. Screens use small reactive navigation state; no browser history, KeepAlive or Teleport is needed. Bookmark rows use a vertical `<scroll-view>` with ordinary keyed views, pagination and the Refresh button. Native XElement input/refresh/SVG packages and image/HTTP services are registered in the host; pull-to-refresh is currently disabled (see device-fix notes below).

Vue Lynx 0.5.1 is pre-alpha. Rspeedy is pinned to 0.13.3 / Rsbuild 1 to match its peer requirements; mobile TypeScript is pinned to 5.9.3 because Rspeedy needs the JavaScript compiler API that the repository's TypeScript 7 package does not provide. Vue and Vite+ use workspace catalog versions. `vue-tsc` checks Lynx templates with its Volar plugin; Vite+ checks the rest. An ordinary `*.vue` module declaration supports Vite+'s TypeScript check; there are no Lynx source lint/format ignores. The transitive `core-js` install script only prints funding information and is explicitly disabled in workspace build policy.

## UI structure and theme

`App.vue` owns all state, API calls, navigation and the share startup sequence; screens and components only receive props and emit events. Navigation is a bottom bar (Bookmarks, Lists, Settings) plus a floating Add button on the feed. Detail, Add and the Ask share picker are full-screen sub-screens without the bottom bar.

Design tokens mirror the web app (`apps/web/style.css`) as CSS custom properties on the root `.app` element, with `.app.dark` overriding them. Use `var(--bg)`, `var(--surface)`, `var(--text)`, `var(--muted)`, `var(--accent)` and the others instead of hard-coded colours. `@media (prefers-color-scheme)` cannot be used: the bundle encoder (`@lynx-js/tasm` 0.0.26) drops `@media` rules. The host passes the system theme as `lynx.__globalProps.colorScheme` before the first render, then sends a `cloudkeepTheme` global event (`"light"` / `"dark"`) when it changes. MainActivity handles `uiMode` configuration changes itself, so a theme switch keeps the current screen and any pending share. Bottom bars use `--bg` because the native container paints the gesture/navigation area in that colour.

Text uses Geist, shipped as static TTFs in `android/app/src/main/assets/fonts/` (SIL OFL, see `OFL.txt`) and loaded with `@font-face { src: url("asset:///fonts/…") }`. Each weight is its own family (`Geist`, `GeistMedium`, `GeistSemiBold`) to avoid synthetic bold. Lynx text does not inherit fonts from views, so the global `text {}` rule sets the base family and colour. Explorer has no such assets and falls back to the system sans.

Icons are inline SVG strings (`src/icons.ts`) rendered by the `<svg content>` element from `xelement-svg`. SVG content cannot read CSS variables, so `Icon.vue` resolves the colour from the injected `dark` flag. Its tone colours must stay in sync with the tokens.

Back navigation: the frontend calls `setBackHandler({ enabled })` whenever it has something to go back to (a dialog, rename mode, a sub-screen or tab other than Bookmarks, or an Ask share). While enabled, MainActivity forwards system Back as a `cloudkeepBack` global event instead of leaving the app. During an Ask share, Back cancels the share and returns to the previous app.

## Build an APK locally

Install JDK 17, Android command-line tools, platform 35 and build tools 35.0.0. They can all live under `~/.local/share/` without sudo. Set these variables in the current shell; no dotfile edits are needed:

```sh
export JAVA_HOME="$HOME/.local/share/<your-jdk-17-directory>"
export ANDROID_HOME="$HOME/.local/share/<your-android-sdk-directory>"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
sdkmanager --licenses
sdkmanager 'platforms;android-35' 'build-tools;35.0.0' 'platform-tools'
vp install
cd apps/mobile/android
./gradlew assembleDebug testDebugUnitTest --console=plain
```

The Gradle `preBuild` task runs `vp run mobile#build` from the repository root and copies only `main.lynx.bundle` into generated assets. `vp` must be on PATH. The Gradle wrapper is pinned to 8.11.1 with a distribution checksum. SDK paths and build outputs are ignored.

Output: `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Install with `adb install -r <apk>` on a connected device. JVM tests use MockWebServer and require no device or emulator. They verify shared URL extraction, bearer headers and JSON payloads, duplicates, failure status handling and refusal to follow redirects with credentials.

A fresh local backend can verify the same flow as the Android client:

```sh
# Follow apps/web/README.md for apps/web/.env and local migrations first.
vp run web#dev --host 127.0.0.1 --port 5187
# In another terminal, with a fresh local database:
node apps/mobile/scripts/smoke-api.mjs http://127.0.0.1:<worker-http-port>
```

Vite’s Cloudflare development proxy currently injects `Sec-Fetch-Mode: cors`, which makes Better Auth reject originless sign-in through the Vite port. For native-client checks, target the underlying workerd HTTP listener directly (find the child `workerd` PID for this checkout and its listening ports with `ps` / `ss -tlpn`; `GET /api/setup/status` identifies the app listener). On the tested setup it is workerd’s `entry` socket, file descriptor 12. It changes on restart. Access that listener through a tailnet-only proxy for on-device local API development; deployed Workers do not have this Vite proxy. Do not disable backend CSRF checks to work around the development proxy.

The smoke script uses curl throughout and deliberately refuses non-loopback servers and already provisioned databases. It creates a throwaway account, reads `set-auth-token`, uses only bearer authorization (no Origin or Cookie), tests save/duplicate/list/detail, deletes its bookmarks/list, then revokes the session. It never logs the token or password. Native requests use the same existing backend endpoints; no backend changes are required.

## Android share behaviour

Share text or a link to **CloudKeep** from Android's share sheet (`ACTION_SEND`, `text/plain`). The first valid HTTP(S) URL in `EXTRA_TEXT` wins, with `EXTRA_SUBJECT` as fallback. Surrounding prose and unmatched closing punctuation are removed; non-HTTP URLs and embedded credentials are rejected. The server applies its normal public-URL validation.

- **Ask** (default): the translucent share activity passes the URL directly to the app, which preserves it and presents a multi-select list picker. Previously loaded lists appear from the native cache while fresh lists load in the background; saving without lists is available during loading. Saving with no selected lists is supported. After saving, choose **Return to previous app** or **Stay in CloudKeep**. Cancel discards the pending share. An unsigned-in user signs in first; the shared URL survives login and process recreation.
- **Quick save**: Settings chooses no list or one default list. A separate translucent activity uses OkHttp to POST `{ url, listIds }` with the stored bearer token, shows **Saved to CloudKeep** / **Already saved**, and finishes without constructing a LynxView or opening the main screen. It has its own task affinity and is excluded from recents. Android may briefly show a system transition or splash; a literally invisible transition is OS-controlled.
- Missing credentials, expired sessions, a deleted default list or network/server failure fall back to Ask with the URL preserved. A network timeout can mean the server already saved the link: retry is safe because the server deduplicates URLs and returns `alreadyExists`. Errors never silently report success.

Credentials and server use EncryptedSharedPreferences with an Android Keystore-backed AES256 key. Share mode, default list, pending URL and the last successful list catalog use ordinary app-private SharedPreferences, so routing an Ask share does not open Keystore. No tokens or passwords enter this cache. Account/server changes and sign-out clear the cached lists and default list. Existing installs migrate the old encrypted preferences once; the first share after upgrade may wait for this migration to preserve an existing Quick-save preference. Backups are disabled so ciphertext is not restored without its key. Sign-out clears the local token and default list even if the server is unreachable (in that case the server session expires normally). Signing into a new account/server resets the default list. HTTP requests never follow redirects, avoiding bearer leakage; release network policy rejects cleartext HTTP. The custom `NativeModules.CloudKeep.call` bridge exposes state/credential/settings operations, API requests, external HTTP(S) browser opening, toasts, pending URL access and returning to the previous app. Only the packaged bundle is loaded; no remotely supplied bundle URL is accepted.

## CI and releases

`.github/workflows/mobile-android.yml` builds debug APKs for PRs/pushes that touch mobile, dependency/tooling configuration or the workflow. It uses Node 24, pnpm 12.14.0, Temurin 17 and Android SDK setup, runs checks/tests/template typechecking and Gradle JVM tests, then uploads the debug APK as `cloudkeep-android-debug`.

A `mobile-v*` tag builds a **signed release** and creates a GitHub Release with the APK attached. Release signing requires all four repository Actions secrets:

| Secret                      | Value                                |
| --------------------------- | ------------------------------------ |
| `ANDROID_KEYSTORE_BASE64`   | Base64-encoded release keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password                    |
| `ANDROID_KEY_ALIAS`         | Signing key alias                    |
| `ANDROID_KEY_PASSWORD`      | Signing key password                 |

Create and securely retain a keystore (interactive password prompts avoid shell history):

```sh
keytool -genkeypair -v -keystore cloudkeep-release.jks -alias cloudkeep \
  -keyalg RSA -keysize 4096 -validity 10000
base64 -w 0 cloudkeep-release.jks > cloudkeep-release.base64
```

Set the four secrets in GitHub Settings → Secrets and variables → Actions. Never commit these files. Keep the same key for upgrades; losing it requires reinstalling under a new signing identity. The workflow decodes the keystore under `$RUNNER_TEMP`, removes it after the build, and fails clearly if any signing secret is missing. It never falls back to debug signing. Locally, release builds require `ANDROID_KEYSTORE_PATH` (an absolute path) plus the password/alias environment variables above.

When ready to publish a committed version:

```sh
git tag mobile-v0.1.0
git push origin mobile-v0.1.0
```

The tag suffix becomes `versionName`; the workflow run number supplies an increasing `versionCode`. Each release attaches `cloudkeep-mobile-v<version>.apk` to this repository's GitHub Release. These instructions configure future publication; implementing the prototype does not set secrets, push tags or publish a release.

## Device verification still required

The bundle, Kotlin compilation, APK packaging and JVM/API tests can run on a workstation with no emulator. Before relying on this prototype, test on a physical device: native module loading, input/keyboard/insets, images, feed scrolling/pagination/Refresh, cold/warm Ask, Quick save from several apps, expired/offline sessions, process recreation and return navigation. There is no offline queue/background worker: Quick save holds its translucent foreground activity for at most the 20-second HTTP timeout, then opens Ask on failure. Concurrent shares use one pending URL; finish the current Ask flow before sharing another link. AndroidX security-crypto is deprecated upstream but is used here for the explicitly requested Keystore-backed preference storage; a direct Keystore implementation can replace it later.

## First device-test fixes and timing

The feed's `<refresh>` + virtualized `<list>` path was unreliable with Vue Lynx 0.5.1. The confirmed defect is in the installed `node_modules/vue-lynx/main-thread/dist/list-apply.js`: it appends inserts and only reports growing `insertAction` arrays; `ops-apply.js` ignores insertion anchors for lists and removes native elements without updating list metadata. Filters, refreshes, deletion and empty/data transitions require all those operations. Matching `key`/`item-key` was already present. [Lynx lists also need a constrained viewport](https://lynxjs.org/api/elements/built-in/list.html), and [the default layout is linear](https://lynxjs.org/api/css/properties/display.html). However, inspecting the installed xelement-refresh 4.1.0 AAR (`LynxUIRefreshShadowNode.measure`) shows it measures the content with an EXACTLY height constraint, so missing `display:flex` alone does not establish the cause of the all-blank device frame. Without a device, the precise native failure remains unconfirmed; adding estimates or `full-span` would not repair the confirmed adapter defects. The reliable fallback is an ordinary vertical scroll view directly inside the explicit flex-column workspace, like Lists, the picker and Details. All loaded pages remain mounted; restore virtualization when the adapter supports dynamic insertion/removal and device tests pass. Pull-to-refresh is deferred; use Refresh.

Ask startup previously waited for Keystore in ShareActivity, rebuilt LynxView on every new intent, and held `ready` false until the entire list/tag catalog loaded. Routing now reads plain preferences and launches immediately (apart from the one-time legacy migration); MainActivity overlaps bundle reading and secure-store initialization with Lynx initialization. Quick save still never initializes Lynx or reads its bundle. After `getState`, Vue displays the picker and cached lists immediately, then fetches lists/tags independently. The cached list result can update even while tags are pending. Catalog results are checked against the current session before updating UI/cache. A `cloudkeepShare` global event reuses the warm view. Vue registers its listener before state reading and acknowledges with `frontendReady`; MainActivity then replays the latest pending share, covering intents received while the bundle or JS listener was loading. This uses the documented [global event API](https://lynxjs.org/4.0/guide/interaction/event-handling/event-propagation.html) (`LynxView.sendGlobalEvent` and `lynx.getJSModule('GlobalEventEmitter')`). Pending intent extras are consumed so rotation cannot resurrect a completed share.

The inset listener used to pad LynxView itself, but [LynxView 4.1.0 delegates measure/layout to its renderer](https://github.com/lynx-family/lynx/blob/4.1.0/platform/android/lynx_android/src/main/java/com/lynx/tasm/LynxView.java#L1080), which does not apply ordinary ViewGroup padding to the Lynx document. A native FrameLayout now measures and positions the whole LynxView within the union of `systemBars`, `displayCutout` and `ime` insets. The union takes the largest inset on each edge, avoiding double-counting the keyboard and navigation bar. `adjustResize` remains enabled for older Android versions. See [Android's edge-to-edge guidance](https://developer.android.com/develop/ui/views/layout/edge-to-edge).

Capture startup phases without URLs, list names, credentials or payloads:

```sh
adb logcat -v threadtime -s CloudKeepTiming:D '*:S'
```

Each line contains `t=<elapsedRealtime milliseconds> phase=<name>`; subtract timestamps within one share. Expected cold Ask phases: `application_create`, `share_received`, `share_mode_ready`, `ask_launch`, `main_create`, overlapping `bundle_read_start`/`bundle_read_ready` and `secure_store_start`/`secure_store_ready`, `lynx_init_start`/`lynx_init_ready`, `lynx_render_start`, `lynx_first_screen`, `state_read_start`/`state_read_ready`, `js_state_ready`, `js_picker_committed`, and later `lists_loaded`. Thread scheduling can reorder overlapping phases. `js_picker_committed` means Vue's next tick completed, not a measured Android frame. Warm Ask should show `main_new_intent`, `share_event_sent`, `js_picker_committed`, with no new Lynx initialization or bundle read. Quick should show `quick_save_start`/`quick_save_ready`, with no `main_create` or Lynx phases. Logs measure boundaries; no device latency was measured on this workstation.

Retest on the phone:

- Upgrade over the existing APK: verify Ask and the previously selected Quick/default-list preference survive migration.
- Feed: show the first 20 of the 28 links, scroll to Load more, load the remaining links, then search/filter, delete and Refresh. Check empty results and a failed/offline refresh too.
- Ask: cold start and warm app, cached lists with slow/offline networking, an empty cache, sign-in with a pending URL, save with no lists, cancel/return, and share again. Refresh should retain chosen list IDs. Rotate before saving and after cancel/save; a completed share must not reopen.
- Quick: new link, duplicate, default list, no list, expired token, deleted list and offline fallback. It should stay in the source app on success.
- Design: every screen in light and dark mode, switching the system theme while the app is open, Geist rendering, icons, the launcher icon, and Back from detail/add/lists/settings/share/dialogs.
- Insets: portrait/landscape, status bar/cutout, gesture and three-button navigation. Open the keyboard for login, Link URL, tag and list editing; focused inputs and save controls should remain reachable by scrolling.

Frontend regression tests execute App.vue's actual setup with catalog requests held open, exercise a warm-share event and ignore stale-session failures. JVM tests cover migration, pending-URL precedence, account-cache clearing and malformed list caches. Workstation tests cannot prove native rendering, focus scrolling, rotation or physical-device latency.
