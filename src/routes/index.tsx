import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KpiTile, ProcessFlow, StatusBadge } from "@/components/cockpit-parts";
import {
  TOLERANCE,
  approveVariance,
  computeKpis,
  docVariance,
  enterCount,
  itemVariance,
  postDifferences,
  rankedQueue,
  recommend,
  saveCount,
  statusLabel,
  triggerRecount,
  usePhysInv,
  type ActionResult,
  type PhysInvDoc,
} from "@/lib/phys-inv-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Physical Inventory Cockpit — Cycle Count Variance Control" },
      {
        name: "description",
        content:
          "SAP MM-IM decision cockpit for warehouse inventory accuracy: prioritized cycle-count queue, tolerance controls, AI-ranked recommendations and live accuracy KPIs.",
      },
      { property: "og:title", content: "Physical Inventory Cockpit — Cycle Count Variance Control" },
      {
        property: "og:description",
        content:
          "Resolve count variances end-to-end: count entry, tolerance validation, recount or approval, difference posting and live inventory-accuracy KPIs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cockpit,
});

const eur = (n: number) =>
  `${n < 0 ? "-" : ""}€ ${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Cockpit() {
  const state = usePhysInv();
  const queue = useMemo(() => rankedQueue(state), [state]);
  const kpis = useMemo(() => computeKpis(state), [state]);

  const [selected, setSelected] = useState<string>(queue[0]?.d.iblnr ?? "");
  const [filter, setFilter] = useState<"OPEN" | "ALL">("OPEN");
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const visible = queue.filter((q) => (filter === "ALL" ? true : q.d.status !== "POSTED"));
  const active = state.docs.find((d) => d.iblnr === selected) ?? visible[0]?.d ?? state.docs[0];

  const run = (r: ActionResult) => {
    if (r.message) setToast({ ok: r.ok, message: r.message });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-black/10 bg-shell text-shell-foreground">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-sm bg-primary text-[11px] font-bold text-primary-foreground">
              IM
            </div>
            <div>
              <h1 className="text-sm leading-tight font-semibold">Physical Inventory Cockpit</h1>
              <p className="text-[11px] leading-tight text-shell-foreground/70">
                MM-IM · Cycle Count Variance Control
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-shell-foreground/80">
            <span>Plant 1710 · SLoc 0001</span>
            <span className="hidden sm:inline">Fiscal Year 2026</span>
            <span className="rounded-sm bg-white/10 px-2 py-1 font-medium">S. Novak · Inventory Controller</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-3 sm:px-4">
        <section className="grid gap-3 sm:grid-cols-3">
          <KpiTile
            title="Inventory Record Accuracy"
            value={kpis.ira.value}
            baseline={kpis.ira.baseline}
            delta={kpis.ira.delta}
            status={kpis.ira.status}
            unit=" %"
            goodDirection="up"
            hint={`${kpis.countedItems} counted items · within tolerance €${TOLERANCE.valueEur} / ${TOLERANCE.pct}%`}
          />
          <KpiTile
            title="Open Variance Exposure"
            value={kpis.exposure.value}
            baseline={kpis.exposure.baseline}
            delta={kpis.exposure.delta}
            status={kpis.exposure.status}
            unit="€"
            decimals={2}
            goodDirection="down"
            hint={`Unposted difference value across ${kpis.openDocs} open documents`}
          />
          <KpiTile
            title="Count Cycle Completion"
            value={kpis.completion.value}
            baseline={kpis.completion.baseline}
            delta={kpis.completion.delta}
            status={kpis.completion.status}
            unit=" %"
            goodDirection="up"
            hint={`${state.docs.filter((d) => d.status === "POSTED").length} of ${state.docs.length} documents fully posted`}
          />
        </section>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(340px,420px)_1fr]">
          <WorkQueue
            items={visible}
            selected={active?.iblnr ?? ""}
            onSelect={setSelected}
            filter={filter}
            setFilter={setFilter}
            total={queue.length}
          />
          {active ? <DetailPanel doc={active} run={run} /> : <EmptyDetail />}
        </div>
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-4">
          <div
            role="status"
            className={`pointer-events-auto max-w-2xl rounded-md border px-4 py-3 text-[13px] shadow-lg ${
              toast.ok
                ? "border-success/40 bg-success-soft text-success"
                : "border-destructive/40 bg-critical-soft text-destructive"
            }`}
          >
            <span className="font-semibold">{toast.ok ? "Success · " : "Error · "}</span>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="grid place-items-center rounded-md border border-border bg-card p-10 text-sm text-muted-foreground">
      No physical inventory document selected.
    </div>
  );
}

function WorkQueue({
  items,
  selected,
  onSelect,
  filter,
  setFilter,
  total,
}: {
  items: ReturnType<typeof rankedQueue>;
  selected: string;
  onSelect: (id: string) => void;
  filter: "OPEN" | "ALL";
  setFilter: (f: "OPEN" | "ALL") => void;
  total: number;
}) {
  return (
    <section className="flex flex-col rounded-md border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div>
          <h2 className="text-sm font-semibold">Count Variance Worklist</h2>
          <p className="text-[11px] text-muted-foreground">Ranked by AI priority score</p>
        </div>
        <div className="flex rounded-sm border border-border p-0.5">
          {(["OPEN", "ALL"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[3px] px-2 py-1 text-[11px] font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
              }`}
            >
              {f === "OPEN" ? "Open" : `All (${total})`}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="p-8 text-center text-[13px] text-muted-foreground">
          No open physical inventory documents. The count cycle is complete.
        </div>
      ) : (
        <ul className="max-h-[62vh] divide-y divide-border overflow-auto lg:max-h-[calc(100vh-260px)]">
          {items.map(({ d, rec, v }) => {
            const isSel = d.iblnr === selected;
            return (
              <li key={d.iblnr}>
                <button
                  onClick={() => onSelect(d.iblnr)}
                  className={`w-full px-3 py-2.5 text-left transition-colors ${
                    isSel ? "bg-info-soft" : "hover:bg-secondary"
                  } ${isSel ? "border-l-[3px] border-primary" : "border-l-[3px] border-transparent"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[13px] font-semibold">{d.iblnr}</span>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {d.area} · {d.items.length} items · {d.counter}
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        v.outOfTolerance ? "text-destructive" : v.absValue > 0 ? "text-warning-foreground" : "text-success"
                      }`}
                    >
                      {eur(v.netValue)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span
                      className={`rounded-sm px-1.5 py-0.5 text-[10px] font-bold ${
                        rec.severity === "high"
                          ? "bg-critical-soft text-destructive"
                          : rec.severity === "medium"
                            ? "bg-warning-soft text-warning-foreground"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      P {rec.priority}
                    </span>
                    <span className="truncate text-[11px] text-foreground/80">AI: {rec.label}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function DetailPanel({ doc, run }: { doc: PhysInvDoc; run: (r: ActionResult) => void }) {
  const state = usePhysInv();
  const v = docVariance(state, doc);
  const rec = recommend(state, doc);
  const posted = doc.status === "POSTED";
  const mDocs = state.materialDocs.filter((m) => m.iblnr === doc.iblnr);

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-md border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-3 py-2.5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base font-semibold">{doc.iblnr}</h2>
              <StatusBadge status={doc.status} />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Plant {doc.plant} · SLoc {doc.sloc} · {doc.area} · created {doc.createdOn} · counter {doc.counter}
              {doc.recountCycle > 0 && ` · recount cycle ${doc.recountCycle}`}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted-foreground">Net difference value</p>
            <p
              className={`text-lg font-semibold tabular-nums ${
                v.outOfTolerance ? "text-destructive" : v.absValue > 0 ? "text-warning-foreground" : "text-success"
              }`}
            >
              {eur(v.netValue)}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto px-3 py-2.5">
          <ProcessFlow status={doc.status} />
        </div>
      </div>

      <AiCard doc={doc} run={run} />

      <div className="rounded-md border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <h3 className="text-sm font-semibold">Document Items</h3>
          <span className="text-[11px] text-muted-foreground">
            Tolerance: € {TOLERANCE.valueEur} / {TOLERANCE.pct}% per item
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border bg-secondary/60 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <th className="px-3 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold">Material / Bin</th>
                <th className="px-3 py-2 text-right font-semibold">Book qty</th>
                <th className="px-3 py-2 text-right font-semibold">Count qty</th>
                <th className="px-3 py-2 text-right font-semibold">Diff qty</th>
                <th className="px-3 py-2 text-right font-semibold">Diff value</th>
                <th className="px-3 py-2 font-semibold">Check</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((it) => {
                const iv = itemVariance(state, doc, it);
                return (
                  <tr key={it.itemNo} className="border-b border-border/70 last:border-0 align-middle">
                    <td className="px-3 py-2 font-mono text-muted-foreground">{it.itemNo}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{iv.mat.description}</div>
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{it.matnr}</span> · bin {it.bin} · {iv.mat.abc}-class ·{" "}
                        {eur(iv.mat.price)}/{iv.mat.uom}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {it.bookQtySnapshot.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {posted ? (
                        <span className="tabular-nums">{it.countQty?.toLocaleString("en-US")}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={it.countQty ?? ""}
                          placeholder="—"
                          aria-label={`Counted quantity item ${it.itemNo}`}
                          onChange={(e) => {
                            const r = enterCount(doc.iblnr, it.itemNo, e.target.value);
                            if (!r.ok) run(r);
                          }}
                          className="w-24 rounded-sm border border-input bg-background px-2 py-1 text-right tabular-nums outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                        />
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        !iv.counted ? "text-muted-foreground" : iv.diffQty === 0 ? "" : "font-semibold"
                      }`}
                    >
                      {iv.counted ? `${iv.diffQty > 0 ? "+" : ""}${iv.diffQty}` : "—"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        iv.outOfTolerance ? "font-semibold text-destructive" : ""
                      }`}
                    >
                      {iv.counted ? eur(iv.diffValue) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {!iv.counted ? (
                        <span className="text-[11px] text-muted-foreground">Not counted</span>
                      ) : iv.outOfTolerance ? (
                        <span className="rounded-sm bg-critical-soft px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                          {it.approved ? "Out of tolerance · approved" : `Out of tolerance (${iv.pct.toFixed(1)}%)`}
                        </span>
                      ) : (
                        <span className="rounded-sm bg-success-soft px-1.5 py-0.5 text-[11px] font-semibold text-success">
                          Within tolerance
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-secondary/40 px-3 py-2.5">
          <ActionButton
            variant="secondary"
            disabled={posted}
            title={posted ? "Document already posted" : "Save counted quantities"}
            onClick={() => run(saveCount(doc.iblnr))}
          >
            Save count
          </ActionButton>
          <ActionButton
            variant="secondary"
            disabled={doc.status !== "COUNTED"}
            title="Clear counted quantities and open a new recount cycle"
            onClick={() => run(triggerRecount(doc.iblnr))}
          >
            Trigger recount
          </ActionButton>
          <ActionButton
            variant="warning"
            disabled={doc.status !== "COUNTED" || !v.outOfTolerance || v.approved}
            title="Supervisor approval for out-of-tolerance variance"
            onClick={() => run(approveVariance(doc.iblnr))}
          >
            Approve variance
          </ActionButton>
          <ActionButton
            variant="primary"
            disabled={posted}
            title="Post differences and correct book stock"
            onClick={() => run(postDifferences(doc.iblnr))}
          >
            Post differences
          </ActionButton>
          {posted && (
            <span className="ml-auto text-[11px] text-muted-foreground">
              Posted {doc.postedOn} · material document <span className="font-mono">{doc.mblnr}</span>
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-md border border-border bg-card shadow-sm">
          <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">
            Material Documents (adjustment postings)
          </h3>
          {mDocs.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              No adjustment posting exists for this physical inventory document yet.
            </p>
          ) : (
            <ul className="divide-y divide-border text-[12px]">
              {mDocs.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="font-mono">{m.mblnr}</span>
                  <span className="text-muted-foreground">
                    MvT {m.movementType} · {m.matnr} · {m.bin}
                  </span>
                  <span className="tabular-nums">
                    {m.qty > 0 ? "+" : ""}
                    {m.qty} · {eur(m.value)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-border bg-card shadow-sm">
          <h3 className="border-b border-border px-3 py-2 text-sm font-semibold">Process Log</h3>
          {state.log.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">No postings in this session yet.</p>
          ) : (
            <ul className="max-h-56 divide-y divide-border overflow-auto text-[12px]">
              {state.log.map((l, i) => (
                <li key={i} className="flex gap-2 px-3 py-2">
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {new Date(l.ts).toLocaleTimeString("en-GB")}
                  </span>
                  <span>{l.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function AiCard({ doc, run }: { doc: PhysInvDoc; run: (r: ActionResult) => void }) {
  const state = usePhysInv();
  const rec = recommend(state, doc);

  const act = () => {
    if (rec.action === "POST") return run(postDifferences(doc.iblnr));
    if (rec.action === "RECOUNT") return run(triggerRecount(doc.iblnr));
    if (rec.action === "ESCALATE" || rec.action === "APPROVE_POST") {
      const r = approveVariance(doc.iblnr);
      if (!r.ok) return run(r);
      return run(postDifferences(doc.iblnr));
    }
    return undefined;
  };

  const actionable = rec.action !== "NONE" && rec.action !== "COUNT";

  return (
    <div
      key={`${doc.iblnr}-${rec.action}-${rec.priority}`}
      className="animate-kpi rounded-md border border-primary/30 bg-info-soft/70 p-3 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-primary-foreground uppercase">
            AI Advisor
          </span>
          <h3 className="text-sm font-semibold">{rec.label}</h3>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="rounded-full bg-card px-2 py-0.5 font-semibold">Confidence {rec.confidence}%</span>
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              rec.severity === "high"
                ? "bg-critical-soft text-destructive"
                : rec.severity === "medium"
                  ? "bg-warning-soft text-warning-foreground"
                  : "bg-success-soft text-success"
            }`}
          >
            Priority {rec.priority}
          </span>
        </div>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">{rec.rationale}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {rec.factors.map((f) => (
          <span key={f.label} className="rounded-sm border border-border bg-card px-1.5 py-0.5 text-[11px]">
            <span className="text-muted-foreground">{f.label}:</span>{" "}
            <span className="font-semibold tabular-nums">{f.value}</span>
          </span>
        ))}
      </div>

      {actionable && (
        <div className="mt-3">
          <ActionButton variant="primary" onClick={act} title="Execute the recommended action">
            Execute recommendation
          </ActionButton>
        </div>
      )}
      {rec.action === "COUNT" && (
        <p className="mt-3 text-[12px] font-medium text-muted-foreground">
          Enter the counted quantities in the item table below, then choose “Save count”.
        </p>
      )}
      {rec.action === "NONE" && (
        <p className="mt-3 text-[12px] font-medium text-success">
          Document closed — book stock equals counted stock. Status: {statusLabel(doc.status)}.
        </p>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary" | "warning";
  title?: string;
}) {
  const styles = {
    primary: "bg-primary text-primary-foreground hover:brightness-110",
    secondary: "border border-input bg-card text-foreground hover:bg-secondary",
    warning: "border border-warning/50 bg-warning-soft text-warning-foreground hover:brightness-97",
  }[variant];
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-sm px-3 py-1.5 text-[13px] font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}
