/**
 * Physical Inventory (SAP MM-IM) — single source of truth.
 *
 * Objects: Material master (MARA/MARD stock), Storage Bin, Physical Inventory
 * Document (header + items), Material Document (adjustment posting 701/702).
 * Status flow: Created -> Counted -> (Recount) -> Differences Posted
 */

import { useSyncExternalStore } from "react";

export type DocStatus = "CREATED" | "COUNTED" | "RECOUNT" | "POSTED";

export type Material = {
  matnr: string;
  description: string;
  uom: string;
  price: number; // moving average price (EUR / UoM)
  abc: "A" | "B" | "C";
  bookQty: number; // MARD unrestricted stock — updated by adjustment postings
  lastCountedDays: number;
  varianceHistory: number; // count of prior counts with variance (last 12 months)
};

export type PhysInvItem = {
  itemNo: number;
  matnr: string;
  bin: string;
  bookQtySnapshot: number; // book qty frozen when doc was created
  countQty: number | null; // null = not yet counted
  approved: boolean; // supervisor approval for out-of-tolerance variance
};

export type PhysInvDoc = {
  iblnr: string; // physical inventory document number
  plant: string;
  sloc: string;
  area: string;
  createdOn: string;
  counter: string;
  status: DocStatus;
  recountCycle: number;
  items: PhysInvItem[];
  postedOn?: string;
  mblnr?: string; // material document created on posting
};

export type MaterialDocLine = {
  mblnr: string;
  iblnr: string;
  matnr: string;
  bin: string;
  movementType: "701" | "702";
  qty: number;
  value: number;
  postedOn: string;
};

export type State = {
  materials: Record<string, Material>;
  docs: PhysInvDoc[];
  materialDocs: MaterialDocLine[];
  baseline: { ira: number; exposure: number; completion: number };
  log: { ts: string; text: string; kind: "success" | "error" }[];
};

/** Tolerance controls (plant customizing) */
export const TOLERANCE = { valueEur: 750, pct: 5 };

const MATERIALS: Material[] = [
  { matnr: "MAT-10021", description: "Hex Bolt M10x40 Zn", uom: "PC", price: 0.42, abc: "C", bookQty: 12400, lastCountedDays: 41, varianceHistory: 1 },
  { matnr: "MAT-10188", description: "Servo Drive 3kW", uom: "PC", price: 1180, abc: "A", bookQty: 46, lastCountedDays: 96, varianceHistory: 3 },
  { matnr: "MAT-10245", description: "Hydraulic Hose DN12 2m", uom: "PC", price: 34.5, abc: "B", bookQty: 310, lastCountedDays: 63, varianceHistory: 2 },
  { matnr: "MAT-10310", description: "Control Board CB-7", uom: "PC", price: 640, abc: "A", bookQty: 88, lastCountedDays: 121, varianceHistory: 4 },
  { matnr: "MAT-10402", description: "Lubricant HLP46 20L", uom: "CAN", price: 78, abc: "B", bookQty: 152, lastCountedDays: 22, varianceHistory: 0 },
  { matnr: "MAT-10455", description: "Bearing 6204-2RS", uom: "PC", price: 6.9, abc: "C", bookQty: 2050, lastCountedDays: 55, varianceHistory: 1 },
  { matnr: "MAT-10501", description: "Sensor Cable 5m M12", uom: "PC", price: 21.4, abc: "B", bookQty: 720, lastCountedDays: 30, varianceHistory: 1 },
  { matnr: "MAT-10620", description: "Gearbox GX-220", uom: "PC", price: 2350, abc: "A", bookQty: 19, lastCountedDays: 148, varianceHistory: 2 },
  { matnr: "MAT-10714", description: "Safety Relay SR-2", uom: "PC", price: 195, abc: "B", bookQty: 134, lastCountedDays: 18, varianceHistory: 0 },
  { matnr: "MAT-10880", description: "Filter Cartridge FC-9", uom: "PC", price: 44, abc: "C", bookQty: 480, lastCountedDays: 74, varianceHistory: 2 },
];

function doc(
  iblnr: string,
  area: string,
  status: DocStatus,
  counter: string,
  createdOn: string,
  items: [string, string, number, number | null][],
  recountCycle = 0,
): PhysInvDoc {
  return {
    iblnr,
    plant: "1710",
    sloc: "0001",
    area,
    createdOn,
    counter,
    status,
    recountCycle,
    items: items.map(([matnr, bin, book, count], i) => ({
      itemNo: (i + 1) * 10,
      matnr,
      bin,
      bookQtySnapshot: book,
      countQty: count,
      approved: false,
    })),
  };
}

