# CloudKeep backend

A Vue + Void 1.1.11 app on Cloudflare Workers, using Hono routes, D1/Drizzle, Better Auth email/password sessions, and a bookmark-processing queue. Every product operation uses JSON under `/api`.

## Install and run

Requires Node >=24.21.0 and the global `vp` CLI. Run from the monorepo root:

```sh
vp install
# Create apps/web/.env using the values below.
vp run web#prepare
vp run web#db:migrate
vp run dev
```

The app normally listens at http://localhost:5173. `vp run dev` selects the `web#dev` script; `vp dev` at the repo root is a different command. `void prepare` also runs as the web package's install hook. Generated `.void/` files, local D1 data, `.env`, and build output are ignored by Git.

Void only reads the app-root `.env`; it does **not** support `.env.local`, `.env.production`, or an `.env.example` workflow. Create `apps/web/.env`:

```ini
ENCRYPTION_KEY=<32 random bytes encoded as standard base64>
BETTER_AUTH_SECRET=<another independent random secret, at least 32 characters>
```

Run `openssl rand -base64 32` independently for each value. Keep the values in a password manager; losing `ENCRYPTION_KEY` makes stored provider keys unreadable. Do not replace it without re-encrypting existing keys. The encryption format is versioned; no key-rotation migration is implemented yet. AES-256-GCM uses a fresh random 12-byte IV and authenticates the user ID and provider as additional data, preventing ciphertext from being swapped between accounts/providers. Only the presence of a key is returned by the API.

Both secrets are required by the app env schema, including in development. Void normally supplies a development auth fallback and can create a production auth secret, but explicitly requiring the secret also makes it available in the generated production-preview environment. Neither secret is exposed to client code. Check local values with `(cd apps/web && vp exec void env check)`.

## Web UI

The Vue interface uses Void file-based pages and client navigation, with no UI framework or additional runtime dependencies. All account and collection data is loaded through the same-origin JSON API with the session cookie. The shared layout checks setup and session state before showing a screen; JavaScript is required. API authorization remains the security boundary.

- `/setup`: first-run admin creation and automatic sign-in. Other screens redirect here until setup is complete.
- `/login` and `/register?code=…`: password sign-in and invite registration, respectively. Sign-out is in the header.
- `/`: add links with an optional list, browse metadata, search/filter by `q`, `listId`, and `tag` query parameters, and load more. Visible pending/processing bookmarks refresh every three seconds until settled. Desktop lists/tags become select filters on mobile.
- `/b/:id`: edit title/description, read summaries, manage tags and list membership, open, reprocess, or delete a bookmark.
- `/lists`: create, rename, and delete lists while keeping their bookmarks.
- `/settings`: provider/model, saved-key presence and clearing, connection testing using saved settings, automatic tagging/summaries, and prompt customization/reset.
- `/admin/invites`: admin-only invitation creation with optional expiry, one-time link copying, paginated history, and revocation.

The interface follows system light/dark appearance, uses native labeled controls and visible keyboard focus, and shows loading, empty, and API error states. UI helper tests are in `lib/ui.test.ts`.

## Cloudflare and AI

The repository has no linked Cloudflare account or deployment target. Metadata extraction, auth, D1, queues, and external providers work locally without Cloudflare login. The initial AI provider is `null`, so new accounts do not call AI until configured; `autoTag` defaults to `true` and `autoSummary` to `false`.

For direct Cloudflare development/deployment, the owner can run these commands from `apps/web`:

```sh
vp exec void connect --platform cloudflare
# Follow Void's Cloudflare authentication flow if needed.
vp exec void secret put ENCRYPTION_KEY
# Void creates BETTER_AUTH_SECRET automatically on deploy; optionally set your own:
vp exec void secret put BETTER_AUTH_SECRET
vp exec void deploy --platform cloudflare
```

No deployment or account login was performed during implementation. Void infers D1, auth, queues and AI from the code. It provisions them and applies checked-in migrations on deploy. Review the plan/account and current Free-tier quotas before deploying. An unlinked local app uses Void's AI proxy; a direct Cloudflare project uses a remote Workers AI binding and needs a Cloudflare login/token even in development. There is no local Workers AI simulator. Void uses its own Cloudflare login (`void cloudflare login`); `wrangler login` does not configure it.

