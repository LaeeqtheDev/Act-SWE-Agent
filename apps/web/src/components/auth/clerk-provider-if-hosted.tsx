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
          card: { boxShadow: "none", border: "1px solid #2A2A30" },
          footer: { background: "transparent" },
          // The social buttons were rendering near-invisible against the
          // dark card — Clerk's defaults assume a light background, so the
          // provider names came out dark-on-dark and looked disabled.
          socialButtonsBlockButton: {
            backgroundColor: "#1C1C1F",
            border: "1px solid #35353C",
            color: "#F2F3F5",
            "&:hover": { backgroundColor: "#26262B" },
          },
          socialButtonsBlockButtonText: { color: "#F2F3F5", fontWeight: 500 },
          socialButtonsProviderIcon: { filter: "none", opacity: 1 },
          dividerLine: { backgroundColor: "#2A2A30" },
          dividerText: { color: "#8A8A92" },
          formButtonPrimary: {
            backgroundColor: "#E0A850",
            color: "#1A1A1C",
            fontWeight: 600,
            "&:hover": { backgroundColor: "#EBB65E" },
          },
          footerActionLink: { color: "#E0A850", "&:hover": { color: "#EBB65E" } },
          identityPreviewEditButton: { color: "#E0A850" },
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
