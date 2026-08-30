"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// A small terminal mock that types out the actual curl command from the
// README, then reveals the actual response shape the API returns, then the
// worker's detection line. This is real content pulled straight from how
// the project actually works — not a decorative fake console.
const LINES: { text: string; tone: "prompt" | "dim" | "amber" | "cyan" }[] = [
  { text: "$ curl -X POST localhost:4000/simulate/database-overload \\", tone: "prompt" },
  { text: "    -d '{\"serviceName\": \"payments-api\"}'", tone: "prompt" },
  { text: "{ \"queued\": 4, \"serviceId\": \"a322540f...\" }", tone: "dim" },
  { text: "[worker] processed event: db_connections", tone: "dim" },
  { text: "[worker] processed event: error_rate", tone: "dim" },
  { text: "[worker] incident created: high severity", tone: "amber" },
  { text: "✓ AI agent investigating...", tone: "cyan" },
];

const toneColor: Record<string, string> = {
  prompt: "#E8ECEF",
  dim: "#7C8A99",
  amber: "#F5A623",
  cyan: "#35C7C0",
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
    <div className="rounded-lg border border-[#1E2630] bg-[#0E1420] overflow-hidden shadow-2xl shadow-black/40">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-[#1E2630]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#2A3644]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#2A3644]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#2A3644]" />
        <span style={{ fontFamily: "var(--font-mono)" }} className="ml-2 text-[11px] text-[#7C8A99]">
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
