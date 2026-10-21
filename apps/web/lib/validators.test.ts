import { expect, it, vi } from "vite-plus/test";
vi.mock("void/db", () => ({
  db: {},
  and: vi.fn(),
  eq: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));
import { createBookmark, editBookmark } from "./validators.ts";

it("keeps the existing link request and defaults backward compatible", () => {
  expect(createBookmark.parse({ url: "https://example.com/#fragment" })).toEqual({
    url: "https://example.com/",
    listIds: [],
  });
  expect(
    createBookmark.parse({
      type: "link",
      url: "https://example.com",
      title: null,
      description: "description",
    }),
  ).toMatchObject({ type: "link", title: null, description: "description" });
});
it("validates note length and rejects mixed types, unknown fields and unowned input shapes", () => {
  expect(createBookmark.parse({ type: "text", text: "# Note", title: "Title" })).toMatchObject({
    type: "text",
    text: "# Note",
    listIds: [],
  });
  expect(createBookmark.safeParse({ type: "text", text: "a".repeat(100_000) }).success).toBe(true);
  for (const body of [
    { type: "text", text: "" },
    { type: "text", text: "a".repeat(100_001) },
    { text: "note" },
    { type: "text", text: "note", url: "https://example.com" },
    { type: "asset", url: "https://example.com" },
    { type: "text", text: "note", listIds: ["bad"] },
  ])
    expect(createBookmark.safeParse(body).success).toBe(false);
  expect(editBookmark.parse({ text: "updated" })).toEqual({ text: "updated" });
  for (const body of [{}, { text: "" }, { assetKey: "secret" }])
    expect(editBookmark.safeParse(body).success).toBe(false);
});
