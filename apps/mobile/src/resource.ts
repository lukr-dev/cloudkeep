// Refreshes after mutations must outlive any request that started before the mutation.
export function resource(task: () => Promise<void>) {
  let loaded = false;
  let pending: Promise<void> | undefined;
  let queued: Promise<void> | undefined;
  let generation = 0;
  let revision = 0;
  let pendingRevision = 0;

  function load(): Promise<void> {
    const current = generation;
    const started = revision;
    pendingRevision = started;
    const request = task()
      .then(() => {
        if (current === generation) loaded = started === revision;
      })
      .catch((cause) => {
        if (current === generation) loaded = false;
        throw cause;
      })
      .finally(() => {
        if (pending === request) pending = undefined;
      });
    pending = request;
    return request;
  }
  function refresh(): Promise<void> {
    if (queued) return queued;
    if (!pending) return load();
    const current = generation;
    return (queued = pending
      .catch(() => {})
      .then(() => {
        if (current !== generation) return;
        queued = undefined;
        return load();
      }));
  }
  function ensure(): Promise<void> {
    if (queued) return queued;
    if (pending) return pendingRevision === revision ? pending : refresh();
    return loaded ? Promise.resolve() : load();
  }
  function invalidate() {
    ++revision;
    loaded = false;
  }
  function clear() {
    ++generation;
    invalidate();
    pending = undefined;
    queued = undefined;
  }
  return { ensure, refresh, invalidate, clear };
}
