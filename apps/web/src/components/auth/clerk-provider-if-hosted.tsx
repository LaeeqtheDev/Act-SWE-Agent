import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { isHostedMode } from "@/lib/hosted-mode";

// Self-hosted (default): render children directly, no Clerk involved at
// all — no publishable key required, nothing to configure. Hosted mode
// wraps in the real ClerkProvider. This is the single switch that decides
// whether the whole app is single-tenant/no-auth or multi-tenant/accounts.

export function ClerkProviderIfHosted({ children }: { children: ReactNode }) {
  if (!isHostedMode()) return <>{children}</>;
  return (
    <ClerkProvider
      appearance={{
        // Match the app's dark theme instead of Clerk's default light
        // modal, and hide the "Optional" hints on the name fields.
        variables: {
          colorBackground: "#141416",
          colorInputBackground: "#1C1C1F",
          colorText: "#F2F3F5",
          colorTextSecondary: "#9A9AA2",
          colorPrimary: "#E0A850",
          colorInputText: "#F2F3F5",
          borderRadius: "0.6rem",
        },
        elements: {
          formFieldHintText: { display: "none" },
          formFieldLabelRow__firstName: { "& .cl-formFieldHintText": { display: "none" } },
          card: { boxShadow: "none", border: "1px solid #2A2A30" },
          footer: { background: "transparent" },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
