"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

// The questions someone actually has before trusting this with their Gmail
// and their job applications. Answered honestly, including the limitations —
// a page that only makes claims reads as marketing; one that names its own
// constraints reads as something built by people who use it.
const FAQS = [
  {
    q: "Do I hand over my passwords?",
    a: "No. It drives the Chrome already running on your machine, using the sessions you're already signed into. There's no credential storage, no OAuth scopes, and nothing to revoke — the same trust boundary as clicking around yourself.",
  },
  {
    q: "Can it do something I didn't approve?",
    a: "Reading, browsing, and clicking through pages happen freely. Anything that submits, sends, posts, or changes state stops and waits for you — including in scheduled runs when nobody's watching. It shows the complete filled form before a single field is sent.",
  },
  {
    q: "What does it cost?",
    a: "Self-hosting is free forever under MIT, with no limits. The hosted free tier is 10 tasks a month with no card. Pro is $30/month for 500. Bring your own API key on any tier and usage limits don't apply.",
  },
  {
    q: "Which AI model does it use?",
    a: "Whichever you choose — Anthropic, OpenAI, Grok, Groq, or a fully local Ollama model. Your key, swappable from the settings panel at any time, stored encrypted. No vendor lock-in.",
  },
  {
    q: "Does it work on every website?",
    a: "Most of them. Sites with serious bot detection — Google Search, some Cloudflare-protected pages — will still block automated browsers, and no tool honestly claims otherwise. Using your own Chrome profile helps considerably, since real history and cookies get challenged far less.",
  },
  {
    q: "What happens if it gets something wrong?",
    a: "You see it happening in a real browser window and can stop it mid-task. Since nothing submits without approval, the worst case is wasted time rather than a sent email or a submitted application.",
  },
  {
    q: "Can I run tasks on a schedule?",
    a: "Yes. Describe it once, pick a cadence, and it runs unattended — same tools, same approval gate. Each workflow remembers what previous runs found, so it reports what's genuinely new instead of repeating itself.",
  },
  {
    q: "Is it really open source?",
    a: "MIT licensed, all of it. Fork it, self-host it, build a business on it. No attribution required, no open-core bait where the useful parts are paid.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-8">
      <div className="divide-y divide-border border-y border-border">
        {FAQS.map((f, i) => (
          <div key={f.q}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-start justify-between gap-4 py-5 text-left group"
            >
              <span className="text-[15px] text-foreground font-medium group-hover:text-warn transition-colors">
                {f.q}
              </span>
              <Plus
                className={`h-4 w-4 shrink-0 mt-0.5 text-muted-foreground transition-transform duration-200 ${
                  open === i ? "rotate-45" : ""
                }`}
              />
            </button>
            <div
              className="grid transition-all duration-300 ease-out"
              style={{ gridTemplateRows: open === i ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="text-sm text-muted-foreground leading-relaxed pb-5 pr-8">{f.a}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
