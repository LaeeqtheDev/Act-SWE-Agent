"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, Bot, User, Settings, Workflow, LayoutDashboard, Square } from "lucide-react";
import { ChatSidebar, type ConversationSummary } from "@/components/agent/chat-sidebar";
import { SettingsPanel } from "@/components/agent/settings-panel";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { UsageBanner } from "@/components/agent/usage-banner";
import { AppNav } from "@/components/app-nav";
import { ToolTrace } from "@/components/agent/tool-trace";
import { NotificationBell } from "@/components/agent/notification-bell";
import { ProposedActionCard } from "@/components/agent/proposed-action-card";
import { isHostedMode } from "@/lib/hosted-mode";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface ToolTraceEntry {
  name: string;
  input: unknown;
  output: unknown;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  toolTrace?: ToolTraceEntry[];
  provider?: string;
}

interface StoredMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string | null;
}

// Real capabilities that work regardless of whether the seeded demo
// services exist. The old list referenced payments-api / orders-api, which
// are removed the moment someone runs `pnpm clear-demo` — leaving
// suggestions that fail on click.
const SUGGESTIONS = [
  "Compare the top 3 project management tools on pricing and write me a summary",
  "Find remote jobs posted this week that match my profile",
  "Research what my competitors are charging and put it in a document",
  "Check the news on a topic and give me the 5 things that matter",
];

// A proposeAction tool result looks like { proposed, actionId, status } —
// but when reloaded from history it comes back as a JSON string (stored
// that way in the DB), while a fresh live response has it as a real object
// already. This normalizes both so the approval card renders either way.
function extractPendingAction(entry: ToolTraceEntry): { actionId: string } | null {
  if (entry.name !== "proposeAction") return null;
  let output: unknown = entry.output;
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch {
      return null;
    }
  }
  if (output && typeof output === "object" && "actionId" in output) {
    return { actionId: String((output as { actionId: unknown }).actionId) };
  }
  return null;
}

