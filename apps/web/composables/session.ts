import { inject, type InjectionKey, type Ref } from "vue";
import type { Features, User } from "../lib/api.ts";
export const sessionKey: InjectionKey<Ref<User | null>> = Symbol("session");
export function useSession() {
  const session = inject(sessionKey);
  if (!session) throw new Error("Session requires the app layout");
  return session;
}

export const featuresKey: InjectionKey<Ref<Features>> = Symbol("features");
export function useFeatures() {
  const features = inject(featuresKey);
  if (!features) throw new Error("Features require the app layout");
  return features;
}

export const setupTokenRequiredKey: InjectionKey<Ref<boolean>> = Symbol("setupTokenRequired");
