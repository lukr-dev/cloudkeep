import { defineEnv, string } from "void/env";

export default defineEnv({
  ENCRYPTION_KEY: string(),
  BETTER_AUTH_SECRET: string(),
});
