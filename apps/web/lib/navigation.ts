// Void pushes history entries after rendering, so mark them at the browser history boundary.
export function trackNavigation() {
  const push = window.history.pushState.bind(window.history);
  const tracked: History["pushState"] = (state, unused, url) => {
    push({ ...state, cloudkeepBack: true }, unused, url);
  };
  window.history.pushState = tracked;
  return () => {
    window.history.pushState = push;
  };
}
export function canGoBack(): boolean {
  if (window.history.length < 2) return false;
  if (window.history.state?.cloudkeepBack === true) return true;
  try {
    return new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
