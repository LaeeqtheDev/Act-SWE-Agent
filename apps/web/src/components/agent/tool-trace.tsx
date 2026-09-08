"use client";

import { useState } from "react";
import { ChevronRight, Check, X } from "lucide-react";

interface TraceEntry {
  name: string;
  input: unknown;
  output: unknown;
}

// Human-readable names, matching the live progress labels.
const LABELS: Record<string, string> = {
  webSearch: "Searched the web",
  browseWeb: "Opened a page",
  clickToNavigate: "Clicked through",
  typeInto: "Typed",
  pressKey: "Pressed a key",
  scrollPage: "Scrolled",
  goBack: "Went back",
  readPageAsMarkdown: "Read the page",
  waitForElement: "Waited for the page",
  getUserProfile: "Checked your details",
  proposeAction: "Prepared an action",
  createDocument: "Wrote a document",
};

function summarise(entry: TraceEntry): string {
  const input = entry.input as Record<string, unknown> | undefined;
  if (!input) return "";
  // Show the most useful field per tool, not a JSON blob.
  const key = input.query ?? input.url ?? input.text ?? input.selector ?? input.direction ?? input.key;
  return typeof key === "string" ? key.slice(0, 70) : "";
}

// Turns a raw tool result into a sentence. The expanded view was dumping
// Playwright stack traces and JSON blobs at people who just want to know
// what happened — the raw payload is still available below for debugging,
// but the headline should be readable.
function explain(entry: TraceEntry): string | null {
  const out = entry.output as Record<string, unknown> | undefined;
  if (!out || typeof out !== "object") return null;

  const rawError = typeof out.error === "string" ? out.error : null;
  if (rawError) {
    if (/Timeout .*exceeded|waiting for locator/i.test(rawError)) {
      return "Couldn't find that element on the page — it may not have loaded, or the page changed.";
    }
    if (/not connected/i.test(rawError)) return rawError;
    if (/Cancelled by user/i.test(rawError)) return "Stopped before this ran.";
    if (/rate limit/i.test(rawError)) return "Hit the AI provider's rate limit.";
    if (/\[BLOCKED\]/i.test(rawError)) return "The site blocked automated access (CAPTCHA).";
    // Fall back to the first sentence rather than the whole stack trace.
    return rawError.split(/[.\n]/)[0].slice(0, 160);
  }

  if (out.success === false) return "That step didn't work.";
  if (typeof out.title === "string") return `Read: ${out.title}`;
  if (Array.isArray(out.results)) return `Found ${out.results.length} result${out.results.length === 1 ? "" : "s"}.`;
  if (out.found === true) return "Confirmed it's on the page.";
  if (out.found === false) return "Not found on the page.";
  if (out.success === true) return "Done.";
  return null;
}

function failed(entry: TraceEntry): boolean {
  const out = entry.output;
  if (out && typeof out === "object") {
    if ("error" in out) return true;
    if ("success" in out && (out as { success: boolean }).success === false) return true;
  }
  return false;
}

// Collapsed by default so a 12-step task doesn't bury the answer, but every
// step can be opened to see exactly what went in and came back. Previously
// this was a row of bare tool names with no way to tell what happened or
// why something failed.
export function ToolTrace({ entries }: { entries: TraceEntry[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (entries.length === 0) return null;

  const visible = showAll ? entries : entries.slice(0, 4);
  const hidden = entries.length - visible.length;

  return (
    <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
      {visible.map((entry, i) => {
        const isOpen = expanded === i;
        const error = failed(entry);
        const detail = summarise(entry);

        return (
          <div key={i} className="border-b border-border/40 last:border-0">
            <button
              onClick={() => setExpanded(isOpen ? null : i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <ChevronRight
                className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
              />
              {error ? (
                <X className="h-3 w-3 shrink-0 text-destructive" />
              ) : (
                <Check className="h-3 w-3 shrink-0 text-warn" />
              )}
              <span className="text-xs text-foreground shrink-0">{LABELS[entry.name] ?? entry.name}</span>
              {(error ? explain(entry) : detail) && (
                <span className="text-xs text-muted-foreground/70 truncate">
                  {error ? explain(entry) : detail}
                </span>
              )}
            </button>

            {isOpen && (
              <div className="px-3 pb-3 pt-1 space-y-2">
                {explain(entry) && (
                  <p className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}>
                    {explain(entry)}
                  </p>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1">Technical details — what was sent</p>
                  <pre className="text-[11px] font-mono bg-background/60 rounded p-2 overflow-x-auto text-muted-foreground max-h-32">
                    {JSON.stringify(entry.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground/60 mb-1">Technical details — what came back</p>
                  <pre className="text-[11px] font-mono bg-background/60 rounded p-2 overflow-x-auto text-muted-foreground max-h-48">
                    {typeof entry.output === "string"
                      ? entry.output.slice(0, 1500)
                      : JSON.stringify(entry.output, null, 2)?.slice(0, 1500)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {hidden > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full px-3 py-2 text-left text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          Show {hidden} more step{hidden === 1 ? "" : "s"}
        </button>
      )}
    </div>
  );
}
