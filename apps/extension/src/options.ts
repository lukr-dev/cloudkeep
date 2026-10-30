import "./style.css";
import { client, serverOrigin } from "./logic.ts";
import { clearToken, sessionMessage, settings } from "./storage.ts";
const form = document.querySelector<HTMLFormElement>("#signin")!;
const server = document.querySelector<HTMLInputElement>("#server")!;
const email = document.querySelector<HTMLInputElement>("#email")!;
const password = document.querySelector<HTMLInputElement>("#password")!;
const badge = document.querySelector<HTMLInputElement>("#badge")!;
const signout = document.querySelector<HTMLButtonElement>("#signout")!;
const status = document.querySelector<HTMLElement>("#status")!;
const error = document.querySelector<HTMLElement>("#error")!;
function fail(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : "Request failed.";
}
async function render() {
  const config = await settings();
  server.value = config.server;
  badge.checked = config.badge;
  form.hidden = Boolean(config.token);
  signout.hidden = !config.token;
  status.textContent = config.token
    ? `Signed in to ${config.server}`
    : "Sign in to save pages from your toolbar.";
}
form.onsubmit = async (event) => {
  event.preventDefault();
  error.textContent = "";
  const submit = form.querySelector<HTMLButtonElement>("button")!;
  try {
    const origin = serverOrigin(server.value);
    // Request in the submit gesture, before awaiting storage or network work.
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) throw new Error("Allow access to your CloudKeep server to sign in.");
    submit.disabled = true;
    const response = await fetch(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.value, password: password.value }),
    });
    password.value = "";
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error?.message || data.error || data.message || "Sign in failed.");
    const token = response.headers.get("set-auth-token") || data.token;
    if (typeof token !== "string" || !token)
      throw new Error("The server did not return a session token.");
    await sessionMessage({ type: "setSession", server: origin, token });
    await render();
  } catch (reason) {
    password.value = "";
    fail(reason);
  } finally {
    submit.disabled = false;
  }
};
signout.onclick = async () => {
  signout.disabled = true;
  const config = await settings();
  try {
    await client(config, () => clearToken(config.token))("/api/auth/sign-out", "POST", {});
  } catch {
    /* Local sign-out must work offline. */
  }
  await sessionMessage({ type: "signOut", token: config.token });
  signout.disabled = false;
  await render();
};
badge.onchange = () => {
  void chrome.storage.local.set({ badge: badge.checked }).catch(fail);
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.token) void render().catch(fail);
});
void render().catch(fail);
