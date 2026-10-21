import { createInsertSchema } from "void/drizzle-zod";
import { z } from "zod";
import { bookmarks, lists } from "../db/schema.ts";
import { idSchema } from "./http.ts";
import { normalizeUrl } from "./url.ts";

const bookmarkInput = createInsertSchema(bookmarks, {
  title: z.string().trim().max(1_000).nullable().optional(),
  description: z.string().trim().max(4_000).nullable().optional(),
});
export const createBookmark = bookmarkInput
  .pick({ title: true, description: true })
  .extend({
    url: z
      .string()
      .max(8_000)
      .transform((value, ctx) => {
        try {
          return normalizeUrl(value);
        } catch {
          ctx.addIssue({ code: "custom", message: "Use a public HTTP(S) URL without credentials" });
          return z.NEVER;
        }
      }),
    listIds: z
      .array(idSchema)
      .max(30)
      .transform((ids) => [...new Set(ids)])
      .default([]),
  })
  .strict();
export const editBookmark = bookmarkInput
  .pick({ title: true, description: true })
  .extend({ archived: z.boolean().optional() })
  .strict()
  .refine(
    (v) => v.title !== undefined || v.description !== undefined || v.archived !== undefined,
    "Supply a title, description or archived flag",
  );
export const archivedQuery = z
  .enum(["1", "true", "0", "false"])
  .optional()
  .transform((value) => value === "1" || value === "true");
export const listBody = createInsertSchema(lists, { name: z.string().trim().min(1).max(100) })
  .pick({ name: true })
  .strict();
export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});
