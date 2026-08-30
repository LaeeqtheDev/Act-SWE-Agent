"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { LucideIcon } from "lucide-react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

// A pinned, horizontally-scrubbed pipeline: the section locks in place while
// four panels slide past horizontally as the user scrolls vertically —
// standard "scrollytelling" technique, genuinely built with ScrollTrigger's
// pin + horizontal-scrub pattern rather than a static 4-up grid.
export function PipelineScroll({ steps }: { steps: Step[] }) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const track = trackRef.current;
    if (!section || !track) return;

    const ctx = gsap.context(() => {
      const distance = track.scrollWidth - section.clientWidth;
      if (distance <= 0) return;

      gsap.to(track, {
        x: -distance,
        ease: "none",
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: () => `+=${distance}`,
          scrub: 1,
          pin: true,
        },
      });
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} className="relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 md:px-8 pt-20 pb-10">
        <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#7C8A99] mb-3">
          How it works
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold text-[#E8ECEF] max-w-xl">
          A real pipeline, end to end — not a mockup.
        </h2>
      </div>
      <div ref={trackRef} className="flex gap-6 px-6 md:px-8 pb-24" style={{ width: "max-content" }}>
        {steps.map((step, i) => (
          <div
            key={step.title}
            className="w-[80vw] sm:w-[420px] shrink-0 bg-[#0B0F14] border border-[#1E2630] rounded-lg p-8"
          >
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs text-[#3A4656]">
              0{i + 1}
            </span>
            <step.icon className="h-6 w-6 text-[#35C7C0] mt-4 mb-5" />
            <h3 className="text-[#E8ECEF] text-lg font-medium mb-3">{step.title}</h3>
            <p className="text-sm text-[#7C8A99] leading-relaxed">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
