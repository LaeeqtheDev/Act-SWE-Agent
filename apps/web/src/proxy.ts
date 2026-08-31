import { NextResponse, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16 renamed Middleware to Proxy (file convention: proxy.ts instead
// of middleware.ts) — clerkMiddleware() itself is unchanged, only the
// filename differs from most Clerk docs/examples.
//
// Self-hosted (default): every route is open, this file does nothing but
// pass requests through. Hosted mode: /agent and /dashboard require a
// signed-in user; everything else (landing, docs, about) stays public.
const isHostedMode = process.env.NEXT_PUBLIC_HOSTED_MODE === "true";
const isProtectedRoute = createRouteMatcher(["/agent(.*)", "/dashboard(.*)"]);

const hostedProxy = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default function proxy(req: NextRequest, event: unknown) {
  if (!isHostedMode) return NextResponse.next();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return hostedProxy(req, event as any);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
