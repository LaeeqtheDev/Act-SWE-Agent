import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

// Self-hosted (default): render children directly, no Clerk involved at
// all — no publishable key required, nothing to configure. Hosted mode
// wraps in the real ClerkProvider. This is the single switch that decides
// whether the whole app is single-tenant/no-auth or multi-tenant/accounts.
const isHostedMode = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";

export function ClerkProviderIfHosted({ children }: { children: ReactNode }) {
  if (!isHostedMode) return <>{children}</>;
  return <ClerkProvider>{children}</ClerkProvider>;
}
