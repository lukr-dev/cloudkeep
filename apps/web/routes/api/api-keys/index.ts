import { defineHandler } from "void";
import { requireAuth } from "void/auth";
import { db, desc, eq } from "void/db";
import { z } from "zod";
import { apiKeys } from "../../../db/schema.ts";
import { apiKeyHash, generateApiKey } from "../../../lib/api-keys.ts";

export const GET = defineHandler(async (c) => ({
  items: await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, requireAuth(c).id))
    .orderBy(desc(apiKeys.createdAt)),
}));
export const POST = defineHandler.withValidator({
  body: z
    .object({
      name: z.string().trim().min(1).max(100),
      expiresAt: z
        .number()
        .int()
        .positive()
        .refine((v) => v > Date.now(), "Expiry must be in the future")
        .nullable()
        .optional(),
    })
    .strict(),
})(async (c, { body }) => {
  const userId = requireAuth(c).id;
  const key = generateApiKey();
  const item = {
    id: crypto.randomUUID(),
    name: body.name,
    prefix: key.slice(0, 11),
    createdAt: Date.now(),
    expiresAt: body.expiresAt ?? null,
  };
  await db.insert(apiKeys).values({ ...item, userId, keyHash: (await apiKeyHash(key))! });
  return c.json({ item, key }, 201);
});
