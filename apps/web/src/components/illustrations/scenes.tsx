// Hand-built SVG scenes rather than stock icons — each one shows the actual
// shape of the task being described (a browser filling a form, an inbox
// being sorted, a calendar being watched), which communicates far more than
// a generic glyph.
//
// All use currentColor and the theme's --warn variable so they follow the
// palette instead of hardcoding colours.

const frame = "stroke-current opacity-20";
const line = "stroke-current opacity-35";
const fill = "fill-current opacity-[0.07]";

function BrowserChrome() {
  return (
    <>
      <rect x="8" y="10" width="184" height="116" rx="8" className={`${frame} fill-none`} strokeWidth="1.5" />
      <rect x="8" y="10" width="184" height="22" rx="8" className={fill} />
      <line x1="8" y1="32" x2="192" y2="32" className={frame} strokeWidth="1.5" />
      <circle cx="22" cy="21" r="3" className={line} strokeWidth="1.5" fill="none" />
      <circle cx="34" cy="21" r="3" className={line} strokeWidth="1.5" fill="none" />
      <circle cx="46" cy="21" r="3" className={line} strokeWidth="1.5" fill="none" />
    </>
  );
}

// A cursor arrow, drawn at a given position — the recurring motif across
// every scene, since "something is using your computer" is the core idea.
function Cursor({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M0 0 L0 13 L3.6 9.6 L5.9 15 L8.4 13.9 L6.1 8.7 L10.4 8.4 Z"
        style={{ fill: "var(--warn)" }}
        stroke="var(--background)"
        strokeWidth="0.8"
      />
    </g>
  );
}

export function JobApplicationScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 136" className={className} fill="none" aria-hidden="true">
      <BrowserChrome />
      {/* form fields, the last one being filled */}
      <rect x="26" y="46" width="60" height="7" rx="3.5" className={line} strokeWidth="1.5" />
      <rect x="26" y="60" width="148" height="14" rx="4" className={`${frame} fill-none`} strokeWidth="1.5" />
      <rect x="32" y="65" width="52" height="4" rx="2" style={{ fill: "var(--warn)", opacity: 0.55 }} />
      <rect x="26" y="82" width="148" height="14" rx="4" className={`${frame} fill-none`} strokeWidth="1.5" />
      <rect x="32" y="87" width="78" height="4" rx="2" style={{ fill: "var(--warn)", opacity: 0.55 }} />
      {/* submit button, awaiting approval */}
      <rect x="26" y="104" width="52" height="14" rx="4" style={{ stroke: "var(--warn)", opacity: 0.7 }} strokeWidth="1.5" fill="none" />
      <Cursor x={72} y={106} />
    </svg>
  );
}

export function InboxScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 136" className={className} fill="none" aria-hidden="true">
      <BrowserChrome />
      {/* message rows, two flagged as needing a reply */}
      {[46, 64, 82, 100].map((y, i) => (
        <g key={y}>
          <rect x="26" y={y} width="148" height="12" rx="4" className={`${frame} fill-none`} strokeWidth="1.5" />
          <circle
            cx="34"
            cy={y + 6}
            r="2.5"
            style={i < 2 ? { fill: "var(--warn)" } : undefined}
            className={i < 2 ? "" : line}
            strokeWidth={i < 2 ? 0 : 1.5}
            fill={i < 2 ? undefined : "none"}
          />
          <rect x="44" y={y + 4} width={i < 2 ? 84 : 58} height="4" rx="2" className={line} strokeWidth="0" style={{ fill: "currentColor", opacity: 0.28 }} />
        </g>
      ))}
      <Cursor x={132} y={68} />
    </svg>
  );
}

export function ResearchScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 136" className={className} fill="none" aria-hidden="true">
      <BrowserChrome />
      {/* three sources being compared into one document */}
      {[26, 72, 118].map((x, i) => (
        <rect
          key={x}
          x={x}
          y="44"
          width="38"
          height="30"
          rx="4"
          style={i === 1 ? { stroke: "var(--warn)", opacity: 0.7 } : undefined}
          className={i === 1 ? "fill-none" : `${frame} fill-none`}
          strokeWidth="1.5"
        />
      ))}
      <path d="M45 78 L100 92 M91 78 L100 92 M137 78 L100 92" className={line} strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x="62" y="94" width="76" height="26" rx="4" className={`${frame} fill-none`} strokeWidth="1.5" />
      <rect x="70" y="101" width="46" height="3.5" rx="1.75" style={{ fill: "var(--warn)", opacity: 0.5 }} />
      <rect x="70" y="109" width="34" height="3.5" rx="1.75" className={line} style={{ fill: "currentColor", opacity: 0.25 }} strokeWidth="0" />
      <Cursor x={104} y={84} />
    </svg>
  );
}

export function ScheduleScene({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 136" className={className} fill="none" aria-hidden="true">
      <BrowserChrome />
      {/* a repeating run, with the most recent one highlighted */}
      <line x1="40" y1="48" x2="40" y2="114" className={line} strokeWidth="1.5" />
      {[52, 74, 96].map((y, i) => (
        <g key={y}>
          <circle
            cx="40"
            cy={y}
            r="5"
            style={i === 2 ? { fill: "var(--warn)" } : undefined}
            className={i === 2 ? "" : `${frame} fill-none`}
            strokeWidth="1.5"
          />
          <rect x="56" y={y - 5} width={i === 2 ? 104 : 76} height="10" rx="4" className={`${frame} fill-none`} strokeWidth="1.5" />
        </g>
      ))}
      <Cursor x={150} y={88} />
    </svg>
  );
}