function seed(): State {
  const materials: Record<string, Material> = {};
  MATERIALS.forEach((m) => (materials[m.matnr] = { ...m }));

  const docs: PhysInvDoc[] = [
    // High value variance — exceeds tolerance, needs approval or recount (edge case)
    doc("100000341", "AISLE-A / RACK 04", "COUNTED", "R. Keller", "2026-08-24", [
      ["MAT-10188", "A-04-01-A", 46, 41],
      ["MAT-10310", "A-04-02-B", 88, 86],
    ]),
    // Extreme variance, second recount cycle already — escalation case
    doc("100000338", "AISLE-C / RACK 11", "COUNTED", "M. Duarte", "2026-08-23", [
      ["MAT-10620", "C-11-03-A", 19, 12],
    ], 1),
    // Small variance within tolerance — clean post
    doc("100000344", "AISLE-B / RACK 07", "COUNTED", "R. Keller", "2026-08-25", [
      ["MAT-10501", "B-07-01-A", 720, 716],
      ["MAT-10402", "B-07-02-A", 152, 152],
    ]),
    // Not yet counted — high risk (A-class, 148 days)
    doc("100000347", "AISLE-A / RACK 02", "CREATED", "S. Novak", "2026-08-26", [
      ["MAT-10310", "A-02-05-C", 88, null],
      ["MAT-10455", "A-02-06-A", 2050, null],
    ]),
    // Not yet counted — low risk C-class bulk
    doc("100000349", "AISLE-D / RACK 01", "CREATED", "S. Novak", "2026-08-26", [
      ["MAT-10021", "D-01-01-A", 12400, null],
      ["MAT-10880", "D-01-02-A", 480, null],
    ]),
    // Partially counted — mandatory-field validation case
    doc("100000350", "AISLE-B / RACK 09", "CREATED", "M. Duarte", "2026-08-26", [
      ["MAT-10245", "B-09-01-A", 310, 298],
      ["MAT-10714", "B-09-02-A", 134, null],
    ]),
    // Already posted — history / duplicate-action guard
    {
      ...doc("100000330", "AISLE-C / RACK 02", "POSTED", "R. Keller", "2026-08-20", [
        ["MAT-10455", "C-02-01-A", 2050, 2050],
      ]),
      postedOn: "2026-08-21",
      mblnr: "4900001188",
    },
  ];

  const st: State = {
    materials,
    docs,
    materialDocs: [
      { mblnr: "4900001188", iblnr: "100000330", matnr: "MAT-10455", bin: "C-02-01-A", movementType: "701", qty: 0, value: 0, postedOn: "2026-08-21" },
    ],
    baseline: { ira: 0, exposure: 0, completion: 0 },
    log: [],
  };
  const k = computeKpis(st);
  st.baseline = { ira: k.ira.value, exposure: k.exposure.value, completion: k.completion.value };
  return st;
}

/* ------------------------------- derivations ------------------------------ */

export function itemVariance(state: State, doc: PhysInvDoc, it: PhysInvItem) {
  const mat = state.materials[it.matnr]!;
  const diffQty = it.countQty === null ? 0 : it.countQty - it.bookQtySnapshot;
  const diffValue = diffQty * mat.price;
  const pct = it.bookQtySnapshot === 0 ? (diffQty === 0 ? 0 : 100) : (Math.abs(diffQty) / it.bookQtySnapshot) * 100;
  const outOfTolerance =
    it.countQty !== null && (Math.abs(diffValue) > TOLERANCE.valueEur || pct > TOLERANCE.pct);
  return { mat, diffQty, diffValue, pct, outOfTolerance, counted: it.countQty !== null };
}

export function docVariance(state: State, d: PhysInvDoc) {
  let absValue = 0;
  let netValue = 0;
  let maxPct = 0;
  let out = false;
  let counted = 0;
  d.items.forEach((it) => {
    const v = itemVariance(state, d, it);
    if (v.counted) counted++;
    absValue += Math.abs(v.diffValue);
    netValue += v.diffValue;
    maxPct = Math.max(maxPct, v.counted ? v.pct : 0);
    if (v.outOfTolerance) out = true;
  });
  return {
    absValue,
    netValue,
    maxPct,
    outOfTolerance: out,
    countedItems: counted,
    fullyCounted: counted === d.items.length,
    approved: d.items.every((i) => i.approved || !itemVariance(state, d, i).outOfTolerance),
  };
}

