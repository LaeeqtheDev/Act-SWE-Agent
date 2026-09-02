import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isHostedMode } from "@/lib/hosted-mode";

// Next.js 16 renamed Middleware to Proxy (file convention: proxy.ts instead
// of middleware.ts) — clerkMiddleware() itself is unchanged, only the
// filename differs from most Clerk docs/examples.
//
// Self-hosted (default): every route is open, this file does nothing but
// pass requests through. Hosted mode: /agent and /dashboard require a
// signed-in user; everything else (landing, docs, about) stays public.
//
// HOSTED_MODE is read inside the handler, not at module scope. Reading it
// at module scope meant the value got captured once when this file was
// first evaluated — which, combined with how Next inlines NEXT_PUBLIC_*
// vars, meant flipping it in .env didn't actually take effect without a
// full rebuild. Reading it per-request makes a server restart enough.
const isProtectedRoute = createRouteMatcher(["/agent(.*)", "/dashboard(.*)", "/workflows(.*)", "/billing(.*)", "/profile(.*)"]);

const hostedProxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
    return;
  }

  // A signed-in user hitting the marketing landing page is almost always a
  // navigation accident (logo click, bookmark, back button) — send them to
  // the actual product instead. Signing out clears the session, so /
  // becomes reachable again immediately.
  if (req.nextUrl.pathname === "/") {
    const { userId } = await auth();
    if (userId) {
      return NextResponse.redirect(new URL("/agent", req.url));
    }
  }
});

export default function proxy(req: NextRequest, event: unknown) {
  if (!isHostedMode()) return NextResponse.next();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hostedProxy(req, event as any);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
