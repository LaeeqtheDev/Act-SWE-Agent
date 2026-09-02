"use client";

import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { ArrowRight } from "lucide-react";
import { isHostedMode } from "@/lib/hosted-mode";


// Self-hosted mode has no accounts at all, so there's nothing to sign into —
// the CTA just goes straight to the agent. Hosted mode shows real Sign in /
// Sign up buttons when signed out, and the account menu when signed in.
// Without this, hosted mode had no way to actually log in from the UI: the
// proxy would redirect protected routes, but the landing page offered no
// entry point, and API calls just failed with "Sign in required."
export function AuthNav() {
  // A visible signal when hosted mode is off, so "why is there no login?"
  // is answerable at a glance instead of by digging through env files.
  if (!isHostedMode()) {
    return (
      <Link
        href="/agent"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
      >
        Chat with the agent <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    );
  }

  return (
    <>
      <SignedOut>
        <SignInButton mode="modal" forceRedirectUrl="/agent">
          <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal" forceRedirectUrl="/agent">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm">
            Get started <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <Link
          href="/agent"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity text-sm"
        >
          Open agent <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </>
  );
}
