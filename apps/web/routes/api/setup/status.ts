import { defineHandler } from "void";
import { env } from "void/env";

export const GET = defineHandler(async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT (EXISTS (SELECT 1 FROM user) OR EXISTS (SELECT 1 FROM setup)) AS complete",
  ).first<{ complete: number }>();
  const needsSetup = !row?.complete;
  return { needsSetup, tokenRequired: needsSetup && !!env.SETUP_TOKEN };
});
