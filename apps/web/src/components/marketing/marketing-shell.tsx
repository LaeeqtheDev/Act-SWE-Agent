import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ArrowRight, ArrowLeft, Star } from "lucide-react";
import type { ReactNode } from "react";

const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono" });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });

const REPO_URL = "https://github.com/LaeeqtheDev/Act-SWE-Agent";

// Shared shell for the secondary marketing pages (About, Case Studies, Docs)
// — same fonts/colors/nav pattern as the landing page, without duplicating
// the whole hero/pipeline apparatus that only the homepage needs.
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${plexMono.variable} ${plexSans.variable} bg-[#0B0F14] min-h-screen`} style={{ fontFamily: "var(--font-sans)" }}>
      <nav className="max-w-4xl mx-auto px-6 md:px-8 py-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-1 text-xs text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">
          <ArrowLeft className="h-3 w-3" /> Act · SWE Agent
        </Link>
        <div className="flex items-center gap-5 text-sm">
          <Link href="/docs" className="hidden sm:inline text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">Docs</Link>
          <Link href="/case-studies" className="hidden sm:inline text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">Case studies</Link>
          <Link href="/about" className="hidden sm:inline text-[#7C8A99] hover:text-[#E8ECEF] transition-colors">About</Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#2A3644] text-[#E8ECEF] hover:border-[#3A4656] transition-colors">
            <Star className="h-3.5 w-3.5" /> Star
          </a>
          <Link href="/agent" className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#E8ECEF] text-[#0B0F14] font-medium hover:opacity-90 transition-opacity">
            Chat <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 md:px-8 py-12 md:py-16">{children}</main>
      <footer className="border-t border-[#1E2630] mt-20">
        <div className="max-w-4xl mx-auto px-6 md:px-8 py-8 text-xs text-[#7C8A99]">
          Act · SWE Agent — MIT licensed, open source
        </div>
      </footer>
    </div>
  );
}
