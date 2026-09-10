// Simple geometric marks in each service's brand colour rather than
// reproductions of their actual logos — instantly recognisable in context,
// no trademark reproduction, and they scale cleanly at small sizes.
export function ServiceIcon({ service, className = "" }: { service: string; className?: string }) {
  if (service === "slack") {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-[#4A154B] ${className}`}>
        <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none">
          <rect x="3" y="10" width="8" height="3" rx="1.5" fill="#36C5F0" />
          <rect x="10" y="3" width="3" height="8" rx="1.5" fill="#2EB67D" />
          <rect x="13" y="11" width="8" height="3" rx="1.5" fill="#ECB22E" />
          <rect x="11" y="13" width="3" height="8" rx="1.5" fill="#E01E5A" />
        </svg>
      </div>
    );
  }

  if (service === "notion") {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-white ${className}`}>
        <span className="text-black font-semibold" style={{ fontSize: "55%" }}>
          N
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center rounded-lg bg-muted ${className}`}>
      <span className="text-foreground font-semibold uppercase" style={{ fontSize: "45%" }}>
        {service.slice(0, 2)}
      </span>
    </div>
  );
}