export type Kpi = { value: number; baseline: number; delta: number; status: "good" | "warning" | "critical" };

function kpi(value: number, baseline: number, goodAbove: number, warnAbove: number, invert = false): Kpi {
  const s: Kpi["status"] = invert
    ? value <= goodAbove
      ? "good"
      : value <= warnAbove
        ? "warning"
        : "critical"
    : value >= goodAbove
      ? "good"
      : value >= warnAbove
        ? "warning"
        : "critical";
  return { value, baseline, delta: value - baseline, status: s };
}

export function computeKpis(state: State) {
  // 1) Inventory Record Accuracy: counted items whose variance is within tolerance
  let countedItems = 0;
  let accurate = 0;
  // 2) Value exposure: absolute variance value on open (unposted) documents
  let exposure = 0;
  // 3) Count completion: posted docs / all docs in the count cycle
  let posted = 0;

  state.docs.forEach((d) => {
    if (d.status === "POSTED") posted++;
    d.items.forEach((it) => {
      const v = itemVariance(state, d, it);
      if (!v.counted) return;
      countedItems++;
      if (!v.outOfTolerance) accurate++;
      if (d.status !== "POSTED") exposure += Math.abs(v.diffValue);
    });
  });

  const ira = countedItems === 0 ? 100 : (accurate / countedItems) * 100;
  const completion = state.docs.length === 0 ? 0 : (posted / state.docs.length) * 100;

  return {
    ira: kpi(ira, state.baseline.ira, 95, 85),
    exposure: kpi(exposure, state.baseline.exposure, 2000, 8000, true),
    completion: kpi(completion, state.baseline.completion, 80, 50),
    countedItems,
    openDocs: state.docs.filter((d) => d.status !== "POSTED").length,
  };
}

/* ---------------------------- AI recommendation --------------------------- */

export type Recommendation = {
  action: "POST" | "APPROVE_POST" | "RECOUNT" | "COUNT" | "ESCALATE" | "NONE";
  label: string;
  rationale: string;
  factors: { label: string; value: string }[];
  confidence: number;
  priority: number;
  severity: "high" | "medium" | "low";
};

/** Transparent rule-based scoring, grounded only in current document data. */
export function recommend(state: State, d: PhysInvDoc): Recommendation {
  const v = docVariance(state, d);
  const worst = d.items
    .map((it) => ({ it, v: itemVariance(state, d, it) }))
    .sort((a, b) => Math.abs(b.v.diffValue) - Math.abs(a.v.diffValue))[0]!;
  const mat = worst.v.mat;

  const ageScore = Math.min(100, (Math.max(...d.items.map((i) => state.materials[i.matnr]!.lastCountedDays)) / 180) * 100);
  const valueScore = Math.min(100, (v.absValue / 5000) * 100);
  const abcScore = Math.max(...d.items.map((i) => ({ A: 100, B: 60, C: 25 })[state.materials[i.matnr]!.abc]));
  const histScore = Math.min(100, Math.max(...d.items.map((i) => state.materials[i.matnr]!.varianceHistory)) * 25);
  const priority = Math.round(valueScore * 0.4 + abcScore * 0.25 + ageScore * 0.2 + histScore * 0.15);

  const factors = [
    { label: "Variance value", value: `€ ${v.absValue.toFixed(2)}` },
    { label: "Max variance %", value: `${v.maxPct.toFixed(1)} %` },
    { label: "ABC indicator", value: mat.abc },
    { label: "Days since last count", value: `${mat.lastCountedDays} d` },
    { label: "Prior variances (12M)", value: `${mat.varianceHistory}` },
    { label: "Recount cycle", value: `${d.recountCycle}` },
  ];

  // Business-rule filtering: only actions valid for the current status are proposed.
  if (d.status === "POSTED")
    return {
      action: "NONE",
      label: "No action required",
      rationale: `Differences already posted with material document ${d.mblnr}. Book stock is aligned with the counted quantity.`,
      factors,
      confidence: 99,
      priority: 0,
      severity: "low",
    };

  if (d.status === "CREATED" || d.status === "RECOUNT" || !v.fullyCounted)
    return {
      action: "COUNT",
      label: v.countedItems > 0 ? "Complete count entry" : "Execute count",
      rationale: `${d.items.length - v.countedItems} of ${d.items.length} item(s) still have no counted quantity. ${mat.abc}-class stock last counted ${mat.lastCountedDays} days ago drives the priority of this count area.`,
      factors,
      confidence: 88,
      priority,
      severity: priority > 65 ? "high" : priority > 35 ? "medium" : "low",
    };

  if (!v.outOfTolerance)
    return {
      action: "POST",
      label: "Post differences",
      rationale: `All item variances stay inside the plant tolerance (≤ €${TOLERANCE.valueEur} and ≤ ${TOLERANCE.pct}%). Posting now clears € ${v.absValue.toFixed(2)} of open exposure and improves record accuracy.`,
      factors,
      confidence: 94,
      priority,
      severity: "low",
    };

  if (d.recountCycle >= 1)
    return {
      action: "ESCALATE",
      label: "Approve variance, then post",
      rationale: `Recount cycle ${d.recountCycle} already confirmed the deviation on ${worst.it.matnr}, so a further recount is unlikely to change the result. Supervisor approval is required because € ${v.absValue.toFixed(2)} exceeds the €${TOLERANCE.valueEur} tolerance.`,
      factors,
      confidence: 82,
      priority: Math.max(priority, 80),
      severity: "high",
    };

  return {
    action: "RECOUNT",
    label: "Trigger recount",
    rationale: `Item ${worst.it.itemNo} (${worst.it.matnr}) deviates by ${worst.v.diffQty > 0 ? "+" : ""}${worst.v.diffQty} ${mat.uom} = € ${worst.v.diffValue.toFixed(2)} (${worst.v.pct.toFixed(1)}%), above the plant tolerance. A first recount is the SAP-standard control before a value-relevant adjustment posting.`,
    factors,
    confidence: 91,
    priority: Math.max(priority, 70),
    severity: "high",
  };
}

