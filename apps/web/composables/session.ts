import { inject, type InjectionKey, type Ref } from "vue";
import type { User } from "../lib/api.ts";
export const sessionKey: InjectionKey<Ref<User | null>> = Symbol("session");
export function useSession() {
  const session = inject(sessionKey);
  if (!session) throw new Error("Session requires the app layout");
  return session;
}