External OpenAI/OpenRouter requests go directly to their documented chat-completions endpoints with the selected user's decrypted API key. Void's `ai.provider()` uses project-wide secrets/Gateway credentials, so it is deliberately not used for per-user keys. There is no OAuth or subscription authentication. Default models:

| Provider     | Default model                        | Key                         |
| ------------ | ------------------------------------ | --------------------------- |
| `workers-ai` | `@cf/meta/llama-3.1-8b-instruct-fp8` | None                        |
| `openrouter` | `openai/gpt-4o-mini`                 | Per-user OpenRouter API key |
| `openai`     | `gpt-4o-mini`                        | Per-user OpenAI API key     |

Models are free-text IDs. Changing providers resets the selected model to that provider's default unless a model is supplied in the same PATCH. Each external provider retains its own key until explicitly cleared. External provider calls time out after 12 seconds and use at most 1,024 output tokens (`max_completion_tokens` for OpenAI, `max_tokens` elsewhere) (8 for a connection test); returned summaries are capped at 4,000 characters. Upstream error bodies and raw SDK errors are never returned to clients or stored in bookmark errors.

## Migrations and validation

```sh
vp run web#db:generate  # after editing db/schema.ts or auth configuration
vp run web#db:migrate  # apply locally without resetting data
vp check
vp test
vp run web#build
```

Review and commit the generated SQL **and** `db/migrations/meta/` files together. The initial migration contains nine application tables and four Void-generated Better Auth tables. Do not duplicate auth table definitions in `db/schema.ts`. Registration's small raw SQL batch intentionally targets the generated Better Auth `user`/`account` layout; recheck it when upgrading Void/Better Auth. SQL tests apply the actual migration and verify setup and invite consumption/rollback.

Void 1.1.11 does not document an application-route test harness. Tests cover normalization, real workerd HTMLRewriter extraction and fetch limits, templates, AI JSON parsing, encryption, password hashing, mocked external requests, and registration SQL. Live local API smoke checks additionally exercised setup/invite races, cookie-independent bearer auth, closed sign-up, authorization, bookmarks, lists, tags, settings and prompt overrides. No paid-provider calls or real Workers AI inference were made.

For a local production preview, build first with both values in `.env`. Void writes required secrets into Wrangler's **generated** preview environment (`dist/ssr/.dev.vars`, which is ignored). Do not publish that generated file. Start with `vp preview --host 127.0.0.1 --port 5184` from `apps/web`. The normal development command above needs no generated-file edits.

## Free-tier choices and limits

