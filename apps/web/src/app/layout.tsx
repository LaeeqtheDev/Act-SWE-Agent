import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProviderIfHosted } from "@/components/auth/clerk-provider-if-hosted";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Act · SWE Agent — an AI agent that actually does the work",
  description:
    "An open-source, model-agnostic AI agent that browses the real web in your own logged-in browser, fills forms, runs scheduled workflows, and asks before it changes anything. Bring your own model.",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ClerkProviderIfHosted>{children}</ClerkProviderIfHosted>
      </body>
    </html>
  );
}
