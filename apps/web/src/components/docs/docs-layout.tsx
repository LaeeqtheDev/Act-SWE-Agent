"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Menu, X } from "lucide-react";

export interface DocSection {
  id: string;
  title: string;
  items?: { id: string; title: string }[];
}

// A real docs shell: persistent sidebar nav, scroll-spy highlighting the
// current section, and an on-this-page rail — the structure people expect
// from documentation rather than one long unbroken page.
export function DocsLayout({
  sections,
  children,
}: {
  sections: DocSection[];
  children: React.ReactNode;
}) {
  const [active, setActive] = useState<string>(sections[0]?.id ?? "");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const ids = sections.flatMap((s) => [s.id, ...(s.items ?? []).map((i) => i.id)]);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      // Top-weighted margin so a heading counts as "current" once it reaches
      // the upper part of the viewport, not only when centred.
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 }
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const nav = (
    <nav className="space-y-6">
      {sections.map((section) => (
        <div key={section.id}>
          <a
            href={`#${section.id}`}
            onClick={() => setMobileOpen(false)}
            className={`block text-sm font-medium transition-colors ${
              active === section.id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {section.title}
          </a>
          {section.items && section.items.length > 0 && (
            <div className="mt-2 space-y-1 border-l border-border pl-3">
              {section.items.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setMobileOpen(false)}
                  className={`block text-[13px] transition-colors ${
                    active === item.id
                      ? "text-warn"
                      : "text-muted-foreground/70 hover:text-foreground"
                  }`}
                >
                  {item.title}
                </a>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={20} height={20} className="rounded" />
            <span style={{ fontFamily: "var(--font-mono)" }} className="text-xs tracking-widest uppercase">
              Docs
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="lg:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 flex gap-10">
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } lg:block lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:w-56 shrink-0 overflow-y-auto py-8`}
        >
          {nav}
        </aside>

        <main className="flex-1 min-w-0 py-10 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
