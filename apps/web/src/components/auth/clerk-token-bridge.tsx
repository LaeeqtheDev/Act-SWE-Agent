"use client";

import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

const isHostedMode = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";

// Only ever mounted when isHostedMode is true — at which point
// ClerkProviderIfHosted (layout.tsx) has definitely wrapped the app in a
// real <ClerkProvider>, so calling useAuth() here is always safe. In
// self-hosted mode, this inner component is never instantiated at all, so
// useAuth() is never called without a provider present.
function HostedTokenBridge({ onReady }: { onReady: (getToken: () => Promise<string | null>) => void }) {
  const { getToken } = useAuth();
  useEffect(() => {
    onReady(getToken);
  }, [getToken, onReady]);
  return null;
}

// Exposes a `getToken` function to the parent page via callback — renders
// nothing itself. Self-hosted mode reports `undefined` immediately (no
// Clerk involved at all); hosted mode reports the real Clerk token getter
// once available.
export function ClerkTokenBridge({
  onReady,
}: {
  onReady: (getToken: (() => Promise<string | null>) | undefined) => void;
}) {
  useEffect(() => {
    if (!isHostedMode) onReady(undefined);
  }, [onReady]);

  if (!isHostedMode) return null;
  return <HostedTokenBridge onReady={onReady} />;
}
