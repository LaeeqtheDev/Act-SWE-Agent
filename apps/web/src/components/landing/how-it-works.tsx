"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { MessageSquare, Eye, ShieldCheck, CheckCircle2 } from "lucide-react";

if (typeof window !== "undefined") gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  {
    icon: MessageSquare,
    label: "You ask",
    title: "Say it in plain language",
    body: "\"Find backend roles at Stripe and apply to the best fit.\" No prompt engineering, no configuration, no workflow builder.",
  },
  {
    icon: Eye,
    label: "It works",
    title: "A real browser opens",
    body: "You watch the cursor move, click, and type — in your own Chrome, signed into your own accounts. Nothing is hidden from you.",
  },
  {
    icon: ShieldCheck,
    label: "You approve",
    title: "Nothing sends without you",
    body: "It fills the entire form, then stops. You see every value before anything is submitted. One review, one click.",
  },
  {
    icon: CheckCircle2,
    label: "It finishes",
    title: "Then keeps going",
    body: "After approval it picks the task back up on its own — no need to tell it to continue.",
  },
];

// A vertical timeline with a line that draws itself as you scroll. The
// four-step arc is the core pitch: ask, watch, approve, done — most people
// don't read feature lists, but they will follow a sequence.
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".hiw-line",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          transformOrigin: "top",
          scrollTrigger: { trigger: el, start: "top 65%", end: "bottom 75%", scrub: 0.5 },
        }
      );
      gsap.from(".hiw-step", {
        opacity: 0,
        x: -20,
        duration: 0.5,
        stagger: 0.15,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 70%", once: true },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className="relative max-w-2xl mx-auto px-6 md:px-8">
      <div className="absolute left-[calc(1.5rem+19px)] md:left-[calc(2rem+19px)] top-3 bottom-3 w-px bg-border" />
      <div className="hiw-line absolute left-[calc(1.5rem+19px)] md:left-[calc(2rem+19px)] top-3 bottom-3 w-px bg-warn" />

      <div className="space-y-10">
        {STEPS.map((s) => (
          <div key={s.title} className="hiw-step relative flex gap-5">
            <div className="relative z-10 h-10 w-10 shrink-0 rounded-full border border-border bg-background flex items-center justify-center">
              <s.icon className="h-4 w-4 text-warn" />
            </div>
            <div className="pt-1.5">
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-1.5"
              >
                {s.label}
              </p>
              <h3 className="text-lg font-medium text-foreground mb-1.5">{s.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{s.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
