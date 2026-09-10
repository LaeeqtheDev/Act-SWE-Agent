"use client";

import { useState } from "react";
import { Briefcase, TrendingUp, Code2, Megaphone, Headphones, Building2 } from "lucide-react";

// The single biggest gap on the old page: someone landed, saw "AI agent
// that browses the web," and had to work out for themselves whether it
// applied to their job. Naming the role explicitly, with tasks in that
// role's own language, does that work for them.
const ROLES = [
  {
    id: "jobseeker",
    icon: Briefcase,
    label: "Job seekers",
    headline: "Stop retyping the same application",
    tasks: [
      "Find backend roles at Stripe and apply to the best fit",
      "Check which of the jobs I saved last week are still open",
      "Pull the requirements from these 5 listings into a comparison",
    ],
  },
  {
    id: "sales",
    icon: TrendingUp,
    label: "Sales & lead gen",
    headline: "Build the list, then work it",
    tasks: [
      "Find plumbers in Manchester on Maps and put them in a spreadsheet",
      "For each one with a website, note what's missing or outdated",
      "Draft outreach mentioning the specific problem you found",
    ],
  },
  {
    id: "founder",
    icon: Building2,
    label: "Founders & small business",
    headline: "The admin nobody has time for",
    tasks: [
      "What came in overnight that actually needs a reply?",
      "Track my competitors' pricing every Monday and flag changes",
      "Book a table for four on Friday evening",
    ],
  },
  {
    id: "dev",
    icon: Code2,
    label: "Developers",
    headline: "Bring your own model, own the whole stack",
    tasks: [
      "Search the codebase for where this function is defined",
      "Check if CI passed and summarise what broke",
      "Any provider — Anthropic, OpenAI, Groq, or local Ollama",
    ],
  },
  {
    id: "marketing",
    icon: Megaphone,
    label: "Marketing & research",
    headline: "Research that ends in a document",
    tasks: [
      "Compare these three vendors on pricing and write it up",
      "Pull the top posts on this topic this week",
      "Check what changed on their landing page since last month",
    ],
  },
  {
    id: "ops",
    icon: Headphones,
    label: "Ops & assistants",
    headline: "Repeatable work, on a schedule",
    tasks: [
      "Catch me up on the #incidents channel",
      "Run this same check every morning at 9",
      "Fill this form with the details from my profile",
    ],
  },
];

export function Roles() {
  const [active, setActive] = useState(ROLES[0].id);
  const role = ROLES.find((r) => r.id === active) ?? ROLES[0];

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-8">
      <div className="flex flex-wrap gap-2 mb-8">
        {ROLES.map((r) => {
          const isActive = r.id === active;
          return (
            <button
              key={r.id}
              onClick={() => setActive(r.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-sm transition-colors ${
                isActive
                  ? "border-warn/40 bg-warn/[0.06] text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/25"
              }`}
            >
              <r.icon className={`h-3.5 w-3.5 ${isActive ? "text-warn" : ""}`} />
              {r.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 md:p-8">
        <h3 className="text-lg md:text-xl font-medium text-foreground mb-5">{role.headline}</h3>
        <div className="space-y-2.5">
          {role.tasks.map((task) => (
            <div key={task} className="flex items-start gap-3">
              <span
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-[11px] text-warn shrink-0 pt-1"
              >
                &rsaquo;
              </span>
              <p
                style={{ fontFamily: "var(--font-mono)" }}
                className="text-sm text-muted-foreground leading-relaxed"
              >
                &ldquo;{task}&rdquo;
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
