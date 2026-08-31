"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

interface Usage {
  hosted: boolean;
  tasksUsed?: number;
  limit?: number;
  plan?: string;
}

// Only renders anything in hosted mode — self-hosted users never see this,
// since /usage responds { hosted: false } and there's nothing to show.
export function UsageBanner({ apiUrl, getToken }: { apiUrl: string; getToken?: () => Promise<string | null> }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken ? await getToken() : null;
        const res = await fetch(`${apiUrl}/usage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setUsage(await res.json());
      } catch {
        // API unreachable — just don't show the banner rather than break the page.
      }
    })();
  }, [apiUrl, getToken]);

  if (!usage?.hosted || usage.tasksUsed === undefined || usage.limit === undefined) return null;

  const nearLimit = usage.tasksUsed >= usage.limit * 0.8;

  return (
    <div
      className={`px-3 py-1.5 rounded-md text-xs flex items-center gap-2 ${
        nearLimit ? "bg-amber-500/10 text-amber-600" : "bg-muted text-muted-foreground"
      }`}
    >
      <Zap className="h-3 w-3" />
      {usage.tasksUsed}/{usage.limit} tasks used ({usage.plan})
      {nearLimit && usage.plan === "free" && (
        <Link href="/billing" className="underline">
          Upgrade
        </Link>
      )}
    </div>
  );
}
