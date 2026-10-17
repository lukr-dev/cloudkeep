import { defineHandler } from "void";
import { env } from "void/env";
import { z } from "zod";
import { register, registrationBody } from "../../../lib/registration.ts";
import { safeEqual } from "../../../lib/crypto.ts";
import { fail } from "../../../lib/http.ts";

export const POST = defineHandler.withValidator({
  body: registrationBody.extend({ setupToken: z.string().max(200).optional() }),
})(async (c, { body }) => {
  const { setupToken, ...input } = body;
  if (env.SETUP_TOKEN && !(setupToken && (await safeEqual(setupToken, env.SETUP_TOKEN))))
    return fail(403, "Setup token is missing or incorrect");
  return c.json(await register(c, input), 201);
});
