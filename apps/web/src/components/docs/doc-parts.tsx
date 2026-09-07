import type { ReactNode } from "react";

// Small, consistent building blocks so every docs section looks the same
// instead of each one inventing its own spacing and type scale.

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-20 text-2xl font-semibold text-foreground mt-14 mb-4 first:mt-0">
      {children}
    </h2>
  );
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-20 text-base font-medium text-foreground mt-10 mb-3">
      {children}
    </h3>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-muted-foreground leading-relaxed mb-4">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="text-[13px] font-mono text-foreground bg-muted px-1.5 py-0.5 rounded">{children}</code>
  );
}

export function Pre({ children }: { children: string }) {
  return (
    <pre
      style={{ fontFamily: "var(--font-mono)" }}
      className="text-[13px] leading-relaxed bg-card border border-border rounded-lg p-4 overflow-x-auto text-foreground my-4"
    >
      {children}
    </pre>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={`my-5 rounded-lg border-l-2 px-4 py-3 text-sm ${
        tone === "warn"
          ? "border-warn bg-warn/5 text-foreground"
          : "border-border bg-muted/30 text-muted-foreground"
      }`}
    >
      {children}
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            {head.map((h) => (
              <th key={h} className="text-left font-medium text-foreground px-4 py-2.5 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-muted-foreground align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
