// In-process fan-out for conversion progress. The client opens an SSE stream
// keyed by a request id it generated, then POSTs the conversion with the same id
// in a header. Progress events are advisory: a dropped stream never affects the
// conversion itself.

type Listener = (percent: number) => void;

const listeners = new Map<string, Set<Listener>>();

// Bound the number of live channels so an unauthenticated caller cannot grow
// this map without limit. Stale ids are removed when their SSE stream closes;
// the cap only rejects new ids while the map is full.
// ponytail: per-process cap; move to a shared store if the app is ever replicated.
const MAX_CHANNELS = 500;

export function subscribeProgress(id: string, listener: Listener): () => void {
  let set = listeners.get(id);
  if (!set) {
    if (listeners.size >= MAX_CHANNELS) return () => {};
    set = new Set();
    listeners.set(id, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(id);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(id);
  };
}

export function publishProgress(id: string, percent: number): void {
  listeners.get(id)?.forEach((listener) => listener(percent));
}

/** Number of ids with at least one subscriber (used by tests/metrics). */
export function activeProgressChannels(): number {
  return listeners.size;
}
