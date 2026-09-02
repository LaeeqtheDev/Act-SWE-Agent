// Single source of truth for whether hosted mode is on.
//
// Read as a FUNCTION, never captured into a module-scope const. Next.js
// inlines NEXT_PUBLIC_* at build time, and a module-scope const additionally
// freezes the value at first module evaluation — so flipping the flag in
// .env appeared to do nothing without a full clean rebuild. Calling this at
// render/request time means restarting the dev server is enough.
export function isHostedMode(): boolean {
  return process.env.NEXT_PUBLIC_HOSTED_MODE === "true";
}
