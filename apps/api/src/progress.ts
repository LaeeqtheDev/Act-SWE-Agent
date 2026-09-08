// Live progress for an in-flight task. Without this the user stares at
// "thinking..." for 40 seconds with no idea whether it's working, stuck, or
// broken — and assumes broken. Full SSE streaming would be better, but this
// gets the same information across for a fraction of the complexity and
// with no change to how the chat request works.
//
// In memory on purpose: it's transient by definition, and a lost progress
// update is harmless. It does mean progress won't show across multiple
// server instances — worth moving to Redis if you scale horizontally.

interface Progress {
  step: number;
  activity: string;
  detail?: string;
  updatedAt: number;
}

const progress = new Map<string, Progress>();
const MAX_AGE_MS = 10 * 60 * 1000;

// Human-readable descriptions. "calling browseWeb" means nothing to someone
// who didn't build this; "Reading the page" does.
const ACTIVITY: Record<string, string> = {
  webSearch: "Searching the web",
  browseWeb: "Opening a page",
  clickToNavigate: "Clicking through",
  typeInto: "Typing",
  pressKey: "Pressing a key",
  scrollPage: "Scrolling for more",
  goBack: "Going back",
  readPageAsMarkdown: "Reading the page",
  waitForElement: "Waiting for the page",
  getUserProfile: "Checking your saved details",
  proposeAction: "Preparing something for your approval",
  createDocument: "Writing it up",
};

export function describeTool(name: string): string {
  return ACTIVITY[name] ?? `Running ${name}`;
}

export function setProgress(conversationId: string, step: number, activity: string, detail?: string): void {
  progress.set(conversationId, { step, activity, detail, updatedAt: Date.now() });
}

export function getProgress(conversationId: string): Progress | null {
  const p = progress.get(conversationId);
  if (!p) return null;
  if (Date.now() - p.updatedAt > MAX_AGE_MS) {
    progress.delete(conversationId);
    return null;
  }
  return p;
}

export function clearProgress(conversationId: string): void {
  progress.delete(conversationId);
}
