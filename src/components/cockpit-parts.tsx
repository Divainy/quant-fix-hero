import { useEffect, useRef, useState } from "react";
import type { DocStatus } from "@/lib/phys-inv-store";
import { statusLabel } from "@/lib/phys-inv-store";

export function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, string> = {
    CREATED: "bg-secondary text-secondary-foreground border-border",
    COUNTED: "bg-info-soft text-primary border-primary/25",
    RECOUNT: "bg-warning-soft text-warning-foreground border-warning/40",
    POSTED: "bg-success-soft text-success border-success/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${map[status]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabel(status)}
    </span>
  );
}

export function ProcessFlow({ status }: { status: DocStatus }) {
  const steps: { key: DocStatus; label: string }[] = [
    { key: "CREATED", label: "Created" },
    { key: "COUNTED", label: "Count entered" },
    { key: "POSTED", label: "Differences posted" },
  ];
  const order: Record<DocStatus, number> = { CREATED: 0, RECOUNT: 0, COUNTED: 1, POSTED: 2 };
  const current = order[status];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={s.key} className="flex min-w-0 items-center gap-1.5">
            <div
              className={`flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors ${
                done
                  ? "border-success/30 bg-success-soft text-success"
                  : active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="tabular-nums">{i + 1}</span>
              <span className="truncate">{s.label}</span>
            </div>
            {i < steps.length - 1 && <span className="h-px w-3 shrink-0 bg-border sm:w-5" />}
          </div>
        );
      })}
      {status === "RECOUNT" && (
        <span className="ml-1 rounded-sm border border-warning/40 bg-warning-soft px-2 py-1 text-[11px] font-semibold text-warning-foreground">
          Recount open
        </span>
      )}
    </div>
  );
}

function useAnimatedNumber(value: number) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) return;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 550);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(a + (b - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return display;
}

export function KpiTile({
  title,
  value,
  baseline,
  delta,
  status,
  unit,
  decimals = 1,
  goodDirection,
  hint,
}: {
  title: string;
  value: number;
  baseline: number;
  delta: number;
  status: "good" | "warning" | "critical";
  unit: string;
  decimals?: number;
  goodDirection: "up" | "down";
  hint: string;
}) {
  const animated = useAnimatedNumber(value);
  const tone = {
    good: "text-success",
    warning: "text-warning-foreground",
    critical: "text-destructive",
  }[status];
  const improving = goodDirection === "up" ? delta > 0 : delta < 0;
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="rounded-md border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</p>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase ${
            status === "good"
              ? "bg-success-soft text-success"
              : status === "warning"
                ? "bg-warning-soft text-warning-foreground"
                : "bg-critical-soft text-destructive"
          }`}
        >
          {status}
        </span>
      </div>
      <p key={Math.round(value * 100)} className={`animate-kpi mt-2 text-2xl font-semibold tabular-nums ${tone}`}>
        {unit === "€" ? "€ " : ""}
        {fmt(animated)}
        {unit !== "€" ? unit : ""}
      </p>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          Baseline {unit === "€" ? "€ " : ""}
          {fmt(baseline)}
          {unit !== "€" ? unit : ""}
        </span>
        <span
          className={`font-semibold tabular-nums ${
            Math.abs(delta) < 0.005 ? "text-muted-foreground" : improving ? "text-success" : "text-destructive"
          }`}
        >
          {delta > 0 ? "▲ +" : delta < 0 ? "▼ " : "▬ "}
          {fmt(Math.abs(delta) < 0.005 ? 0 : delta)}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground">{hint}</p>
    </div>
  );
}
