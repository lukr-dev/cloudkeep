import "./style.css";
import { eligible, type List, type SessionState } from "./logic.ts";
import { settings } from "./storage.ts";
const status = document.querySelector<HTMLElement>("#status")!;
const error = document.querySelector<HTMLElement>("#error")!;
const filter = document.querySelector<HTMLInputElement>("#filter")!;
const container = document.querySelector<HTMLElement>("#lists")!;
const undo = document.querySelector<HTMLButtonElement>("#undo")!;
const signIn = document.querySelector<HTMLButtonElement>("#settings")!;
let lists: List[] = [];
let state: SessionState = { status: "saving", lists: [], selected: {}, undoing: false };
let page: { tabId: number; url: string };
function intent(type: "save" | "toggle" | "undo", listId?: string) {
  void chrome.runtime
    .sendMessage({ type, ...page, listId })
    .then((result) => {
      if (!result?.ok) throw new Error(result?.error || "Request failed.");
    })
    .catch(fail);
}
let visible: List[] = [];
function signedOut() {
  status.textContent = "Sign in to save pages";
  signIn.hidden = false;
  filter.hidden = true;
  container.hidden = true;
  undo.hidden = true;
}
function fail(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : "Something went wrong. Try again.";
}
function render() {
  visible = lists.filter((list) => list.name.toLowerCase().includes(filter.value.toLowerCase()));
  container.replaceChildren(
    ...visible.map((list, index) => {
      const button = document.createElement("button");
      button.textContent = `${!filter.value && index < 9 ? `${index + 1} · ` : ""}${list.name}`;
      button.setAttribute("aria-pressed", String(Boolean(state.selected[list.id])));
      button.onclick = () => intent("toggle", list.id);
      return button;
    }),
  );
}
filter.oninput = render;
signIn.onclick = () => void chrome.runtime.openOptionsPage();
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
  if (undo.disabled || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const index =
    event.key === "Enter" && event.target === filter
      ? 0
      : !filter.value && /^[1-9]$/.test(event.key)
        ? Number(event.key) - 1
        : -1;
  if (index >= 0 && visible[index]) {
    event.preventDefault();
    intent("toggle", visible[index].id);
  }
});
async function start() {
  filter.focus();
  const [config, tabs] = await Promise.all([
    settings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const tab = tabs[0];
  document.querySelector<HTMLAnchorElement>("#open")!.href = config.server;
  if (!eligible(tab?.url)) {
    status.textContent = "This page can't be saved";
    filter.hidden = true;
    return;
  }
  document.querySelector<HTMLElement>("#page")!.textContent =
    `${tab.title || new URL(tab.url).hostname} · ${new URL(tab.url).hostname}`;
  if (!config.token) {
    signedOut();
    return;
  }
  if (tab.id === undefined) return;
  page = { tabId: tab.id, url: tab.url };
  const port = chrome.runtime.connect({ name: "popup" });
  port.onMessage.addListener((next: SessionState) => {
    if (next.unauthorized) {
      signedOut();
      return;
    }
    state = next;
    lists = state.lists;
    status.textContent = {
      saving: "Saving…",
      saved: state.result?.alreadyExists ? "Already saved" : "Saved",
      undone: "Removed",
      failed: "Couldn't save",
    }[state.status];
    error.textContent = state.error ?? "";
    undo.hidden = state.status !== "saved" || Boolean(state.result?.alreadyExists);
    undo.disabled = state.undoing;
    filter.disabled = state.undoing || state.status === "failed" || state.status === "undone";
    container.inert = filter.disabled;
    render();
    if (state.status === "undone") window.close();
  });
  port.postMessage({ type: "watch", ...page });
  intent("save");
  undo.onclick = () => intent("undo");
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.token && !changes.token.newValue) signedOut();
});
void start().catch(fail);
