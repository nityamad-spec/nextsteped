// Lightweight pub/sub for "course data was wiped" notifications. Any view that
// caches course-derived state (lesson plan JSON from storage, concepts list,
// diagnostic questions, etc.) can subscribe and re-fetch on demand.
//
// Uses a window CustomEvent for in-tab listeners and BroadcastChannel for
// cross-tab so a wipe in one tab clears stale UI in another.

export const WIPE_EVENT = "course-wiped";

export type WipeScope =
  | "lesson_plan"
  | "concepts"
  | "diagnostic"
  | "syllabus"
  | "mastery"
  | "insights"
  | "ta_settings"
  | "chat"
  | "all";

export type WipeEventDetail = {
  courseId: string;
  // Which buckets of derived data were wiped. Subscribers can ignore events
  // that don't affect them.
  scopes: WipeScope[];
};

let bc: BroadcastChannel | null = null;
function getBC(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!bc) bc = new BroadcastChannel("course-wipes");
  return bc;
}

export function emitWipe(detail: WipeEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WipeEventDetail>(WIPE_EVENT, { detail }));
  try { getBC()?.postMessage(detail); } catch { /* ignore */ }
}

export function subscribeWipe(
  handler: (detail: WipeEventDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const d = (e as CustomEvent<WipeEventDetail>).detail;
    if (d) handler(d);
  };
  window.addEventListener(WIPE_EVENT, onEvent);
  const channel = getBC();
  const onMsg = (e: MessageEvent<WipeEventDetail>) => handler(e.data);
  channel?.addEventListener("message", onMsg);
  return () => {
    window.removeEventListener(WIPE_EVENT, onEvent);
    channel?.removeEventListener("message", onMsg);
  };
}
