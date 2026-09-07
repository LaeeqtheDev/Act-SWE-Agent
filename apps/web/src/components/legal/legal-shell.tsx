import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

// Shared shell for privacy and terms so they read as part of the product
// rather than two orphaned pages.
export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={20} height={20} className="rounded" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-widest uppercase">
              Act
            </span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated {updated}</p>
        <div className="space-y-8">{children}</div>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link href="/docs" className="hover:text-foreground transition-colors">Docs</Link>
          <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-foreground mb-3">{title}</h2>
      <div className="space-y-3 text-[15px] text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}
