import { defineHandler } from "void";
import { db, eq } from "void/db";
import { env } from "void/env";
import { z } from "zod";
import { profiles } from "../../../db/schema.ts";
import { profileFor } from "../../../lib/http.ts";
import { publicSettings } from "../../../lib/settings.ts";
import { providerSchema } from "../../../lib/providers.ts";
import { encrypt } from "../../../lib/crypto.ts";

export const GET = defineHandler(async (c) => publicSettings(await profileFor(c)));
export const PATCH = defineHandler.withValidator({
  body: z
    .object({
      provider: providerSchema.nullable().optional(),
      model: z.string().trim().min(1).max(200).nullable().optional(),
      autoTag: z.boolean().optional(),
      autoSummary: z.boolean().optional(),
      keys: z
        .object({
          openai: z.string().trim().min(1).max(4096).nullable().optional(),
          openrouter: z.string().trim().min(1).max(4096).nullable().optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
})(async (c, { body }) => {
  const profile = await profileFor(c);
  const { keys, ...settings } = body;
  const changes: Partial<typeof profiles.$inferInsert> = { ...settings };
  if (body.provider !== undefined && body.provider !== profile.provider && body.model === undefined)
    changes.model = null;
  for (const provider of ["openai", "openrouter"] as const) {
    const value = keys?.[provider];
    if (value !== undefined)
      changes[provider === "openai" ? "openaiKey" : "openrouterKey"] =
        value === null
          ? null
          : await encrypt(value, env.ENCRYPTION_KEY, `${profile.userId}:${provider}`);
  }
  if (Object.keys(changes).length)
    await db.update(profiles).set(changes).where(eq(profiles.userId, profile.userId));
  return publicSettings({ ...profile, ...changes });
});