export default function AgentChatPage() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // null = no conversation created yet. One is only created in the backend
  // the moment the user actually sends their first message.
  const [conversationId, setConversationId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.sessionStorage.getItem("act_active_conversation");
  });
  const [turns, setTurns] = useState<ChatTurn[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversationId) window.sessionStorage.setItem("act_active_conversation", conversationId);
    else window.sessionStorage.removeItem("act_active_conversation");
  }, [conversationId]);

  // Restoring the id alone did nothing — selectConversation is the only
  // path that actually fetches a conversation's messages, and it was only
  // ever called from a sidebar click. Without this, a refresh landed on
  // the right id but a blank message list, which looked identical to a
  // fresh chat.
  const restoredOnMount = useRef(false);
  useEffect(() => {
    if (restoredOnMount.current) return;
    restoredOnMount.current = true;
    if (conversationId) selectConversation(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [activityDetail, setActivityDetail] = useState<string | null>(null);
  const [chromeConnected, setChromeConnected] = useState<boolean | null>(null);
  // undefined until the token bridge reports in. Self-hosted mode reports
  // undefined immediately (no auth needed); hosted mode reports Clerk's
  // real getToken function once available.
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (typeof getToken !== "function") return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const loadConversations = useCallback(async () => {
    if (isHostedMode() && typeof getToken !== "function") return;
    try {
      const res = await fetch(`${API_URL}/chat/conversations`, { headers: await authHeaders() });
      const data = await res.json();
      // The endpoint returns an array on success but an object ({error: ...})
      // on 401/500 — setting that object as state directly is what crashed
      // the sidebar with "conversations.map is not a function".
      setConversations(Array.isArray(data) ? data : []);
    } catch {
      // API not reachable — leave the sidebar empty rather than crash the page.
      setConversations([]);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Show which model is actually answering, right in the composer — it was
  // previously only visible by opening the settings dialog.
  // The highest-value capability — reading your actual email and LinkedIn —
  // is invisible unless CHROME_USER_DATA_DIR is set, and a task that needs
  // it just fails with no explanation. Tell people it exists.
  useEffect(() => {
    fetch(`${API_URL}/config`)
      .then((r) => r.json())
      .then((d) => setChromeConnected(!!d.chromeProfileConnected))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Two real bugs here, together explaining "it resets to the default":
    // 1. No auth headers were sent, so in hosted mode this always resolved
    //    as an anonymous request — the server's env default, never the
    //    signed-in user's saved model.
    // 2. This effect re-fired on every settingsOpen toggle (i.e. on close),
    //    which raced the onSaved callback and overwrote the correct label
    //    with whatever this under-authed fetch returned. Now only runs
    //    once on mount; onSaved is the sole source of truth after that.
    if (isHostedMode() && typeof getToken !== "function") return;
    authHeaders().then((headers) =>
      fetch(`${API_URL}/ai/status`, { headers })
        .then((r) => r.json())
        .then((d) => setProviderLabel(d.configured ? `${d.provider}/${d.model}` : null))
        .catch(() => {})
    );
  }, [authHeaders]);

  useEffect(() => {
    if (turns.length === 0) return; // same fix as the landing demo widget — don't scroll on initial mount
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  // A static "thinking..." for 40 seconds reads as broken. Polling progress
  // shows what it's actually doing right now, which is the difference
  // between waiting and wondering whether to cancel.
  useEffect(() => {
    if (!sending || !conversationId) {
      setActivity(null);
      return;
    }
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/chat/conversations/${conversationId}/progress`);
        const data = await res.json();
        setActivity(data.activity ? `${data.activity}${data.step > 1 ? ` · step ${data.step}` : ""}` : null);
        setActivityDetail(typeof data.detail === "string" ? data.detail : null);
      } catch {
        // progress is cosmetic — never let it surface an error
      }
    }, 1200);
    return () => clearInterval(poll);
  }, [sending, conversationId]);

  function startNewChat() {
    setConversationId(null);
    setTurns([]);
  }

  async function selectConversation(id: string) {
    setConversationId(id);
    const res = await fetch(`${API_URL}/chat/conversations/${id}/messages`, { headers: await authHeaders() });
    const data = await res.json();
    // Same failure shape as every other list endpoint here: an error path
    // returns {error} instead of an array, and that was being iterated
    // directly. Guard it here too, including the restore-on-refresh path
    // that now calls this on mount with no user click to catch a bad id.
    const messages: StoredMessage[] = Array.isArray(data) ? data : [];

    const rebuilt: ChatTurn[] = [];
    let pendingTrace: ToolTraceEntry[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        rebuilt.push({ role: "user", content: m.content });
        pendingTrace = [];
      } else if (m.role === "tool") {
        pendingTrace.push({ name: m.toolName ?? "tool", input: {}, output: m.content });
      } else if (m.role === "assistant" && m.content) {
        rebuilt.push({ role: "assistant", content: m.content, toolTrace: pendingTrace });
        pendingTrace = [];
      }
    }
    setTurns(rebuilt);
  }

  async function deleteConversation(id: string) {
    await fetch(`${API_URL}/chat/conversations/${id}`, { method: "DELETE", headers: await authHeaders() });
    await loadConversations();
    if (id === conversationId) startNewChat();
  }

  async function clearEmptyConversations() {
    await fetch(`${API_URL}/chat/conversations`, { method: "DELETE", headers: await authHeaders() });
    await loadConversations();
  }

  function cancel() {
    // Track cancellation in a ref rather than inferring it from whatever
    // the rejection turns out to be. Passing a reason object made Next's
    // overlay print "[object Object]"; passing none made it print "aborted
    // without reason". Neither is a real error — this is a user action.
    // which looks like a crash when it's a deliberate user action.
    // Deliberately a plain object, NOT a DOMException/Error. Next's dev
    // overlay surfaces any Error-shaped abort reason as an unhandled
    // runtime error ("AbortError: Cancelled by user") even though this is a
    // completely normal user action that we handle below.
    cancelledRef.current = true;

    // Attach a no-op catch to the in-flight request BEFORE aborting. The
    // try/catch in send() covers the awaited chain, but Next's dev overlay
    // hooks unhandledrejection and still reports the AbortError at the
    // abort() call site. Giving the promise its own handler is what
    // actually stops that — this is a deliberate user action, not an error.
    inFlightRef.current?.catch(() => {});
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setTurns((prev) => [...prev, { role: "assistant", content: "Stopped." }]);
  }

  async function send(text: string) {
    if (!text.trim() || sending) return;
    const controller = new AbortController();
    abortRef.current = controller;
    cancelledRef.current = false;
    setTurns((prev) => [...prev, { role: "user", content: text }]);
    setInput("");
    setSending(true);
    try {
      const headers = await authHeaders();

      let activeId = conversationId;
      if (!activeId) {
        const createRes = await fetch(`${API_URL}/chat/conversations`, { method: "POST", headers });
        const conv = await createRes.json();
        activeId = conv.id;
        setConversationId(activeId);
      }

      const request = fetch(`${API_URL}/chat/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      inFlightRef.current = request;
      const res = await request;
      const data = await res.json();
      const replyText =
        typeof data.reply === "string" && data.reply.trim().length > 0
          ? data.reply
          : data.error
          ? `Error: ${data.error}`
          : "The agent didn't return a response — check the API server's console for details.";
      setTurns((prev) => [...prev, { role: "assistant", content: replyText, toolTrace: data.toolTrace, provider: data.provider }]);
      loadConversations();
    } catch (err) {
      // A cancel is a deliberate user action, not an error to report.
      // DOMException doesn't extend Error in every runtime, so check the
      // name directly rather than relying on instanceof.
      // fetch() throws its own native DOMException on abort, separate from
      // the reason we passed — match either.
      // The flag is authoritative — an aborted fetch can reject in several
      // different shapes depending on where in the chain it was interrupted.
      if (cancelledRef.current || (err as { name?: string })?.name === "AbortError") return;
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: `Couldn't reach the API at ${API_URL} (${err instanceof Error ? err.message : "unknown error"}).` },
      ]);
    } finally {
      inFlightRef.current = null;
      abortRef.current = null;
      setSending(false);
    }
  }

  return (
    <div className="h-screen bg-background flex">
      <ClerkTokenBridge onReady={(fn) => setGetToken(() => fn)} />

      <ChatSidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNew={startNewChat}
        onDelete={deleteConversation}
        onClearEmpty={clearEmptyConversations}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <AppNav
          getToken={getToken}
          right={
            <>
              <UsageBanner apiUrl={API_URL} getToken={getToken} />
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Model & API key"
              >
                <Settings className="h-4 w-4" />
              </button>
            </>
          }
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
            {turns.length === 0 && chromeConnected === false && (
              <div className="mb-6 p-4 rounded-lg border border-warn/25 bg-warn/[0.04]">
                <p className="text-sm text-foreground font-medium mb-1">
                  Connect your browser to unlock email, LinkedIn, and Slack
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Right now it can browse public sites. Point it at your own Chrome profile and it can
                  read your actual inbox, draft replies, and act on any site you&apos;re already signed
                  into — no passwords, it just uses the session you already have.{" "}
                  <a href="/docs#your-chrome" className="text-warn hover:underline">
                    How to set it up
                  </a>
                </p>
              </div>
            )}

            {turns.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Try asking:</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-left text-sm p-3 rounded-lg border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn, i) => (
              <div key={i} className="flex gap-3">
                <div className="h-7 w-7 rounded-full border flex items-center justify-center shrink-0 mt-0.5">
                  {turn.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  {turn.toolTrace && turn.toolTrace.length > 0 && <ToolTrace entries={turn.toolTrace} />}
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{turn.content}</p>
                  {turn.toolTrace?.map((t, j) => {
                    const pending = extractPendingAction(t);
                    if (!pending) return null;
                    return (
                      <ProposedActionCard
                        key={j}
                        action={pending}
                        apiUrl={API_URL}
                        authHeaders={authHeaders}
                        onDecided={(decision) =>
                          send(decision === "approved" ? "I approved that — please continue." : "I rejected that — let's try something else.")
                        }
                      />
                    );
                  })}
                  {turn.provider && <p className="text-[10px] font-mono text-muted-foreground mt-1">{turn.provider}</p>}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex gap-3">
                <div className="h-7 w-7 rounded-full border flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    {activity ?? "Thinking"}
                  </div>
                  {activityDetail && (
                    <p className="text-xs text-muted-foreground/60 mt-1 pl-5.5 truncate max-w-xl">
                      {activityDetail}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div>
          <div className="max-w-3xl mx-auto px-6 py-4">
            <div className="rounded-2xl border border-border bg-card focus-within:border-foreground/30 transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter adds a newline — standard for a
                  // chat box, and previously impossible since this was an input.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask the agent anything..."
                className="w-full bg-transparent text-sm px-4 pt-3.5 pb-2 resize-none focus:outline-none placeholder:text-muted-foreground/60 max-h-40"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const el = e.currentTarget;
                  el.style.height = "auto";
                  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
                }}
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <span
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-[10px] uppercase tracking-wide text-muted-foreground/60 px-2 py-1 rounded-md border border-border"
                  >
                    {providerLabel ?? "not configured"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="hidden sm:block text-[10px] text-muted-foreground/50">
                    Enter to send · Shift+Enter for a new line
                  </span>
                  {sending ? (
                    <button
                      onClick={cancel}
                      title="Stop"
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-foreground hover:bg-muted/70 transition-colors"
                    >
                      <Square className="h-3 w-3 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim()}
                      className="h-8 w-8 flex items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30 transition-opacity"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>

      <SettingsPanel apiUrl={API_URL} open={settingsOpen} onOpenChange={setSettingsOpen} getToken={getToken} onSaved={setProviderLabel} />
    </div>
  );
}
