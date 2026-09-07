import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });


// Shared shell for the secondary marketing pages (About, Case Studies, Docs)
// — same fonts/colors/nav pattern as the landing page, without duplicating
// the whole hero/pipeline apparatus that only the homepage needs.
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${plexMono.variable} ${plexSans.variable} bg-background min-h-screen`} style={{ fontFamily: "var(--font-sans)" }}>
      <nav className="max-w-4xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={24} height={24} className="rounded-md" />
          <span
            style={{ fontFamily: "var(--font-mono)" }}
            className="text-sm tracking-widest uppercase text-foreground"
          >
            Act
          </span>
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/case-studies" className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors">What it can do</Link>
          <Link href="/#pricing" className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
          <Link href="/about" className="hidden md:inline text-muted-foreground hover:text-foreground transition-colors">About</Link>
          <Link href="/docs" className="hidden md:inline text-muted-foreground hover:text-foreground transition-colors">Docs</Link>
          <Link href="/agent" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity">
            Try free <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 md:px-8 py-12 md:py-16">{children}</main>
      <footer className="border-t border-border mt-20">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>&copy; {new Date().getFullYear()} Act. Open source under the MIT license.</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
