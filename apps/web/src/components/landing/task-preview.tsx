"use client";

import { useEffect, useState } from "react";
import { Check, MousePointer2 } from "lucide-react";

// Replaces the terminal mockup that used to sit in the hero. A curl command
// is developer signalling in the one place a non-technical visitor decides
// whether this is for them. This shows the same idea — a task running — in
// the form they'd actually see it.
const STEPS = [
  { label: "Opened stripe.com/jobs", detail: "Reading 14 open roles" },
  { label: "Filtered to backend, remote", detail: "3 matches" },
  { label: "Opened the best match", detail: "Senior Backend Engineer" },
  { label: "Filled the application", detail: "Using your saved details" },
];

export function TaskPreview() {
  const [visible, setVisible] = useState(0);
  const [awaiting, setAwaiting] = useState(false);

  useEffect(() => {
    // Loops so someone arriving mid-animation still sees the whole arc.
    const timers: ReturnType<typeof setTimeout>[] = [];
    const run = () => {
      setVisible(0);
      setAwaiting(false);
      STEPS.forEach((_, i) => {
        timers.push(setTimeout(() => setVisible(i + 1), 900 * (i + 1)));
      });
      timers.push(setTimeout(() => setAwaiting(true), 900 * (STEPS.length + 1)));
      timers.push(setTimeout(run, 900 * (STEPS.length + 1) + 4200));
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden shadow-2xl shadow-black/20">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
        <span className="ml-2 text-xs text-muted-foreground truncate">
          &ldquo;Apply to the best backend role at Stripe&rdquo;
        </span>
      </div>

      <div className="p-4 space-y-2.5 min-h-[232px]">
        {STEPS.map((s, i) => (
          <div
            key={s.label}
            className={`flex items-start gap-2.5 transition-all duration-500 ${
              i < visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            }`}
          >
            <Check className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm text-foreground leading-snug">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.detail}</p>
            </div>
          </div>
        ))}

        {/* The approval gate is the product's whole differentiator, so the
            preview ends on it rather than on "done". */}
        <div
          className={`transition-all duration-500 ${awaiting ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
        >
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn/[0.06] p-3">
            <div className="flex items-center gap-2 mb-2">
              <MousePointer2 className="h-3.5 w-3.5 text-warn" />
              <p className="text-sm text-foreground font-medium">Ready to submit — your call</p>
            </div>
            <div className="flex gap-2">
              <span className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">
                Submit application
              </span>
              <span className="text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground">
                Review first
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
