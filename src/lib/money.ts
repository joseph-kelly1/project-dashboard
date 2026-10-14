import type {
  Category,
  Cycle,
  Project,
  Service,
  SharedSubscription,
  TimeWindow,
} from "./types";

export const TZ = "America/New_York"; // all calendar boundaries per spec
export const DAYS_PER_MONTH = 30; // spec: daily cost = monthly ÷ 30, documented choice

export function monthlyCents(amountCents: number, cycle: Cycle): number {
  return cycle === "monthly" ? amountCents : Math.round(amountCents / 12);
}

export function nyParts(now = new Date()): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

// ponytail: offset-guess tz conversion; off only during the DST switch hour,
// which never matters for day-granular dashboard windows.
export function nyMidnightUtc(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  const asNy = new Date(
    new Date(guess).toLocaleString("en-US", { timeZone: TZ }),
  );
  const asUtc = new Date(
    new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }),
  );
  return new Date(guess + (asUtc.getTime() - asNy.getTime()));
}

export function todayNY(now = new Date()): string {
  const { y, m, d } = nyParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Revenue window start (inclusive); null = all-time, no bound.
export function windowStart(win: TimeWindow, now = new Date()): Date | null {
  const { y, m, d } = nyParts(now);
  switch (win) {
    case "daily":
      return nyMidnightUtc(y, m, d);
    case "monthly":
      return nyMidnightUtc(y, m, 1);
    case "yearly":
    case "ytd": // same range for a calendar year; both keys implemented per spec
      return nyMidnightUtc(y, 1, 1);
    case "all-time":
      return null;
  }
}

// Cost is a projection of a monthly rate, not history.
export function projectMonthlyCost(
  monthly: number,
  win: TimeWindow,
  now = new Date(),
): number {
  switch (win) {
    case "daily":
      return Math.round(monthly / DAYS_PER_MONTH);
    case "monthly":
      return monthly;
    case "yearly":
    case "all-time": // all-time cost shown annualized (labeled in the UI)
      return monthly * 12;
    case "ytd":
      return monthly * nyParts(now).m; // months elapsed incl. current
  }
}

// Months this cost has been billed so far this calendar year. The anchor is
// the item's renewalDate (first-payment date): started in a past year → all
// elapsed months; started this year → from its start month (inclusive);
// starts later this year → 0. No anchor → assume billed all year.
export function ytdMonths(
  anchor: string | null | undefined,
  now = new Date(),
): number {
  const { y, m } = nyParts(now);
  if (!anchor) return m;
  const [ay, am] = anchor.split("-").map(Number);
  if (ay < y) return m;
  if (ay > y) return 0;
  return Math.max(0, m - am + 1);
}

// Months this cost has been billed in total, from its anchor month through
// the current month (inclusive), across years. No anchor → unknown start,
// fall back to 12 (annualized, labeled in the UI). Future anchor → 0.
export function allTimeMonths(
  anchor: string | null | undefined,
  now = new Date(),
): number {
  if (!anchor) return 12;
  const { y, m } = nyParts(now);
  const [ay, am] = anchor.split("-").map(Number);
  return Math.max(0, (y - ay) * 12 + (m - am) + 1);
}

export interface SubSplit {
  sub: SharedSubscription;
  monthly: number;
  slices: { projectId: string; cents: number }[]; // empty when paused/cancelled or no opt-ins
}

export interface CostReport {
  perProjectMonthly: Map<string, number>;
  categoryMonthly: Map<Category, number>;
  perProjectCategoryMonthly: Map<string, Map<Category, number>>;
  // ytd and all-time are aggregated per item (monthly × that item's months
  // billed), because billing start varies per cost — a flat factor would
  // overstate them.
  perProjectYtd: Map<string, number>;
  categoryYtd: Map<Category, number>;
  perProjectAllTime: Map<string, number>;
  categoryAllTime: Map<Category, number>;
  subSplits: SubSplit[];
  totalMonthly: number; // = sum of per-project slices, which sum to the bills by construction
}

// Single computation path: per-project figures are built once, and the total
// is their sum — so per-project slices and the global total can never drift.
// Splits distribute integer cents exactly (floor + remainder to first N
// projects by id), so slices always sum to each subscription's real bill.
export function computeCosts(
  projects: Project[],
  servicesByProject: Map<string, Service[]>,
  subs: SharedSubscription[],
  now = new Date(),
): CostReport {
  const subById = new Map(subs.map((s) => [s.id, s]));

  // subId -> projectId -> category of that project's first active service on the sub
  // ponytail: a project's slice is categorized by its first active service
  // referencing the sub; per-service category weighting if that ever matters.
  const optIns = new Map<string, Map<string, Category>>();
  for (const p of projects) {
    for (const svc of servicesByProject.get(p.id) ?? []) {
      if (svc.status !== "active" || svc.cost.type !== "shared") continue;
      const sub = subById.get(svc.cost.subscriptionId);
      if (!sub || sub.status !== "active") continue;
      let m = optIns.get(sub.id);
      if (!m) optIns.set(sub.id, (m = new Map()));
      if (!m.has(p.id)) m.set(p.id, svc.category);
    }
  }

  const perProjectMonthly = new Map<string, number>();
  const perProjectYtd = new Map<string, number>();
  const perProjectAllTime = new Map<string, number>();
  const perProjectCategoryMonthly = new Map<string, Map<Category, number>>();
  const categoryYtd = new Map<Category, number>();
  const categoryAllTime = new Map<Category, number>();
  for (const p of projects) {
    perProjectMonthly.set(p.id, 0);
    perProjectYtd.set(p.id, 0);
    perProjectAllTime.set(p.id, 0);
    perProjectCategoryMonthly.set(p.id, new Map());
  }
  const add = (
    projectId: string,
    category: Category,
    cents: number,
    anchor: string | null,
  ) => {
    const ytd = cents * ytdMonths(anchor, now);
    const allTime = cents * allTimeMonths(anchor, now);
    perProjectMonthly.set(projectId, (perProjectMonthly.get(projectId) ?? 0) + cents);
    perProjectYtd.set(projectId, (perProjectYtd.get(projectId) ?? 0) + ytd);
    perProjectAllTime.set(projectId, (perProjectAllTime.get(projectId) ?? 0) + allTime);
    const catMap = perProjectCategoryMonthly.get(projectId)!;
    catMap.set(category, (catMap.get(category) ?? 0) + cents);
    categoryYtd.set(category, (categoryYtd.get(category) ?? 0) + ytd);
    categoryAllTime.set(category, (categoryAllTime.get(category) ?? 0) + allTime);
  };

  for (const p of projects) {
    for (const svc of servicesByProject.get(p.id) ?? []) {
      if (svc.status !== "active" || svc.cost.type !== "specific") continue;
      add(
        p.id,
        svc.category,
        monthlyCents(svc.cost.amountCents, svc.cost.cycle),
        svc.renewalDate,
      );
    }
  }

  const subSplits: SubSplit[] = [];
  for (const sub of subs) {
    const monthly = monthlyCents(sub.amountCents, sub.cycle);
    const slices: SubSplit["slices"] = [];
    const m = sub.status === "active" ? optIns.get(sub.id) : undefined;
    if (m && m.size > 0) {
      const pids = [...m.keys()].sort();
      const base = Math.floor(monthly / pids.length);
      let rem = monthly - base * pids.length;
      // The sub's own anchor drives ytd/all-time for every slice — the bill
      // is what started, not the opt-ins — so slices × months sum to the bill.
      for (const pid of pids) {
        const cents = base + (rem-- > 0 ? 1 : 0);
        slices.push({ projectId: pid, cents });
        add(pid, m.get(pid)!, cents, sub.renewalDate);
      }
    }
    subSplits.push({ sub, monthly, slices });
  }

  const categoryMonthly = new Map<Category, number>();
  for (const catMap of perProjectCategoryMonthly.values()) {
    for (const [cat, cents] of catMap) {
      categoryMonthly.set(cat, (categoryMonthly.get(cat) ?? 0) + cents);
    }
  }

  let totalMonthly = 0;
  for (const cents of perProjectMonthly.values()) totalMonthly += cents;

  return {
    perProjectMonthly,
    categoryMonthly,
    perProjectCategoryMonthly,
    perProjectYtd,
    categoryYtd,
    perProjectAllTime,
    categoryAllTime,
    subSplits,
    totalMonthly,
  };
}

// Window projections for costs: ytd and all-time come from the per-item
// aggregations in the report; daily/monthly/yearly are uniform factors.
export function projectCostForWindow(
  report: CostReport,
  projectId: string,
  win: TimeWindow,
  now = new Date(),
): number {
  if (win === "ytd") return report.perProjectYtd.get(projectId) ?? 0;
  if (win === "all-time") return report.perProjectAllTime.get(projectId) ?? 0;
  return projectMonthlyCost(report.perProjectMonthly.get(projectId) ?? 0, win, now);
}

export function categoryCostForWindow(
  report: CostReport,
  category: Category,
  win: TimeWindow,
  now = new Date(),
): number {
  if (win === "ytd") return report.categoryYtd.get(category) ?? 0;
  if (win === "all-time") return report.categoryAllTime.get(category) ?? 0;
  return projectMonthlyCost(report.categoryMonthly.get(category) ?? 0, win, now);
}

export function parseWindow(v: string | undefined): TimeWindow {
  return (["daily", "monthly", "yearly", "ytd", "all-time"] as const).includes(
    v as TimeWindow,
  )
    ? (v as TimeWindow)
    : "monthly";
}

// Cost is a projection, revenue is a fact — surfaced as small card notes.
export function costNote(win: TimeWindow): string {
  switch (win) {
    case "daily":
      return `projected rate (monthly ÷ ${DAYS_PER_MONTH})`;
    case "all-time":
      return "each cost since its billing start (annualized when no date set)";
    case "ytd":
      return "projected per cost from its billing start this year";
    default:
      return "projected from recurring rates";
  }
}

export function revenueNote(win: TimeWindow): string {
  return win === "all-time"
    ? "actual Stripe payments, all time"
    : "actual Stripe payments in this window";
}

export function fmtUSD(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC", // yyyy-mm-dd strings are calendar dates, not instants
  month: "short",
  day: "numeric",
  year: "numeric",
});
export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