export function rankedQueue(state: State) {
  return state.docs
    .map((d) => ({ d, rec: recommend(state, d), v: docVariance(state, d) }))
    .sort((a, b) => b.rec.priority - a.rec.priority || a.d.iblnr.localeCompare(b.d.iblnr));
}

/* --------------------------------- store --------------------------------- */

let state: State = seed();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export const getState = () => state;

export function usePhysInv() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export type ActionResult = { ok: boolean; message: string };

function clone(s: State): State {
  return {
    ...s,
    materials: Object.fromEntries(Object.entries(s.materials).map(([k, v]) => [k, { ...v }])),
    docs: s.docs.map((d) => ({ ...d, items: d.items.map((i) => ({ ...i })) })),
    materialDocs: [...s.materialDocs],
    log: [...s.log],
  };
}

function commit(next: State, message: string, kind: "success" | "error" = "success") {
  next.log = [{ ts: new Date().toISOString(), text: message, kind }, ...next.log].slice(0, 20);
  state = next;
  emit();
}

const today = "2026-08-27";

/** Enter a counted quantity on one item (draft, no status change). */
export function enterCount(iblnr: string, itemNo: number, raw: string): ActionResult {
  const next = clone(state);
  const d = next.docs.find((x) => x.iblnr === iblnr);
  if (!d) return { ok: false, message: "Document not found." };
  if (d.status === "POSTED")
    return { ok: false, message: `Document ${iblnr}: differences already posted — count entry is blocked.` };
  const it = d.items.find((i) => i.itemNo === itemNo)!;
  if (raw.trim() === "") {
    it.countQty = null;
    it.approved = false;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0)
      return { ok: false, message: "Counted quantity must be a number ≥ 0." };
    it.countQty = n;
    it.approved = false;
  }
  state = next;
  emit();
  return { ok: true, message: "" };
}

/** VALIDATION 1 — mandatory count quantity on every item before the doc counts as counted. */
export function saveCount(iblnr: string): ActionResult {
  const next = clone(state);
  const d = next.docs.find((x) => x.iblnr === iblnr)!;
  if (d.status === "POSTED")
    return { ok: false, message: `Document ${iblnr} is already posted. No further count entry allowed.` };
  const missing = d.items.filter((i) => i.countQty === null);
  if (missing.length > 0)
    return {
      ok: false,
      message: `Count entry incomplete: item(s) ${missing.map((m) => m.itemNo).join(", ")} have no counted quantity. Nothing was saved.`,
    };
  d.status = "COUNTED";
  commit(next, `Count entered for physical inventory document ${iblnr} (${d.items.length} items).`);
  return { ok: true, message: `Count saved. Document ${iblnr} is now Counted.` };
}

