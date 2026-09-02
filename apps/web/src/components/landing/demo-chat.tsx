"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Wrench, Bot, User } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const MAX_DEMO_MESSAGES = 6;

interface Turn {
  role: "user" | "assistant";
  content: string;
  toolTrace?: string[];
}

const SUGGESTIONS = ["How are the services looking?", "Any open incidents?", "Is payments-api healthy?"];

// The landing page's actual try-it-now widget — no signup, talks to a small
// read-only demo backend with its own strict rate limit. This is the single
// highest-leverage thing on the page: people try things, they don't read
// feature lists.
export function DemoChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only scroll once there's actually a conversation — without this guard,
    // this fires on the very first mount too (turns is still [] but that's
    // still a "change" React sees), yanking the whole page's scroll position
    // down to this widget the instant the landing page loads.
    if (turns.length === 0) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  async function send(text: string) {
    if (!text.trim() || sending || limitReached) return;
    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/demo/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: nextTurns.map((t) => ({ role: t.role, content: t.content })) }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setLimitReached(true);
        setTurns((prev) => [...prev, { role: "assistant", content: data.error }]);
        return;
      }
      setTurns((prev) => [...prev, { role: "assistant", content: data.reply, toolTrace: data.toolTrace }]);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.remaining === 0) setLimitReached(true);
    } catch {
      setTurns((prev) => [...prev, { role: "assistant", content: "Couldn't reach the demo backend right now." }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col h-[560px] text-base">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-muted-foreground">
          Try it — no signup
        </span>
        {remaining !== null && (
          <span className="text-[11px] text-muted-foreground/70">{remaining} left this hour</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {turns.length === 0 && (
          <div className="space-y-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left text-sm px-4 py-3 rounded-md border border-border hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className="flex gap-2.5">
            <div className="h-6 w-6 rounded-full border border-border flex items-center justify-center shrink-0 mt-0.5">
              {t.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            </div>
            <div className="flex-1 min-w-0">
              {t.toolTrace && t.toolTrace.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {t.toolTrace.map((name, j) => (
                    <span key={j} className="inline-flex items-center gap-1 text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      <Wrench className="h-2.5 w-2.5" /> {name}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[15px] text-foreground whitespace-pre-wrap leading-relaxed">{t.content}</p>
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-8">
            <Loader2 className="h-3 w-3 animate-spin" /> thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border p-3">
        {limitReached ? (
          <a
            href="/agent"
            className="block text-center text-sm px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
          >
            Sign up to keep going
          </a>
        ) : (
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send(input)}
              placeholder="Ask about the demo services..."
              className="flex-1 text-sm rounded-md border border-border bg-background px-4 py-2.5 focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <button
              onClick={() => send(input)}
              disabled={sending || !input.trim()}
              className="px-3 rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
