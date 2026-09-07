import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import {
  JobApplicationScene,
  InboxScene,
  ResearchScene,
  ScheduleScene,
} from "@/components/illustrations/scenes";
import { ArrowRight, Clock, MousePointerClick, ShieldCheck } from "lucide-react";

export const metadata = { title: "What it can do — Act" };

// Walkthroughs of what actually happens, step by step. Deliberately not
// framed as customer testimonials — there aren't paying customers yet, and
// inventing quotes would be both dishonest and obvious. Showing the real
// mechanics is more convincing than a fabricated five-star review anyway.
const SCENARIOS = [
  {
    id: "job",
    Scene: JobApplicationScene,
    eyebrow: "Job hunting",
    title: "Apply to a role without filling the same form again",
    ask: "Find backend roles at Stripe and apply to the best fit",
    steps: [
      "Opens the careers page and reads the actual listings — not a cached search result",
      "Clicks into each one, pulls out the requirements, and compares them to your saved profile",
      "Finds the application form and fills every field: name, email, phone, links, and the long \"tell us about yourself\" box from your saved resume",
      "Stops. Shows you the completed application and waits for you to approve it",
    ],
    saves: "20–30 minutes per application",
    note: "Nothing is submitted until you approve it. You see every value first.",
  },
  {
    id: "inbox",
    Scene: InboxScene,
    eyebrow: "Email",
    title: "Find out what actually needs you this morning",
    ask: "What came in overnight that needs a reply?",
    steps: [
      "Opens your inbox in the Chrome you're already signed into — no password, no app permissions",
      "Reads the new messages and separates what's waiting on you from newsletters and receipts",
      "Summarises the ones that matter, with enough context to decide without opening each",
      "Drafts replies if you ask — again, shown to you before anything sends",
    ],
    saves: "The first 20 minutes of your day",
    note: "It uses your existing session. Your credentials never leave your machine.",
  },
  {
    id: "research",
    Scene: ResearchScene,
    eyebrow: "Research",
    title: "Compare options without twelve open tabs",
    ask: "Compare these three vendors on pricing and terms, then write it up",
    steps: [
      "Searches, then opens each vendor's actual pricing page rather than trusting a summary",
      "Scrolls the full page — pricing tables are usually below the fold and lazy-loaded",
      "Pulls out the numbers, plan limits, and contract terms that differ",
      "Writes the comparison into a document you can actually use",
    ],
    saves: "An afternoon of tab-juggling",
    note: "Reads the real pages, so it catches details a summary would flatten.",
  },
  {
    id: "schedule",
    Scene: ScheduleScene,
    eyebrow: "On a schedule",
    title: "Have it check something every day without you",
    ask: "Do that every morning at 9",
    steps: [
      "Any task above becomes a scheduled job — describe it once, pick how often",
      "Runs unattended in its own browser window, same tools, same approval gate",
      "Remembers what previous runs found, so it reports what's genuinely new instead of repeating itself",
      "Notifies you when it's done, or if it needs your approval to continue",
    ],
    saves: "The task you keep forgetting to do",
    note: "Three failures in a row and it turns itself off and tells you why.",
  },
];

export default function CaseStudiesPage() {
  return (
    <MarketingShell>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-4">
        What it can do
      </p>
      <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-4">
        Four things people actually use it for
      </h1>
      <p className="text-base text-muted-foreground mb-4 max-w-2xl leading-relaxed">
        Each of these is a real task, walked through step by step — exactly what happens, in order, when
        you ask. No customer quotes, because there aren&apos;t paying customers yet and inventing them
        would be worse than showing you the mechanics.
      </p>

      <div className="space-y-20 mt-16">
        {SCENARIOS.map((s, i) => (
          <section key={s.id} className="scroll-mt-20" id={s.id}>
            <div className={`grid md:grid-cols-2 gap-10 items-center ${i % 2 === 1 ? "md:[direction:rtl]" : ""}`}>
              <div className="md:[direction:ltr]">
                <p
                  style={{ fontFamily: "var(--font-mono)" }}
                  className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/60 mb-2"
                >
                  {s.eyebrow}
                </p>
                <h2 className="text-xl md:text-2xl font-medium text-foreground mb-4">{s.title}</h2>

                <div className="mb-5 rounded-lg border border-border bg-card px-4 py-3">
                  <p
                    style={{ fontFamily: "var(--font-mono)" }}
                    className="text-[13px] text-foreground leading-snug"
                  >
                    &ldquo;{s.ask}&rdquo;
                  </p>
                </div>

                <ol className="space-y-2.5 mb-5">
                  {s.steps.map((step, j) => (
                    <li key={j} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
                      <span
                        style={{ fontFamily: "var(--font-mono)" }}
                        className="text-[11px] text-warn shrink-0 pt-0.5 w-4"
                      >
                        {String(j + 1).padStart(2, "0")}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <Clock className="h-3.5 w-3.5 text-warn" /> Saves {s.saves}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> {s.note}
                  </span>
                </div>
              </div>

              <div className="md:[direction:ltr] rounded-xl border border-border bg-card p-5 text-foreground">
                <s.Scene className="w-full h-auto" />
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-20 pt-10 border-t border-border text-center">
        <MousePointerClick className="h-5 w-5 text-warn mx-auto mb-4" />
        <h2 className="text-xl font-medium text-foreground mb-2">Try it on something of your own</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
          Free to start, no card. Give it a task and watch it work in a real browser window.
        </p>
        <Link
          href="/agent"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm"
        >
          Start free <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingShell>
  );
}
