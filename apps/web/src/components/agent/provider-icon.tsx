// Distinct minimal glyphs per provider — geometric marks, not colored badges,
// so they sit naturally in a monochrome theme instead of introducing a rainbow
// of brand colors. None of these reproduce any company's actual logo/trademark
// — each is a simple original shape, differentiated by form, not color.
export function ProviderIcon({ provider, size = 20 }: { provider: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (provider) {
    case "anthropic":
      // three ascending bars
      return (
        <svg {...common}>
          <path d="M6 18V10M12 18V6M18 18V13" />
        </svg>
      );
    case "openai":
      // interlocking rings
      return (
        <svg {...common}>
          <circle cx="9" cy="12" r="5.5" />
          <circle cx="15" cy="12" r="5.5" />
        </svg>
      );
    case "grok":
      // angular spark
      return (
        <svg {...common}>
          <path d="M5 19L12 5L19 19M8.5 13H15.5" />
        </svg>
      );
    case "groq":
      // stacked lightning
      return (
        <svg {...common}>
          <path d="M13 3L5 14h6l-1 7 9-12h-6l1-6z" />
        </svg>
      );
    case "ollama":
      // simple llama-eared mark
      return (
        <svg {...common}>
          <path d="M8 20V13a4 4 0 0 1 8 0v7M9 13V8M15 13V8M6 20h12" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      );
  }
}
