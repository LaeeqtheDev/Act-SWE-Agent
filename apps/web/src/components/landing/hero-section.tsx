"use client";

import Link from "next/link";
import { ArrowRight, GitFork, ShieldCheck, KeyRound } from "lucide-react";
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
              It doesn&apos;t explain.
              <br />
              It does the work.
            </h1>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-lg leading-relaxed">
              An AI agent that opens a real browser, signed into your real accounts. Ask it to
              find a job and apply — it reads the listings, fills the form with your details, and
              shows you everything before a single thing is submitted. Any model, your key,
              free to self-host forever.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/agent" className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
                Chat with the agent <ArrowRight className="h-4 w-4" />
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors">
                <GitFork className="h-4 w-4" /> Fork it
              </a>
            </div>

            {/* Answers the three objections someone has before clicking:
                does it cost anything, do I hand over credentials, can it do
                something I didn't sanction. */}
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-warn" /> Approves before it acts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-warn" /> No passwords handed over
              </span>
              <span className="inline-flex items-center gap-1.5">
                <GitFork className="h-3.5 w-3.5 text-warn" /> MIT — self-host free
              </span>
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
