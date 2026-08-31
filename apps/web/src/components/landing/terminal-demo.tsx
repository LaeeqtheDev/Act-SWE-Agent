"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// A small terminal mock that types out the actual curl command from the
// README, then reveals the actual response shape the API returns, then the
// worker's detection line. This is real content pulled straight from how
// the project actually works — not a decorative fake console.
const LINES: { text: string; tone: "prompt" | "dim" | "amber" | "bright" }[] = [
  { text: "$ curl -X POST localhost:4000/simulate/database-overload \\", tone: "prompt" },
  { text: "    -d '{\"serviceName\": \"payments-api\"}'", tone: "prompt" },
  { text: "{ \"queued\": 4, \"serviceId\": \"a322540f...\" }", tone: "dim" },
  { text: "[worker] processed event: db_connections", tone: "dim" },
  { text: "[worker] processed event: error_rate", tone: "dim" },
  { text: "[worker] incident created: high severity", tone: "amber" },
  { text: "✓ AI agent investigating...", tone: "bright" },
];

const toneColor: Record<string, string> = {
  prompt: "var(--foreground)",
  dim: "var(--muted-foreground)",
  amber: "var(--warn)",
  bright: "var(--foreground)",
};

export function TerminalDemo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const lineEls = Array.from(container.querySelectorAll<HTMLDivElement>("[data-line]"));
    gsap.set(lineEls, { opacity: 0, y: 6 });

    const tl = gsap.timeline({ delay: 0.6 });
    lineEls.forEach((el, i) => {
      tl.to(el, { opacity: 1, y: 0, duration: 0.35, ease: "power1.out" }, i * 0.35);
    });

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span style={{ fontFamily: "var(--font-mono)" }} className="ml-2 text-[11px] text-muted-foreground">
          act-swe-agent — zsh
        </span>
      </div>
      <div ref={containerRef} style={{ fontFamily: "var(--font-mono)" }} className="px-4 py-5 text-[12.5px] leading-[1.9] overflow-x-auto">
        {LINES.map((line, i) => (
          <div key={i} data-line style={{ color: toneColor[line.tone] }} className="whitespace-pre">
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