- [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) has a 10 ms HTTP CPU allowance. Passwords use Void's default hasher (native `node:crypto` scrypt, N=16384, r=16), and `lib/crypto.ts` mirrors it for the setup/invite registration path. Do not switch to Web Crypto PBKDF2: production Workers reject more than 100,000 iterations, even though local workerd allows it. Measure login CPU on the deployed Worker; if it regularly exceeds the free allowance, Workers Paid is the fix rather than weaker hashing.
- [Queues are available on Workers Free](https://developers.cloudflare.com/queues/platform/pricing/) with 10,000 operations/day and 24-hour retention. A normal job uses three operations (write/read/delete); other workloads/retries share that allowance. Void directly supports typed queue producers/consumers, so this app uses a queue rather than a `waitUntil` job limited to 30 seconds. Batch size is one to bound CPU per invocation.
- Create/reprocess waits only for the queue publish, then returns. Processing updates `pending → processing → done|failed`. A run ID prevents stale jobs from overwriting newer runs or restoring links to deleted bookmarks. Manual title/description edits and manually assigned tags survive reprocessing. AI tags are replaced only after a new valid tagging response; disabled AI steps retain earlier outputs.
- Automatic queue retries are disabled to avoid repeated AI charges. Reprocess is the explicit recovery action. A Worker termination may leave `pending`/`processing` without a saved error; reprocess can recover it. No scheduled recovery scanner/dead-letter queue is provisioned. Queue publish failure leaves a visible `failed` bookmark instead of losing the saved URL.
- Metadata fetch uses a shared 8-second timeout, at most four redirects, a 512 KiB streamed response limit, and a 20,000-character text limit. HTMLRewriter excludes scripts/styles/navigation/hidden content. `entities` (already used by Vue) decodes text entities without a DOM parser. No JavaScript execution, headless browser, paywall bypass, or full Readability scoring is included.
- URL normalization accepts HTTP(S) public DNS hostnames, drops fragments and common tracking query keys, sorts query keys, and preserves meaningful path/query differences. Credentials, IP literals and local/internal hostnames are rejected, including redirect targets. The deployed Workers network supplies the final private-address boundary; application code does not do DNS resolution or defeat DNS rebinding itself. Run development only in a trusted environment.
- D1 is the only data store; no R2, browser rendering, paid models or extra services are required. AI neurons, D1 storage/read/write limits, requests, and queue operations remain finite account allowances. External provider usage is billed by the provider. No quota dashboard or per-user AI budget is implemented.

## Authentication and first run

1. `GET /api/setup/status` reports `{ "needsSetup": true }` on a fresh database.
2. `POST /api/setup` creates the first account as `admin`. Sign in separately afterwards.
3. Every later registration uses `POST /api/register` and an unused admin-created invite. It creates a `user` role.

Setup inserts a permanent singleton claim and the profile, Better Auth user and credential account in one D1 transaction/batch. Competing setup requests cannot create two admins. Invite consumption and account creation are also one batch; an email conflict rolls back invite use. Setup remains closed even if all users are later removed. Public Better Auth `/api/auth/sign-up/email` is disabled in the server auth configuration. No client-supplied role is accepted. All admins can list/revoke all invites; ordinary users cannot access admin routes.

Better Auth handles sign-in/session/sign-out at `/api/auth/*`. It receives the same hash/verify functions as custom registration. Roles live in `profiles`, so editing Better Auth's user profile cannot grant admin rights. Better Auth's built-in sign-in rate limits remain enabled for deployed Cloudflare requests. The custom setup/register endpoints do not add a shared rate-limit store.

Browser clients use same-origin cookies. For a future mobile client:

```http
POST /api/auth/sign-in/email
Content-Type: application/json
Origin: https://your-cloudkeep-worker.example

{"email":"you@example.com","password":"a-long-unique-password"}
```

The response includes `token` in JSON and `set-auth-token` in its headers. Send it as `Authorization: Bearer <token>` on subsequent API calls; sign-out invalidates it. Better Auth 1.7 requires the app Origin for password sign-in, including from non-browser clients. Bearer support is enabled with Better Auth's `bearer()` plugin. There is no cross-origin browser CORS policy; the Vue UI should use the same origin. Deploy on HTTPS.

## JSON API contract

All timestamps on application resources are integer Unix milliseconds. IDs are UUID strings. Nullable extracted fields are `null`. Requests containing JSON use `Content-Type: application/json`; no-body action examples below use `{}`. Unknown body fields are rejected. JSON bodies are limited to 64 KiB before parsing. Query/param validation uses Void's Zod validators; invalid input returns `400 { error: "Validation failed", issues: [...] }`. Other errors use `{ error: string }`; unauthorized requests return 401, forbidden admin requests 403, foreign/missing resource IDs 404. Responses use `Cache-Control: no-store`.

`Pagination` means `?limit=20&offset=0` (limit 1–50, offset 0–100000). Bookmarks are ordered by creation time/id descending, lists by name/id, tags by name. Offset pagination may shift when items are inserted/deleted.

```ts
type Bookmark = {
  id: string;
  userId: string;
  url: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string | null;
  contentText: string | null;
  summary: string | null;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
  createdAt: number;
  updatedAt: number;
};
type TagLink = { id: string; name: string; source: "manual" | "ai" };
type BookmarkDetail = Bookmark & { tags: TagLink[]; listIds: string[] };
type BookmarkListItem = Omit<BookmarkDetail, "contentText">;
type List = { id: string; userId: string; name: string; createdAt: number; updatedAt: number };
type Invite = {
  id: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  usedAt: number | null;
  revokedAt: number | null;
};
type Prompt = { template: string; defaultTemplate: string; isDefault: boolean };
type Settings = {
  provider: "workers-ai" | "openrouter" | "openai" | null;
  model: string | null;
  autoTag: boolean;
  autoSummary: boolean;
  keys: { openai: { hasKey: boolean }; openrouter: { hasKey: boolean } };
  defaultModels: Record<"workers-ai" | "openrouter" | "openai", string>;
};
```

| Method | Path                               | Input                                               | Success                                                                                        |
| ------ | ---------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET    | `/api/setup/status`                | Public                                              | `{ needsSetup: boolean }`                                                                      |
| POST   | `/api/setup`                       | Public `{ email, password, name }`                  | 201 `{ user: { id, email, name, role: 'admin' } }`; 409 when closed                            |
| POST   | `/api/register`                    | Public `{ email, password, name, inviteCode }`      | 201 `{ user: { id, email, name, role: 'user' } }`; 409 invalid/used invite or existing account |
| POST   | `/api/auth/sign-in/email`          | Public `{ email, password }`, app Origin            | Better Auth `{ user, token, redirect, ... }`, session cookie and `set-auth-token` header       |
| GET    | `/api/auth/get-session`            | Session cookie or bearer                            | Better Auth `{ user, session }` or `null`                                                      |
| POST   | `/api/auth/sign-out`               | Session cookie or bearer, `{}`                      | Better Auth `{ success: true }`                                                                |
| GET    | `/api/me`                          | Authenticated                                       | `{ user: BetterAuthUser & { role: 'admin'                                                      | 'user' } }`                                                     |
| GET    | `/api/admin/invites`               | Admin; `?limit=50&offset=0` (max 100/10000)         | `{ items: Invite[], limit, offset }`                                                           |
| POST   | `/api/admin/invites`               | Admin `{ expiresAt?: number                         | null }` (future)                                                                               | 201 `{ invite: Invite, code: string }`; code is shown only once |
| DELETE | `/api/admin/invites/:id`           | Admin                                               | `{ ok: true }`; revokes without deleting history                                               |
| GET    | `/api/bookmarks`                   | Pagination; optional `listId`, `tag` (name), `q`    | `{ items: BookmarkListItem[], total, limit, offset }`                                          |
| POST   | `/api/bookmarks`                   | `{ url, title?: string                              | null, description?: string                                                                     | null, listIds?: string[] }`                                     | 201 `{ bookmark: Bookmark }`; 409 `{ error, existingBookmarkId }` |
| GET    | `/api/bookmarks/:id`               | Owner                                               | `{ bookmark: BookmarkDetail }`                                                                 |
| PATCH  | `/api/bookmarks/:id`               | Owner `{ title?: string                             | null, description?: string                                                                     | null }`, at least one                                           | `{ bookmark: Bookmark }`                                          |
| DELETE | `/api/bookmarks/:id`               | Owner                                               | `{ ok: true }`; cascades memberships/tags, keeps lists and tag names                           |
| POST   | `/api/bookmarks/:id/reprocess`     | Owner `{}`                                          | 202 `{ bookmark: Bookmark }`; 503 with failed bookmark when enqueue fails                      |
| POST   | `/api/bookmarks/:id/tags`          | Owner `{ name: string }`                            | `{ tag: TagLink }`; promotes an AI tag to manual                                               |
| DELETE | `/api/bookmarks/:id/tags/:tagId`   | Owner                                               | `{ ok: true }`                                                                                 |
| PUT    | `/api/bookmarks/:id/lists/:listId` | Owner of both, `{}`                                 | `{ ok: true }`; idempotent membership                                                          |
| DELETE | `/api/bookmarks/:id/lists/:listId` | Owner of both                                       | `{ ok: true }`                                                                                 |
| GET    | `/api/lists`                       | Pagination                                          | `{ items: Array<Omit<List,'userId'> & { count: number }>, limit, offset }`                     |
| POST   | `/api/lists`                       | `{ name: string }`                                  | 201 `{ list: List }`                                                                           |
| GET    | `/api/lists/:id`                   | Owner                                               | `{ list: List }`                                                                               |
| PATCH  | `/api/lists/:id`                   | Owner `{ name: string }`                            | `{ list: List }`                                                                               |
| DELETE | `/api/lists/:id`                   | Owner                                               | `{ ok: true }`; bookmarks survive                                                              |
| GET    | `/api/tags`                        | Pagination                                          | `{ items: { id, name, count }[], limit, offset }`; unused tags have count 0                    |
| GET    | `/api/settings`                    | Authenticated                                       | `Settings`                                                                                     |
| PATCH  | `/api/settings`                    | `{ provider?, model?: string                        | null, autoTag?, autoSummary?, keys?: { openai?: string                                         | null, openrouter?: string                                       | null } }`                                                         | `Settings`; omit key to keep, `null` to clear |
| POST   | `/api/settings/ai/test`            | `{}`; tests **saved** settings                      | `{ ok: true }`; 400 no provider, 502 upstream/config failure                                   |
| GET    | `/api/settings/prompts`            | Authenticated                                       | `{ tagging: Prompt, summary: Prompt, variables: string[] }`                                    |
| PUT    | `/api/settings/prompts/:kind`      | `{ template: string }`; kind `tagging` or `summary` | `Prompt`                                                                                       |
| DELETE | `/api/settings/prompts/:kind`      | Kind `tagging` or `summary`                         | Reset to default; returns `Prompt`                                                             |

The create response is the bookmark snapshot before processing; poll GET detail/list for updated status. A queue-publish failure on create still returns 201 with `status: 'failed'` because the bookmark was saved. Creation can include up to 30 owned list IDs. Title/description limits are 1,000/4,000 characters; supplying them on create counts as a manual edit, including an explicit `null`. Lists have names of 1–100 characters. Tags are trimmed/lowercased, 1–40 characters. URL changes are intentionally not part of PATCH; create a new bookmark for another URL. Text search is literal LIKE matching on title, URL and description; `%`, `_` and backslash are escaped.

## Editable prompts

Default templates are in `lib/prompts.ts`. Tagging requests 3–5 concise topic tags, prefers existing user tags, and requires `{ "tags": ["tag"] }`. Model output may be fenced JSON or a JSON array. It must contain at most 20 candidate strings, each 1–40 characters after normalization; duplicates are removed and at most five tags are linked. Invalid output fails the job without replacing previous AI tags. Existing manual links win over AI links. Up to 200 existing user tag names are supplied to control prompt size.

Overrides are 1–12,000 characters. Supported variables are `{{url}}`, `{{title}}`, `{{description}}`, `{{content}}`, `{{existing_tags}}` (JSON array), and `{{language}}` (currently English). Spaces inside braces are supported. Substitution is one pass, so page text cannot introduce another interpolation. Unknown placeholders remain unchanged. Templates warn the model that page content is untrusted; AI output is validated independently.

`prompts.list_id` is nullable and indexed separately for null/global vs non-null/list scope. This avoids SQLite's NULL-uniqueness pitfall. Only global prompts are exposed or read today; per-list prompt precedence and endpoints are intentionally deferred.

## Remaining work

Build a mobile client against this contract. Measure deployed CPU and account quotas; verify real Workers AI and external-provider inference with owner credentials. Add key rotation and operational recovery/queue monitoring if needed. Add email delivery/verification/password-reset UX only when required; this phase has no email service. No admin role editor, import/export, archived content, full Readability scoring, or per-list prompts are implemented.

The current Void docs largely match the brief. Differences: init inside an existing workspace configures the app without a Vue picker (the documented `@void/vue` adapter was added manually); `--no-git` is rejected for workspace subpackages; Void already uses native scrypt; Queues now work on Free; unlinked local AI uses a Void proxy rather than the direct remote binding; env files other than `.env` are unsupported; and Better Auth tables/migrations are generated automatically and must not be duplicated in the app schema. `defineConfig` from `vite-plus` works with Void, so no lint-rule exception is needed.
