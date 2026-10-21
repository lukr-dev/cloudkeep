import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Hono, type Handler } from "hono";
import { HTTPException } from "hono/http-exception";
const mocks = vi.hoisted(() => ({
  enabled: true,
  owned: true,
  head: vi.fn(),
  get: vi.fn(),
  prepare: vi.fn(),
  enqueue: vi.fn(),
  rows: [] as unknown[],
  status: "done",
}));
vi.mock("void", () => ({
  defineHandler: {
    withValidator:
      () =>
      (handler: (c: unknown, input: unknown) => unknown) =>
      (c: { req: { param: (key: string) => string } }) =>
        handler(c, { params: { id: c.req.param("id"), kind: c.req.param("kind") } }),
  },
}));
vi.mock("void/auth", () => ({ requireAuth: () => ({ id: "owner" }) }));
vi.mock("void/db", async (original) => ({
  ...(await original<typeof import("void/db")>()),
  db: { select: () => ({ from: () => ({ where: async () => mocks.rows }) }) },
}));
vi.mock("void/storage", () => ({ storage: { head: mocks.head, get: mocks.get } }));
vi.mock("./assets.ts", async (original) => ({
  ...(await original<typeof import("./assets.ts")>()),
  filesEnabled: () => mocks.enabled,
}));
vi.mock("./http.ts", async (original) => ({
  ...(await original<typeof import("./http.ts")>()),
  ownBookmark: async () => {
    if (!mocks.owned) throw new HTTPException(404, { message: "Bookmark not found" });
    return { status: mocks.status };
  },
}));
vi.mock("./audio.ts", () => ({ prepareAudio: mocks.prepare, enqueueAudio: mocks.enqueue }));
import { GET, POST } from "../routes/api/bookmarks/[id]/audio/[kind].ts";
const app = new Hono();
app.get("/:id/audio/:kind", GET as unknown as Handler);
app.post("/:id/audio/:kind", POST as unknown as Handler);
app.onError((error, c) =>
  error instanceof HTTPException
    ? c.json({ error: error.message }, error.status)
    : c.json({ error: "Unexpected" }, 500),
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = true;
  mocks.owned = true;
  mocks.status = "done";
  mocks.rows = [{ r2Key: "private-key" }];
  mocks.head.mockResolvedValue({ size: 100 });
  mocks.get.mockResolvedValue({ size: 100, body: new Uint8Array(10), httpEtag: '"etag"' });
  mocks.prepare.mockResolvedValue({ runId: "audio-run" });
  mocks.enqueue.mockResolvedValue(true);
});
it("streams partial MP3 with seek headers and safe download disposition", async () => {
  const response = await app.request("/b/audio/short?download=1", {
    headers: { Range: "bytes=10-19" },
  });
  expect(response.status).toBe(206);
  expect(response.headers.get("Content-Range")).toBe("bytes 10-19/100");
  expect(response.headers.get("Content-Length")).toBe("10");
  expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  expect(response.headers.get("Content-Disposition")).toContain("attachment;");
  expect(mocks.get).toHaveBeenCalledWith("private-key", { range: { offset: 10, length: 10 } });
});
it("rejects invalid ranges without fetching a body and streams whole objects without Range", async () => {
  const invalid = await app.request("/b/audio/full", { headers: { Range: "bytes=100-" } });
  expect(invalid.status).toBe(416);
  expect(invalid.headers.get("Content-Range")).toBe("bytes */100");
  expect(mocks.get).not.toHaveBeenCalled();
  expect((await app.request("/b/audio/full")).status).toBe(200);
});
it("enforces ownership and storage gating before reading objects or enqueueing", async () => {
  mocks.owned = false;
  expect((await app.request("/b/audio/short")).status).toBe(404);
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(404);
  mocks.owned = true;
  mocks.enabled = false;
  expect((await app.request("/b/audio/short")).status).toBe(503);
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(503);
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.prepare).not.toHaveBeenCalled();
});
it("queues full summary work once and exposes enqueue failures cleanly", async () => {
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(202);
  expect(mocks.enqueue).toHaveBeenCalledWith({
    type: "audio",
    bookmarkId: "b",
    userId: "owner",
    kind: "full",
    runId: "audio-run",
  });
  mocks.enqueue.mockClear();
  mocks.prepare.mockResolvedValue(undefined);
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(202);
  expect(mocks.enqueue).not.toHaveBeenCalled();
  mocks.prepare.mockResolvedValue({ runId: "retry" });
  mocks.enqueue.mockResolvedValue(false);
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(503);
  mocks.status = "processing";
  expect((await app.request("/b/audio/full", { method: "POST" })).status).toBe(409);
});
