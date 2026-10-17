# CloudKeep Android prototype

Vue Lynx frontend with a hand-written Kotlin Android host. The host loads `main.lynx.bundle` from packaged assets; the shipped app does not use Lynx Explorer. Android 8+ (API 26), ARM64 and x86_64. Bookmarks, search, list/tag filters, pull to refresh, pagination, details, editable tags/list membership, list CRUD, manual saving, login/logout and share preferences are included. AI configuration, prompts and admin invites remain on the web.

## Layout

```text
src/                   Vue Lynx screens, native bridge, API helpers and tests
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

The app uses native `default-value` / `@input` bindings (`event.detail.value`) and imperative `setValue` for programmatic changes because native `v-model` is not implemented in Vue Lynx. A small tested binding avoids rewriting native text on every keystroke (preserving cursor/focus), while resetting cleared passwords and pre-filling shared URLs or renamed lists. Screens use small reactive navigation state; no browser history, KeepAlive or Teleport is needed. Bookmark rows use virtualized `<list>` / `<list-item>` with matching keys. Native XElement input/refresh packages and image/HTTP services are registered in the host. Pull to refresh calls `finishRefresh` after success or failure.

Vue Lynx 0.5.1 is pre-alpha. Rspeedy is pinned to 0.13.3 / Rsbuild 1 to match its peer requirements; mobile TypeScript is pinned to 5.9.3 because Rspeedy needs the JavaScript compiler API that the repository's TypeScript 7 package does not provide. Vue and Vite+ use workspace catalog versions. `vue-tsc` checks Lynx templates with its Volar plugin; Vite+ checks the rest. An ordinary `*.vue` module declaration supports Vite+'s TypeScript check; there are no Lynx source lint/format ignores. `list-item` uses `v-bind="{ 'item-key': ... }"` to preserve the required hyphenated property in Vue Lynx's generated types. The transitive `core-js` install script only prints funding information and is explicitly disabled in workspace build policy.

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

- **Ask** (default): the translucent share activity stores the URL, opens the app, and presents a multi-select list picker. Saving with no selected lists is supported. After saving, choose **Return to previous app** or **Stay in CloudKeep**. Cancel discards the pending share. An unsigned-in user signs in first; the shared URL survives login and process recreation.
- **Quick save**: Settings chooses no list or one default list. A separate translucent activity uses OkHttp to POST `{ url, listIds }` with the stored bearer token, shows **Saved to CloudKeep** / **Already saved**, and finishes without constructing a LynxView or opening the main screen. It has its own task affinity and is excluded from recents. Android may briefly show a system transition or splash; a literally invisible transition is OS-controlled.
- Missing credentials, expired sessions, a deleted default list or network/server failure fall back to Ask with the URL preserved. A network timeout can mean the server already saved the link: retry is safe because the server deduplicates URLs and returns `alreadyExists`. Errors never silently report success.

Credentials, server, preferences and pending URL use EncryptedSharedPreferences with an Android Keystore-backed AES256 key. Backups are disabled so ciphertext is not restored without its key. Sign-out clears the local token and default list even if the server is unreachable (in that case the server session expires normally). Signing into a new account/server resets the default list. HTTP requests never follow redirects, avoiding bearer leakage; release network policy rejects cleartext HTTP. The custom `NativeModules.CloudKeep.call` bridge exposes state/credential/settings operations, API requests, external HTTP(S) browser opening, toasts, pending URL access and returning to the previous app. Only the packaged bundle is loaded; no remotely supplied bundle URL is accepted.

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

The bundle, Kotlin compilation, APK packaging and JVM/API tests can run on a workstation with no emulator. Before relying on this prototype, test on a physical device: native module loading, input/keyboard/insets, images, scrolling and pull to refresh, cold/warm Ask, Quick save from several apps, expired/offline sessions, process recreation and return navigation. There is no offline queue/background worker: Quick save holds its translucent foreground activity for at most the 20-second HTTP timeout, then opens Ask on failure. Concurrent shares use one pending URL; finish the current Ask flow before sharing another link. AndroidX security-crypto is deprecated upstream but is used here for the explicitly requested Keystore-backed preference storage; a direct Keystore implementation can replace it later.
