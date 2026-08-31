"use client";

import Link from "next/link";
import { ArrowRight, GitFork } from "lucide-react";
import { FlowField } from "./flow-field";
import { SignalLine } from "./signal-line";
import { Reveal } from "./reveal";
import { TerminalDemo } from "./terminal-demo";

const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden min-h-screen flex items-center bg-background">
      <FlowField />
      <div className="relative max-w-6xl mx-auto px-6 md:px-8 py-16 w-full">
        <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
          <div>
            <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-5">
              Open source · bring your own model
            </p>
            <h1 style={{ fontFamily: "var(--font-mono)" }} className="text-4xl md:text-[3.4rem] leading-[1.05] font-medium text-foreground">
              Talk to your
              <br />
              infrastructure.
            </h1>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              A chat-first AI SRE agent, not another dashboard. Ask it how a service is
              doing, have it investigate an incident, or tell it to check a status page —
              it calls real tools, browses the real web, and asks before it changes anything.
              Point it at Anthropic, OpenAI, Grok, Groq, or a local Ollama model — your key,
              your choice.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/agent" className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
                Chat with the agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors">
                <GitFork className="h-4 w-4" /> Fork it
              </a>
            </div>
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
