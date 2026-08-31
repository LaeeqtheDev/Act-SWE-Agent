"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

// A signal line that spikes — an incident — then is drawn back down and
// re-colored from amber to the theme's neutral foreground, standing in for
// "detected, then healed." Uses the shared CSS variables so it always
// matches whatever the current theme is, not a hardcoded palette.
export function SignalLine() {
  const baseRef = useRef<SVGPathElement>(null);
  const spikeRef = useRef<SVGPathElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const labelRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const base = baseRef.current;
    const spike = spikeRef.current;
    const dot = dotRef.current;
    const label = labelRef.current;
    if (!base || !spike || !dot || !label) return;

    const baseLength = base.getTotalLength();
    const spikeLength = spike.getTotalLength();

    gsap.set(base, { strokeDasharray: baseLength, strokeDashoffset: baseLength });
    gsap.set(spike, { strokeDasharray: spikeLength, strokeDashoffset: spikeLength, stroke: "var(--warn)" });
    gsap.set(dot, { opacity: 0 });
    gsap.set(label, { opacity: 0, y: 6 });

    const tl = gsap.timeline({ delay: 0.4, defaults: { ease: "power2.out" } });

    tl.to(base, { strokeDashoffset: 0, duration: 1.1 })
      .to(spike, { strokeDashoffset: 0, duration: 0.5, ease: "power1.inOut" }, "-=0.15")
      .to(dot, { opacity: 1, duration: 0.2 }, "-=0.2")
      .to(label, { opacity: 1, y: 0, duration: 0.4 }, "-=0.1")
      .to(spike, { stroke: "var(--foreground)", duration: 0.8, ease: "power2.inOut" }, "+=0.3")
      .to(dot, { fill: "var(--foreground)", duration: 0.8 }, "<");

    return () => {
      tl.kill();
    };
  }, []);

  return (
    <svg viewBox="0 0 800 160" className="w-full h-auto" role="img" aria-label="Incident detected, then resolved">
      <path
        ref={baseRef}
        d="M0,110 L260,110"
        fill="none"
        stroke="var(--border)"
        strokeWidth={2}
      />
      <path
        ref={spikeRef}
        d="M260,110 L286,26 L312,132 L338,60 L364,110 L800,110"
        fill="none"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle ref={dotRef} cx={312} cy={132} r={4.5} fill="var(--warn)" />
      <text ref={labelRef} x={312} y={152} textAnchor="middle" className="fill-current text-[11px] font-mono" fill="var(--muted-foreground)">
        detected &rarr; resolved
      </text>
    </svg>
  );
}
