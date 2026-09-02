"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { X, Check } from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

// The clearest way to communicate what makes this different: put the old
// way and the new way next to each other. Rows stagger in on scroll so the
// contrast lands one line at a time rather than as a wall of text.
const ROWS = [
  { before: "Ask a chatbot how to apply for a job", after: "It opens the listing and fills the application" },
  { before: "Copy-paste your details into every form", after: "Saved once, filled automatically" },
  { before: "Give an API your passwords and OAuth scopes", after: "Uses the browser you're already signed into" },
  { before: "Hope the automation didn't do something dumb", after: "Nothing sends without your approval" },
  { before: "Check the same sites manually every morning", after: "A scheduled workflow reports back" },
  { before: "Locked into one vendor's model and pricing", after: "Any model, your key, swap anytime" },
];

export function Comparison() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.from(".cmp-row", {
        opacity: 0,
        y: 24,
        duration: 0.5,
        stagger: 0.08,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 75%", once: true },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="max-w-4xl mx-auto px-6 md:px-8">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] uppercase tracking-wider text-muted-foreground/60">
          Every other AI tool
        </p>
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-[11px] uppercase tracking-wider text-warn">
          Act
        </p>
      </div>

      <div className="space-y-2">
        {ROWS.map((r) => (
          <div key={r.after} className="cmp-row grid grid-cols-2 gap-3">
            <div className="flex items-start gap-2 p-3.5 rounded-lg border border-border/60 bg-background/40">
              <X className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 mt-0.5" />
              <span className="text-sm text-muted-foreground/70 leading-snug">{r.before}</span>
            </div>
            <div className="flex items-start gap-2 p-3.5 rounded-lg border border-warn/25 bg-warn/[0.04]">
              <Check className="h-3.5 w-3.5 text-warn shrink-0 mt-0.5" />
              <span className="text-sm text-foreground leading-snug">{r.after}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
