import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Hono, type Handler } from "hono";
import { HTTPException } from "hono/http-exception";

const mocks = vi.hoisted(() => ({
  enabled: false,
  get: vi.fn(),
  deleteObject: vi.fn(),
  deleteRow: vi.fn(),
  bookmark: {
    id: "asset",
    type: "asset",
    assetKey: "private",
    assetMime: "image/png",
    assetName: "photo.png",
  },
}));
vi.mock("void", () => ({
  defineHandler: Object.assign((handler: unknown) => handler, {
    withValidator:
      () =>
      (handler: (c: unknown, input: { params: { id: string } }) => unknown) =>
      (c: { req: { param: (key: string) => string } }) =>
        handler(c, { params: { id: c.req.param("id") } }),
  }),
}));
vi.mock("void/auth", () => ({ requireAuth: () => ({ id: "owner" }) }));
vi.mock("void/storage", () => ({
  storage: new Proxy(
    { get: mocks.get, delete: mocks.deleteObject, put: () => {} },
    {
      get(target, prop) {
        if (!mocks.enabled) throw new Error("env: Missing Cloudflare binding 'STORAGE'.");
        return Reflect.get(target, prop);
      },
    },
  ),
}));
vi.mock("void/db", async (original) => ({
  ...(await original<typeof import("void/db")>()),
  db: {
    delete: () => ({ where: mocks.deleteRow }),
    select: () => ({ from: () => ({ where: async () => [] }) }),
  },
}));
vi.mock("./http.ts", async (original) => ({
  ...(await original<typeof import("./http.ts")>()),
  ownBookmark: async () => mocks.bookmark,
  profileFor: async () => ({ role: "admin" }),
}));
vi.mock("./enqueue.ts", () => ({ enqueue: vi.fn() }));
import { GET as file } from "../routes/api/bookmarks/[id]/file.ts";
import { DELETE as remove } from "../routes/api/bookmarks/[id]/index.ts";
import { GET as me } from "../routes/api/me.ts";

const app = new Hono();
app.get("/:id/file", file as unknown as Handler);
// Invoke JSON-returning handlers directly; Hono handles the streaming response.
async function invoke(handler: typeof me | typeof remove, path: string) {
  const c = { req: { param: () => path } };
  return handler(c as never);
}
app.onError((error, c) =>
  error instanceof HTTPException
    ? c.json({ error: error.message }, error.status)
    : c.json({ error: "Unexpected" }, 500),
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = false;
});
it("returns a controlled 503 for an existing file without accessing R2", async () => {
  const response = await app.request("/asset/file");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "File uploads are disabled on this server" });
  expect(mocks.get).not.toHaveBeenCalled();
});
it("deletes the bookmark row while skipping disabled R2", async () => {
  expect(await invoke(remove, "asset")).toEqual({ ok: true });
  expect(mocks.deleteRow).toHaveBeenCalledOnce();
  expect(mocks.deleteObject).not.toHaveBeenCalled();
});
it("exposes storage availability in the session response", async () => {
  expect(await invoke(me, "me")).toMatchObject({ features: { files: false } });
  mocks.enabled = true;
  expect(await invoke(me, "me")).toMatchObject({ features: { files: true } });
});
it("serves enabled files with stored MIME, private caching, sandbox and safe disposition", async () => {
  mocks.enabled = true;
  mocks.get.mockResolvedValue({
    body: new Uint8Array([137, 80, 78, 71]),
    size: 4,
    httpEtag: '"etag"',
  });
  const response = await app.request("/asset/file?download=1");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
  expect(response.headers.get("ETag")).toBe('"etag"');
  expect(response.headers.get("Content-Security-Policy")).toBe(
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  );
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect((await app.request("/asset/file")).headers.get("Content-Disposition")).toContain(
    "inline;",
  );
});
it("still deletes the row if enabled R2 deletion fails", async () => {
  mocks.enabled = true;
  mocks.deleteObject.mockRejectedValue(new Error("private storage details"));
  expect(await invoke(remove, "asset")).toEqual({ ok: true });
  expect(mocks.deleteRow).toHaveBeenCalledOnce();
  expect(mocks.deleteObject).toHaveBeenCalledWith("private");
});
