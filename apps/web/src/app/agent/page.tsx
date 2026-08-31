"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Send, Loader2, Wrench, Bot, User, Settings } from "lucide-react";
import { ChatSidebar, type ConversationSummary } from "@/components/agent/chat-sidebar";
import { SettingsPanel } from "@/components/agent/settings-panel";
import { ClerkTokenBridge } from "@/components/auth/clerk-token-bridge";
import { UsageBanner } from "@/components/agent/usage-banner";
import { ProposedActionCard } from "@/components/agent/proposed-action-card";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const isHostedMode = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";

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

const SUGGESTIONS = [
  "How are all the services looking right now?",
  "What happened in the last incident on orders-api?",
  "Search the web for the best way to fix a Postgres connection pool exhaustion issue",
  "Is payments-api healthy? If not, propose restarting it.",
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // undefined until the token bridge reports in. Self-hosted mode reports
  // undefined immediately (no auth needed); hosted mode reports Clerk's
  // real getToken function once available.
  const [getToken, setGetToken] = useState<(() => Promise<string | null>) | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (!getToken) return {};
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/chat/conversations`, { headers: await authHeaders() });
      setConversations(await res.json());
    } catch {
      // API not reachable — leave the sidebar empty rather than crash the page.
    }
  }, [authHeaders]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  function startNewChat() {
    setConversationId(null);
    setTurns([]);
  }

  async function selectConversation(id: string) {
    setConversationId(id);
    const res = await fetch(`${API_URL}/chat/conversations/${id}/messages`, { headers: await authHeaders() });
    const messages: StoredMessage[] = await res.json();

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

  async function send(text: string) {
    if (!text.trim() || sending) return;
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

      const res = await fetch(`${API_URL}/chat/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ message: text }),
      });
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
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: `Couldn't reach the API at ${API_URL} (${err instanceof Error ? err.message : "unknown error"}).` },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-screen bg-background flex">
      <ClerkTokenBridge onReady={setGetToken} />

      <ChatSidebar
        conversations={conversations}
        activeId={conversationId}
        onSelect={selectConversation}
        onNew={startNewChat}
        onDelete={deleteConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearEmpty={clearEmptyConversations}
      />

      <main className="flex-1 flex flex-col min-w-0">
        <div className="border-b">
          <div className="px-6 py-4 flex items-center justify-between">
            <div>
              <Link href="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1">
                <ArrowLeft className="h-3 w-3" /> Home
              </Link>
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4" /> Act SWE Agent
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <UsageBanner apiUrl={API_URL} getToken={getToken} />
              <button onClick={() => setSettingsOpen(true)} className="text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
              </button>
              <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground">
                Incidents & activity →
              </Link>
              {isHostedMode && <UserButton afterSignOutUrl="/" />}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
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
                  {turn.toolTrace && turn.toolTrace.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {turn.toolTrace.map((t, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 text-[11px] font-mono bg-muted px-2 py-1 rounded text-muted-foreground"
                        >
                          <Wrench className="h-3 w-3" /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking / calling tools...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t">
          <div className="max-w-3xl mx-auto px-6 py-4 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask the agent anything..."
              className="flex-1 text-sm rounded-md border bg-background px-3 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button onClick={() => send(input)} disabled={sending || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </main>

      <SettingsPanel apiUrl={API_URL} open={settingsOpen} onOpenChange={setSettingsOpen} getToken={getToken} />
    </div>
  );
}