/** VALIDATION 2 — tolerance control; VALIDATION 3 — valid status sequence / no duplicate posting. */
export function postDifferences(iblnr: string): ActionResult {
  const next = clone(state);
  const d = next.docs.find((x) => x.iblnr === iblnr)!;

  if (d.status === "POSTED")
    return { ok: false, message: `Duplicate action blocked: differences for ${iblnr} were already posted (${d.mblnr}).` };
  if (d.status !== "COUNTED")
    return {
      ok: false,
      message: `Invalid status transition: ${iblnr} is "${statusLabel(d.status)}". Differences can only be posted from status "Counted".`,
    };

  const v = docVariance(next, d);
  if (!v.fullyCounted)
    return { ok: false, message: `Document ${iblnr} has uncounted items. Posting rejected.` };

  const violating = d.items.filter((i) => itemVariance(next, d, i).outOfTolerance && !i.approved);
  if (violating.length > 0)
    return {
      ok: false,
      message: `Tolerance exceeded on item(s) ${violating.map((i) => i.itemNo).join(", ")} (limit € ${TOLERANCE.valueEur} / ${TOLERANCE.pct}%). Trigger a recount or obtain supervisor approval. Nothing was posted.`,
    };

  // Successful posting — all dependent records change together.
  const mblnr = String(4900001188 + next.materialDocs.length + 1);
  d.items.forEach((it) => {
    const iv = itemVariance(next, d, it);
    const mat = next.materials[it.matnr]!;
    mat.bookQty = it.countQty!;
    mat.lastCountedDays = 0;
    if (iv.diffQty !== 0) mat.varianceHistory += 1;
    next.materialDocs.unshift({
      mblnr,
      iblnr: d.iblnr,
      matnr: it.matnr,
      bin: it.bin,
      movementType: iv.diffQty >= 0 ? "701" : "702",
      qty: iv.diffQty,
      value: iv.diffValue,
      postedOn: today,
    });
  });
  d.status = "POSTED";
  d.postedOn = today;
  d.mblnr = mblnr;

  commit(
    next,
    `Differences posted for ${iblnr}. Material document ${mblnr} created, book stock corrected on ${d.items.length} material(s).`,
  );
  return { ok: true, message: `Differences posted. Material document ${mblnr} created.` };
}

/** Recount: resets counted quantities and increments the recount cycle. */
export function triggerRecount(iblnr: string): ActionResult {
  const next = clone(state);
  const d = next.docs.find((x) => x.iblnr === iblnr)!;
  if (d.status === "POSTED")
    return { ok: false, message: `Document ${iblnr} is posted. A recount is no longer possible.` };
  if (d.status !== "COUNTED")
    return { ok: false, message: `Recount can only be triggered for a counted document. ${iblnr} is "${statusLabel(d.status)}".` };
  d.items.forEach((i) => {
    i.countQty = null;
    i.approved = false;
  });
  d.status = "RECOUNT";
  d.recountCycle += 1;
  commit(next, `Recount cycle ${d.recountCycle} triggered for ${iblnr}. Counted quantities cleared.`);
  return { ok: true, message: `Recount cycle ${d.recountCycle} opened for ${iblnr}.` };
}

/** Supervisor approval unlocking an out-of-tolerance posting. */
export function approveVariance(iblnr: string): ActionResult {
  const next = clone(state);
  const d = next.docs.find((x) => x.iblnr === iblnr)!;
  if (d.status !== "COUNTED")
    return { ok: false, message: `Approval only possible for counted documents. ${iblnr} is "${statusLabel(d.status)}".` };
  const out = d.items.filter((i) => itemVariance(next, d, i).outOfTolerance);
  if (out.length === 0)
    return { ok: false, message: `No tolerance violation on ${iblnr} — approval not required.` };
  if (out.every((i) => i.approved))
    return { ok: false, message: `Variance on ${iblnr} is already approved.` };
  out.forEach((i) => (i.approved = true));
  commit(next, `Supervisor approval granted for out-of-tolerance items on ${iblnr}.`);
  return { ok: true, message: `Variance approved. Differences can now be posted.` };
}

export function statusLabel(s: DocStatus) {
  return { CREATED: "Created", COUNTED: "Counted", RECOUNT: "Recount", POSTED: "Differences Posted" }[s];
}
