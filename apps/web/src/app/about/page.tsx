import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ArrowRight, Eye, Lock, Unlock } from "lucide-react";

export const metadata = { title: "About — Act" };

const PRINCIPLES = [
  {
    icon: Eye,
    title: "You watch it work",
    body: "A real browser window opens and you see the cursor move, click, and type. Nothing happens in a black box you can't inspect — if it does something you didn't expect, you'll see it as it happens and can stop it.",
  },
  {
    icon: Lock,
    title: "It asks before it acts",
    body: "Reading and clicking around are free. Anything that sends, submits, or posts stops and shows you exactly what it's about to do. That's true even when it's running on a schedule at 3am with nobody watching.",
  },
  {
    icon: Unlock,
    title: "You can leave whenever",
    body: "No password ever leaves your machine, your data is yours to delete, and the whole thing is open source. If we disappeared tomorrow you could run it yourself and lose nothing.",
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <p style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-[0.2em] uppercase text-warn mb-4">
        About
      </p>
      <h1 className="text-3xl md:text-4xl font-semibold text-foreground mb-6">
        Most AI tells you how. This one just does it.
      </h1>

      <div className="space-y-5 text-[15px] text-muted-foreground leading-relaxed max-w-2xl">
        <p>
          Ask a chatbot to apply for a job and it writes you a nice explanation of how to apply for a
          job. You still have to open the tab, find the form, and type your phone number in for the
          hundredth time.
        </p>
        <p>
          Act was built the other way around. You describe what you want done, and it opens an actual
          browser — the one on your computer, signed into the accounts you&apos;re already signed into —
          and does it. Reads the listings, fills the form, drafts the reply.
        </p>
        <p className="text-foreground">
          The part that took the longest to get right wasn&apos;t making it capable. It was making it
          trustworthy enough that you&apos;d let it near your inbox.
        </p>
      </div>

      <div className="mt-14 grid sm:grid-cols-3 gap-5">
        {PRINCIPLES.map((p) => (
          <div key={p.title} className="p-5 rounded-lg border border-border bg-card">
            <p.icon className="h-5 w-5 text-warn mb-3" />
            <h2 className="text-[15px] font-medium text-foreground mb-2">{p.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 space-y-5 text-[15px] text-muted-foreground leading-relaxed max-w-2xl">
        <h2 className="text-xl font-medium text-foreground">Why it&apos;s free to run yourself</h2>
        <p>
          The entire thing is open source. You can download it, run it on your own computer, and never
          pay anything — no feature gates, no crippled free version.
        </p>
        <p>
          The hosted version exists for people who&apos;d rather not set up a database to check their
          email. That&apos;s the whole difference. If that&apos;s not you, take the code.
        </p>
      </div>

      <div className="mt-16 pt-10 border-t border-border">
        <h2 className="text-xl font-medium text-foreground mb-3">Who&apos;s behind it</h2>
        <p className="text-[15px] text-muted-foreground leading-relaxed max-w-2xl mb-5">
          Built by Syed Laeeq Ahmed, a full-stack engineer. It started as a project to prove out a real
          agent architecture and turned into something worth using every day.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <a href="mailto:laeeq@northfoundry.co" className="text-warn hover:underline">
            laeeq@northfoundry.co
          </a>
          <a
            href="https://github.com/LaeeqtheDev"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a
            href="https://www.linkedin.com/in/syed-laeeq-ahmed/"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            LinkedIn
          </a>
        </div>
      </div>

      <div className="mt-16 pt-10 border-t border-border">
        <Link
          href="/agent"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm"
        >
          Give it a task <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </MarketingShell>
  );
}
