import { SignIn } from "@clerk/nextjs";

// Only ever reachable in hosted mode (proxy.ts redirects here); harmless if
// visited directly in self-host mode, Clerk's components just won't have a
// provider around them to render meaningfully in that case.
export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <SignIn />
    </div>
  );
}
