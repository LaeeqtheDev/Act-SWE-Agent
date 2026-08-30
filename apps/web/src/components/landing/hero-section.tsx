"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, GitFork } from "lucide-react";
import { HeroScene } from "./hero-scene";
import { SignalLine } from "./signal-line";
import { Reveal } from "./reveal";
import { TerminalDemo } from "./terminal-demo";

const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

export function HeroSection() {
  const pinRef = useRef<HTMLDivElement>(null);

  return (
    <section ref={pinRef} className="relative overflow-hidden min-h-screen flex items-center">
      <HeroScene pinWrapperRef={pinRef} />
      <div className="relative max-w-6xl mx-auto px-6 md:px-8 py-16 w-full">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-[#35C7C0] mb-5">
              Open source · bring your own model
            </p>
            <h1 style={{ fontFamily: "var(--font-mono)" }} className="text-4xl md:text-[3.4rem] leading-[1.05] font-medium text-[#E8ECEF]">
              Talk to your
              <br />
              infrastructure.
            </h1>
            <p className="mt-6 text-base md:text-lg text-[#9AA7B4] max-w-lg leading-relaxed">
              A chat-first AI SRE agent, not another dashboard. Ask it how a service is
              doing, have it investigate an incident, or tell it to check a status page —
              it calls real tools, browses the real web, and asks before it changes anything.
              Point it at Anthropic, OpenAI, Grok, Groq, or a local Ollama model — your key,
              your choice.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/agent" className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-[#35C7C0] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity">
                Chat with the agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors">
                <GitFork className="h-4 w-4" /> Fork it
              </a>
            </div>
            <p className="mt-4 text-xs text-[#4A5568]">Scroll — watch it catch and repair the degraded node.</p>
          </div>

          <Reveal delay={0.15}>
            <TerminalDemo />
          </Reveal>
        </div>

        <div className="mt-16 md:mt-20 max-w-2xl mx-auto">
          <SignalLine />
        </div>
      </div>
    </section>
  );
}
