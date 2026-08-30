// Distinct monogram badges per provider — a colored circle + letterform,
// not a reproduction of any company's actual logo/trademark. Gives each
// provider a genuinely different visual identity in lists instead of the
// same generic icon repeated four times.
const STYLES: Record<string, { bg: string; fg: string; mark: string }> = {
  anthropic: { bg: "#D97757", fg: "#1A1108", mark: "A" },
  openai: { bg: "#10A37F", fg: "#F5FFFC", mark: "O" },
  grok: { bg: "#0E0E0E", fg: "#FFFFFF", mark: "X" },
  groq: { bg: "#F55036", fg: "#FFFFFF", mark: "Q" },
  ollama: { bg: "#E8DCC8", fg: "#3A2E1F", mark: "L" },
};

export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  const style = STYLES[provider] ?? { bg: "#3A4656", fg: "#E8ECEF", mark: "?" };
  return (
    <span
      style={{ width: size, height: size, background: style.bg, color: style.fg, fontSize: size * 0.52 }}
      className="inline-flex items-center justify-center rounded-full font-semibold shrink-0 select-none"
    >
      {style.mark}
    </span>
  );
}
