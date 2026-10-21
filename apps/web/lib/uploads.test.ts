import { beforeEach, expect, it, vi } from "vite-plus/test";
import { Hono, type Handler } from "hono";
import { HTTPException } from "hono/http-exception";
const mocks = vi.hoisted(() => ({
  enabled: true,
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  batch: vi.fn(),
  owned: [] as { id: string }[],
  enqueue: vi.fn(),
}));
vi.mock("void", () => ({ defineHandler: (handler: unknown) => handler }));
vi.mock("void/auth", () => ({ requireAuth: () => ({ id: "owner" }) }));
vi.mock("void/storage", () => ({
  storage: new Proxy(
    { put: mocks.put, get: mocks.get, delete: mocks.delete },
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
    select: () => ({ from: () => ({ where: async () => mocks.owned }) }),
    insert: () => ({ values: () => ({ returning: () => ({}) }) }),
    batch: mocks.batch,
  },
}));
vi.mock("./enqueue.ts", () => ({ enqueue: mocks.enqueue }));
import { POST } from "../routes/api/bookmarks/files.ts";
const app = new Hono();
app.post("/files", POST as unknown as Handler);
app.onError((error, c) =>
  error instanceof HTTPException
    ? c.json({ error: error.message }, error.status)
    : c.json({ error: "Unexpected" }, 500),
);
function upload(headers: Record<string, string> = {}, query = "") {
  return app.request(`/files${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": "12",
      "X-File-Name": "test.png",
      ...headers,
    },
    body: new Uint8Array(12),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled = true;
  mocks.owned = [];
  mocks.put.mockResolvedValue({ size: 12 });
  mocks.get.mockResolvedValue({
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]).buffer,
  });
  mocks.delete.mockResolvedValue(undefined);
  mocks.enqueue.mockResolvedValue(true);
  mocks.batch.mockResolvedValue([[{ id: "bookmark", assetKey: "private", type: "asset" }]]);
});
it("streams the original body, checks only the header range and hides storage keys", async () => {
  const response = await upload();
  expect(response.status).toBe(201);
  expect(mocks.put.mock.calls[0]?.[0]).toMatch(/^assets\/owner\//);
  expect(mocks.put.mock.calls[0]?.[1]).toBeInstanceOf(ReadableStream);
  expect(mocks.get).toHaveBeenCalledWith(expect.any(String), { range: { offset: 0, length: 12 } });
  const { bookmark } = (await response.json()) as { bookmark: Record<string, unknown> };
  expect(bookmark.assetKey).toBeUndefined();
  expect(bookmark.hasFile).toBe(true);
  expect(bookmark.fileUrl).toBe("/api/bookmarks/bookmark/file");
});
it("deletes a mismatched object without creating or enqueueing a row", async () => {
  mocks.get.mockResolvedValue({
    arrayBuffer: async () => new TextEncoder().encode("<svg></svg>").buffer,
  });
  expect((await upload()).status).toBe(415);
  expect(mocks.delete).toHaveBeenCalledOnce();
  expect(mocks.batch).not.toHaveBeenCalled();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("cleans up the object if its DB batch fails", async () => {
  mocks.batch.mockRejectedValue(new Error("private database details"));
  const response = await upload();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Could not save file; please retry" });
  expect(mocks.delete).toHaveBeenCalledOnce();
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it("rejects invalid metadata and foreign lists before touching storage", async () => {
  expect((await upload({ "Content-Type": "image/svg+xml" })).status).toBe(415);
  expect((await upload({ "Content-Length": "26214401" })).status).toBe(413);
  expect((await upload({ "Content-Length": "" })).status).toBe(411);
  expect((await upload({ "X-File-Name": "%oops" })).status).toBe(400);
  expect((await upload({}, "?listId=00000000-0000-4000-8000-000000000000")).status).toBe(404);
  expect(mocks.put).not.toHaveBeenCalled();
});

it("checks short objects without requesting an unsatisfiable R2 range", async () => {
  mocks.put.mockResolvedValue({ size: 3 });
  mocks.get.mockResolvedValue({ arrayBuffer: async () => new ArrayBuffer(3) });
  expect((await upload({ "Content-Length": "3" })).status).toBe(415);
  expect(mocks.get).toHaveBeenCalledWith(expect.any(String), { range: { offset: 0, length: 3 } });
  expect(mocks.delete).toHaveBeenCalledOnce();
});

it("returns a controlled 503 before touching storage when uploads are disabled", async () => {
  mocks.enabled = false;
  const response = await upload();
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "File uploads are disabled on this server" });
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.batch).not.toHaveBeenCalled();
});
