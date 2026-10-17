import { defineAuth } from "void/auth";
import { bearer } from "better-auth/plugins";

export default defineAuth(({ defaults }) => ({
  ...defaults,
  emailAndPassword: {
    ...defaults.emailAndPassword,
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  plugins: [...(defaults.plugins ?? []), bearer()],
}));
