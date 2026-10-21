import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api, allItems, bookmarkQuery, serverOrigin, signIn } from "./api.ts";
import { native } from "./native.ts";

vi.mock("./native.ts", () => ({ native: vi.fn() }));
const bridge = vi.mocked(native);
beforeEach(() => bridge.mockReset());

describe("native API client", () => {
  it("stores the bearer header from sign-in and clears the previous identity first", async () => {
    bridge
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ status: 200, body: '{"user":{}}', token: "session-token" })
      .mockResolvedValueOnce(true);
    await signIn(" https://keep.example/ ", " a@example.com ", "password");
    expect(bridge.mock.calls).toEqual([
      ["setCredentials", { server: "https://keep.example", token: "" }],
      [
        "request",
        {
          path: "/api/auth/sign-in/email",
          method: "POST",
          body: JSON.stringify({ email: "a@example.com", password: "password" }),
        },
      ],
      ["setCredentials", { server: "https://keep.example", token: "session-token" }],
    ]);
  });
  it("refuses a successful cookie-only login", async () => {
    bridge
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ status: 200, body: "{}", token: "" });
    await expect(signIn("https://keep.example", "a@example.com", "password")).rejects.toThrow(
      "No bearer token",
    );
    expect(bridge).toHaveBeenCalledTimes(2);
  });
  it("surfaces auth expiry and backend errors", async () => {
    bridge.mockResolvedValue({ status: 401, body: '{"error":"Unauthorized"}', token: "" });
    await expect(api("/api/bookmarks")).rejects.toMatchObject({
      status: 401,
      message: "Unauthorized",
    });
  });
  it("reports malformed responses and network failures", async () => {
    bridge.mockResolvedValueOnce({ status: 502, body: "<html>Error</html>", token: "" });
    await expect(api("/api/bookmarks")).rejects.toThrow("invalid response");
    bridge.mockRejectedValueOnce(new Error("offline"));
    await expect(api("/api/bookmarks")).rejects.toMatchObject({ status: 0 });
  });
  it("loads all list pages", async () => {
    bridge
      .mockResolvedValueOnce({
        status: 200,
        body: JSON.stringify({ items: Array.from({ length: 50 }, (_, id) => ({ id })) }),
        token: "",
      })
      .mockResolvedValueOnce({ status: 200, body: '{"items":[{"id":50}]}', token: "" });
    expect(await allItems("/api/lists")).toHaveLength(51);
    expect(bridge).toHaveBeenLastCalledWith("request", {
      path: "/api/lists?limit=50&offset=50",
      method: "GET",
    });
  });
  it("encodes filters and pagination without browser URL globals", () => {
    expect(bookmarkQuery(" a & b ", "list-id", "Vue JS", 20)).toBe(
      "/api/bookmarks?q=a%20%26%20b&listId=list-id&tag=vue%20js&offset=20&limit=20",
    );
  });
  it("rejects credentials, paths and unsupported protocols in server origins", () => {
    for (const input of [
      "file:///tmp",
      "https://user:pass@keep.example",
      "https://keep.example/api",
      "https://keep.example?x=1",
      "https://keep.example#token",
    ])
      expect(() => serverOrigin(input)).toThrow();
    expect(serverOrigin("http://10.0.2.2:5173/")).toBe("http://10.0.2.2:5173");
  });
});
