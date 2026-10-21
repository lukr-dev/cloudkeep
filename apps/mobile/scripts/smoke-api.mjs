import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

// Provision a throwaway account only on a fresh loopback server. curl sends no Fetch Metadata.
const server = new URL(process.argv[2] ?? "http://127.0.0.1:5187");
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(server.hostname),
  "Smoke checks only accept a loopback server",
);
let token = "";
function request(path, method = "GET", body, expectedStatus) {
  const config = [
    ...(token ? [`header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`] : []),
    ...(body === undefined
      ? []
      : [
          'header = "Content-Type: application/json"',
          `data = ${JSON.stringify(JSON.stringify(body))}`,
        ]),
  ].join("\n");
  // Secrets go through stdin, never command arguments or logs. Redirects are not followed.
  const raw = execFileSync(
    "curl",
    [
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      "--include",
      "--request",
      method,
      "--config",
      "-",
      new URL(path, server).href,
    ],
    { input: config, encoding: "utf8" },
  );
  const separator = raw.indexOf("\r\n\r\n");
  assert(separator !== -1, "Missing HTTP response headers");
  const [statusLine, ...lines] = raw.slice(0, separator).split("\r\n");
  const status = Number(statusLine.split(" ")[1]);
  const headers = new Headers(
    lines.map((line) => {
      const index = line.indexOf(":");
      return [line.slice(0, index), line.slice(index + 1).trim()];
    }),
  );
  const data = JSON.parse(raw.slice(separator + 4));
  assert(
    expectedStatus ? status === expectedStatus : status >= 200 && status < 300,
    `${method} ${path}: ${status} ${JSON.stringify(data)}`,
  );
  return { data, headers };
}
assert(
  request("/api/setup/status").data.needsSetup,
  "Use a fresh local database, never an existing account",
);
const email = `mobile-${randomUUID()}@example.com`;
const password = randomUUID() + randomUUID();
request("/api/setup", "POST", { name: "Mobile smoke test", email, password });
const login = request("/api/auth/sign-in/email", "POST", { email, password });
token = login.headers.get("set-auth-token");
assert(token, "Sign-in must return set-auth-token");
console.log("PASS curl sign-in without Origin → set-auth-token header");
const list = request("/api/lists", "POST", { name: "Mobile smoke" }).data.list;
const created = request("/api/bookmarks", "POST", {
  url: "https://example.com/mobile-smoke",
  listIds: [list.id],
}).data;
assert.equal(created.alreadyExists, false);
const duplicate = request("/api/bookmarks", "POST", {
  url: "https://example.com/mobile-smoke",
  listIds: [list.id],
}).data;
assert.equal(duplicate.alreadyExists, true);
const collection = request(`/api/bookmarks?listId=${list.id}`).data;
assert(collection.items.some((item) => item.id === created.bookmark.id));
const detail = request(`/api/bookmarks/${created.bookmark.id}`).data.bookmark;
assert(detail.listIds.includes(list.id));
console.log(
  "PASS curl bearer GET/POST bookmarks, list membership and duplicate save without Origin/Cookie",
);
request(`/api/bookmarks/${created.bookmark.id}`, "DELETE");
request(`/api/lists/${list.id}`, "DELETE");
request("/api/auth/sign-out", "POST", {});
request("/api/bookmarks", "GET", undefined, 401);
console.log("PASS cleanup and bearer session revocation");
