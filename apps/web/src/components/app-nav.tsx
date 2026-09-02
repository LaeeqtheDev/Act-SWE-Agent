"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { MessageSquare, LayoutDashboard, Workflow, CreditCard, UserCog } from "lucide-react";
import { isHostedMode } from "@/lib/hosted-mode";
import { NotificationBell } from "@/components/agent/notification-bell";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// One nav across every signed-in page. Previously each page invented its own
// header, so there was no way to reach billing or your profile without
// knowing the URL — which is exactly the "where is navigation?" problem.
const LINKS = [
  { href: "/agent", label: "Chat", icon: MessageSquare },
  { href: "/dashboard", label: "Activity", icon: LayoutDashboard },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/profile", label: "Profile", icon: UserCog },
  { href: "/billing", label: "Billing", icon: CreditCard, hostedOnly: true },
];

export function AppNav({
  getToken,
  right,
}: {
  getToken?: () => Promise<string | null>;
  right?: React.ReactNode;
}) {
  const pathname = usePathname();
  const hosted = isHostedMode();

  return (
    <header className="border-b border-border">
      <div className="px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 min-w-0">
          <Link href="/agent" className="flex items-center gap-2 pr-3 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={24} height={24} className="rounded-md" />
            <span
              style={{ fontFamily: "var(--font-mono)" }}
              className="hidden sm:inline text-xs tracking-widest uppercase text-foreground"
            >
              Act
            </span>
          </Link>

          <nav className="flex items-center gap-0.5 overflow-x-auto">
            {LINKS.filter((l) => !l.hostedOnly || hosted).map((l) => {
              const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors whitespace-nowrap ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <l.icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{l.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {right}
          <NotificationBell apiUrl={API_URL} getToken={getToken} />
          {hosted && <UserButton afterSignOutUrl="/" />}
        </div>
      </div>
    </header>
  );
}
