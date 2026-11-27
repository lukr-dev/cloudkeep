import "./style.css";
import { eligible, type List, type SessionState } from "./logic.ts";
import { settings } from "./storage.ts";
const status = document.querySelector<HTMLElement>("#status")!;
const error = document.querySelector<HTMLElement>("#error")!;
const filter = document.querySelector<HTMLInputElement>("#filter")!;
const container = document.querySelector<HTMLElement>("#lists")!;
const section = document.querySelector<HTMLElement>("#list-section")!;
const save = document.querySelector<HTMLButtonElement>("#save")!;
const undo = document.querySelector<HTMLButtonElement>("#undo")!;
let lists: List[] = [];
let state: SessionState = { status: "saving", lists: [], selected: {}, undoing: false };
let page: { tabId: number; url: string };
let unauthorized = false;
let connected = false;
function intent(type: "submit" | "toggle" | "undo", listId?: string) {
  void chrome.runtime
    .sendMessage({ type, ...page, listId })
    .then((result) => {
      if (!result?.ok) throw new Error(result?.error || "Request failed.");
    })
    .catch(fail);
}
let visible: List[] = [];
function signedOut() {
  unauthorized = true;
  status.textContent = "Sign in to save pages";
  status.dataset.state = "";
  section.hidden = true;
  undo.hidden = true;
  save.textContent = "Sign in";
  save.disabled = false;
}
function fail(reason: unknown) {
  error.textContent = reason instanceof Error ? reason.message : "Something went wrong. Try again.";
}
function render() {
  filter.hidden = lists.length <= 8;
  if (filter.hidden) filter.value = "";
  visible = lists.filter((list) => list.name.toLowerCase().includes(filter.value.toLowerCase()));
  container.replaceChildren(
    ...visible.map((list, index) => {
      const button = document.createElement("button");
      button.className = "chip";
      button.textContent = `${state.selected[list.id] ? "✓ " : ""}${!filter.value && index < 9 ? `${index + 1} · ` : ""}${list.name}`;
      button.setAttribute("aria-pressed", String(Boolean(state.selected[list.id])));
      button.onclick = () => intent("toggle", list.id);
      return button;
    }),
  );
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = lists.length ? "No matching lists" : "No lists yet";
    container.append(empty);
  }
}
filter.oninput = render;
save.onclick = () => {
  if (unauthorized) void chrome.runtime.openOptionsPage();
  else if (state.status === "failed") {
    if (connected) intent("submit");
    else void start().catch(startFailed);
  } else window.close();
};
undo.onclick = () => intent("undo");
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.close();
  if (
    section.hidden ||
    container.inert ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.isComposing
  )
    return;
  const index =
    event.key === "Enter" && event.target === filter
      ? 0
      : !filter.value && /^[1-9]$/.test(event.key)
        ? Number(event.key) - 1
        : -1;
  if (index >= 0 && visible[index]) {
    event.preventDefault();
    intent("toggle", visible[index].id);
  } else if (!filter.hidden && event.target !== filter && event.key.length === 1) {
    event.preventDefault();
    filter.focus();
    filter.value += event.key;
    render();
  }
});
async function start() {
  const [config, tabs] = await Promise.all([
    settings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  const tab = tabs[0];
  document.querySelector<HTMLAnchorElement>("#open")!.href = config.server;
  if (!eligible(tab?.url)) {
    status.textContent = "This page can't be saved";
    section.hidden = true;
    return;
  }
  document.querySelector<HTMLElement>("#page")!.textContent =
    tab.title || new URL(tab.url).hostname;
  document.querySelector<HTMLElement>("#domain")!.textContent = new URL(tab.url).hostname;
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
      saving: "◌ Saving…",
      saved: state.result?.alreadyExists
        ? "✓ Already saved · moved to top"
        : "✓ Saved to CloudKeep",
      undone: "Removed",
      failed: "! Couldn't save",
    }[state.status];
    status.dataset.state = state.status;
    error.textContent = state.error ?? "";
    save.textContent = state.status === "failed" ? "Retry" : "Done";
    undo.hidden = state.status !== "saved" || Boolean(state.result?.alreadyExists);
    undo.disabled = state.undoing;
    filter.disabled = state.undoing || state.status === "failed" || state.status === "undone";
    container.inert = filter.disabled;
    render();
    if (state.status === "undone") window.close();
  });
  port.postMessage({ type: "watch", ...page });
  connected = true;
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.token && !changes.token.newValue) signedOut();
});
function startFailed(reason: unknown) {
  state.status = "failed";
  status.textContent = "! Couldn't save";
  status.dataset.state = "failed";
  save.textContent = "Retry";
  fail(reason);
}
void start().catch(startFailed);
