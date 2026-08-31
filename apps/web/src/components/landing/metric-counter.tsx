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
// marketing figures. Hovering reveals a one-line explanation of what the
// number actually means, animated in rather than always-visible clutter.
export function MetricCounter({
  value,
  prefix = "",
  suffix = "",
  label,
  detail,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
  detail?: string;
}) {
  const numRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLParagraphElement>(null);

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

  function showDetail() {
    if (!detailRef.current) return;
    gsap.to(detailRef.current, { opacity: 1, height: "auto", marginTop: 6, duration: 0.25, ease: "power1.out" });
  }
  function hideDetail() {
    if (!detailRef.current) return;
    gsap.to(detailRef.current, { opacity: 0, height: 0, marginTop: 0, duration: 0.2, ease: "power1.in" });
  }

  return (
    <div onMouseEnter={showDetail} onMouseLeave={hideDetail} className="cursor-default">
      <div style={{ fontFamily: "var(--font-mono)" }} className="text-4xl md:text-5xl font-medium text-foreground tabular-nums">
        {prefix}
        <span ref={numRef}>0</span>
        {suffix}
      </div>
      <p className="text-sm text-muted-foreground mt-2">{label}</p>
      {detail && (
        <p ref={detailRef} style={{ opacity: 0, height: 0, overflow: "hidden" }} className="text-xs text-muted-foreground/70 leading-relaxed">
          {detail}
        </p>
      )}
    </div>
  );
}
