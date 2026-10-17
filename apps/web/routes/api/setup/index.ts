import { defineHandler } from "void";
import { register, registrationBody } from "../../../lib/registration.ts";

export const POST = defineHandler.withValidator({ body: registrationBody })(async (c, { body }) =>
  c.json(await register(c, body), 201),
);
