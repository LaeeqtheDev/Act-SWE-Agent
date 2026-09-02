"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Zap, Layers, Search, ShieldCheck, CircleCheck } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Icons are resolved by name inside this client component rather than
// passed in from the server component — React can't serialize a component
// function across that boundary.
const ICONS = { zap: Zap, layers: Layers, search: Search, shield: ShieldCheck, check: CircleCheck };

interface Step {
  icon: keyof typeof ICONS;
  title: string;
  body: string;
}

// A pinned, horizontally-scrubbed pipeline built with GSAP's documented
// containerAnimation pattern (not a hand-rolled per-frame layout read) —
// each card's own fade/scale ScrollTrigger is tied to the SAME tween that
// drives the horizontal movement, which is the robust, well-tested way to
// animate items inside a horizontally-scrolling pinned track.
export function PipelineScroll({ steps }: { steps: Step[] }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const ctx = gsap.context(() => {
      const distance = Math.max(0, track.scrollWidth - section.clientWidth);
      if (distance <= 0) return;

      const scrollTween = gsap.to(track, {
        x: -distance,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${distance}`,
          scrub: 1,
          pin: true,
          invalidateOnRefresh: true,
        },
      });

      for (const card of cardRefs.current) {
        if (!card) continue;
        gsap.fromTo(
          card,
          { scale: 0.94, opacity: 0.55 },
          {
            scale: 1,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              containerAnimation: scrollTween,
              start: "left 88%",
              end: "left 55%",
              scrub: true,
            },
          }
        );
        gsap.fromTo(
          card,
          { scale: 1, opacity: 1 },
          {
            scale: 0.94,
            opacity: 0.55,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              containerAnimation: scrollTween,
              start: "right 45%",
              end: "right 12%",
              scrub: true,
            },
          }
        );
      }
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} className="relative overflow-hidden" style={{ maxWidth: "100vw" }}>
      <div className="max-w-6xl mx-auto px-6 md:px-8 pt-20 pb-10">
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
          How it works
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold text-foreground max-w-xl">
          A real pipeline, end to end — not a mockup.
        </h2>
      </div>
      <div ref={trackRef} className="flex gap-6 px-6 md:px-8 pb-24" style={{ width: "max-content" }}>
        {steps.map((step, i) => {
          const Icon = ICONS[step.icon];
          return (
          <div
            key={step.title}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="w-[75vw] sm:w-[340px] shrink-0 bg-background border border-border rounded-lg p-8"
          >
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-muted-foreground/50">
              0{i + 1}
            </span>
            <Icon className="h-6 w-6 text-foreground mt-4 mb-5" />
            <h3 className="text-foreground text-lg font-medium mb-3">{step.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
          </div>
          );
        })}
      </div>
    </div>
  );
}
