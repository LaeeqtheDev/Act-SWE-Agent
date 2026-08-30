"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// A single stat that counts up from 0 to its target once it scrolls into
// view — used for the "by the numbers" strip. Numbers here are literal and
// checkable against the repo (4 services, 5 agent tools, etc.), not vanity
// marketing figures, which is the point: a portfolio project earns more
// trust from specific, verifiable claims than from generic superlatives.
export function MetricCounter({
  value,
  prefix = "",
  suffix = "",
  label,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}) {
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = numRef.current;
    if (!el) return;

    const counter = { val: 0 };
    const ctx = gsap.context(() => {
      gsap.to(counter, {
        val: value,
        duration: 1.4,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 90%", once: true },
        onUpdate: () => {
          el.textContent = Math.round(counter.val).toString();
        },
      });
    });

    return () => ctx.revert();
  }, [value]);

  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)" }} className="text-4xl md:text-5xl font-medium text-[#E8ECEF] tabular-nums">
        {prefix}
        <span ref={numRef}>0</span>
        {suffix}
      </div>
      <p className="text-sm text-[#7C8A99] mt-2">{label}</p>
    </div>
  );
}
