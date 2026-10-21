import { defineHandler } from "void";
import { z } from "zod";
import { register, registrationBody } from "../../lib/registration.ts";

export const POST = defineHandler.withValidator({
  body: registrationBody.extend({ inviteCode: z.string().min(20).max(200) }),
})(async (c, { body }) => c.json(await register(c, body, body.inviteCode), 201));
