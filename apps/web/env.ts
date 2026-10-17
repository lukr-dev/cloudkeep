import { defineEnv, string } from "void/env";

export default defineEnv({
  ENCRYPTION_KEY: string(),
  BETTER_AUTH_SECRET: string(),
  // When set, first-run setup requires this token so a fresh public deploy can't be claimed.
  SETUP_TOKEN: string().optional(),
});
