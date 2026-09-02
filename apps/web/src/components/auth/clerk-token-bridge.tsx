"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { isHostedMode } from "@/lib/hosted-mode";


// Only ever mounted when isHostedMode is true — at which point
// ClerkProviderIfHosted (layout.tsx) has definitely wrapped the app in a
// real <ClerkProvider>, so calling useAuth() here is always safe. In
// self-hosted mode, this inner component is never instantiated at all, so
// useAuth() is never called without a provider present.
function HostedTokenBridge({ onReady }: { onReady: (getToken: () => Promise<string | null>) => void }) {
  const { getToken } = useAuth();
  // Callers pass an inline arrow for onReady, so it's a new function every
  // render. Keeping it in a ref (instead of an effect dependency) is what
  // stops the setState -> rerender -> new onReady -> effect -> setState
  // loop that blew the update depth.
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    // Wrapped in an arrow on purpose: passing `getToken` bare to a React
    // state setter makes React treat it as a state UPDATER and store its
    // RETURN value, which is how `getToken is not a function` happened.
    onReadyRef.current(() => getToken());
  }, [getToken]);
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
  const selfHostRef = useRef(onReady);
  selfHostRef.current = onReady;
  useEffect(() => {
    if (!isHostedMode()) selfHostRef.current(undefined);
  }, []);

  if (!isHostedMode()) return null;
  return <HostedTokenBridge onReady={onReady} />;
}
