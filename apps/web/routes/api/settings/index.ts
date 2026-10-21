import { defineHandler } from "void";
import { db, eq } from "void/db";
import { env } from "void/env";
import { z } from "zod";
import { profiles } from "../../../db/schema.ts";
import { profileFor } from "../../../lib/http.ts";
import { filesEnabled, FILES_DISABLED_MESSAGE } from "../../../lib/assets.ts";
import { fail } from "../../../lib/http.ts";
import { publicSettings } from "../../../lib/settings.ts";
import {
  DEFAULT_REASONING_EFFORT,
  providerSchema,
  reasoningEffortSchema,
} from "../../../lib/providers.ts";
import { encrypt } from "../../../lib/crypto.ts";

export const GET = defineHandler(async (c) => publicSettings(await profileFor(c)));
export const PATCH = defineHandler.withValidator({
  body: z
    .object({
      provider: providerSchema.nullable().optional(),
      model: z.string().trim().min(1).max(200).nullable().optional(),
      reasoningEffort: reasoningEffortSchema.nullable().optional(),
      ttsProvider: providerSchema.nullable().optional(),
      ttsModel: z.string().trim().min(1).max(200).nullable().optional(),
      ttsVoice: z.string().trim().min(1).max(200).nullable().optional(),
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
  if (
    !filesEnabled() &&
    (body.ttsProvider !== undefined || body.ttsModel !== undefined || body.ttsVoice !== undefined)
  )
    return fail(503, FILES_DISABLED_MESSAGE);
  const profile = await profileFor(c);
  const { keys, ...settings } = body;
  const changes: Partial<typeof profiles.$inferInsert> = { ...settings };
  if (body.provider !== undefined && body.provider !== profile.provider && body.model === undefined)
    changes.model = null;
  if (
    body.provider !== undefined &&
    body.provider !== profile.provider &&
    body.reasoningEffort === undefined
  )
    changes.reasoningEffort = body.provider ? DEFAULT_REASONING_EFFORT[body.provider] : null;
  if (body.ttsProvider !== undefined && body.ttsProvider !== profile.ttsProvider) {
    if (body.ttsModel === undefined) changes.ttsModel = null;
    if (body.ttsVoice === undefined) changes.ttsVoice = null;
  }
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