// renewalDate is an ANCHOR (first/any known renewal), not a one-shot: the
// next occurrence is rolled forward by the billing cycle automatically.
// Day-of-month is kept and clamped to short months (Jan 31 → Feb 28 → Mar 31).
export function nextRenewal(
  anchor: string,
  cycle: Cycle,
  now = new Date(),
): string {
  const { y, m, d } = nyParts(now);
  const today = Date.UTC(y, m - 1, d);
  const [ay, am, ad] = anchor.split("-").map(Number);
  const clamped = (yy: number, mm: number) => {
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return Date.UTC(yy, mm - 1, Math.min(ad, lastDay));
  };
  let yy = ay;
  let mm = am;
  let t = clamped(yy, mm);
  while (t < today) {
    if (cycle === "monthly") {
      mm++;
      if (mm > 12) {
        mm = 1;
        yy++;
      }
    } else {
      yy++;
    }
    t = clamped(yy, mm);
  }
  return new Date(t).toISOString().slice(0, 10);
}

// Next occurrence within the next 30 days, NY calendar. Note: an active
// monthly item is always renewing within 30 days by definition.
export function isRenewingSoon(
  anchor: string | null,
  cycle: Cycle,
  now = new Date(),
): boolean {
  if (!anchor) return false;
  const { y, m, d } = nyParts(now);
  const limit = new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10);
  return nextRenewal(anchor, cycle, now) <= limit;
}
