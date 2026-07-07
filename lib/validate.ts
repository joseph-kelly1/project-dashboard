export class ValidationError extends Error {}

type FormValue = FormDataEntryValue | null;

export function reqStr(v: FormValue, field: string, max = 300): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) throw new ValidationError(`${field} is required`);
  if (s.length > max) throw new ValidationError(`${field} is too long`);
  return s;
}

export function optStr(v: FormValue, field: string, max = 2000): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > max) throw new ValidationError(`${field} is too long`);
  return s;
}

export function oneOf<T extends string>(
  v: FormValue,
  allowed: readonly T[],
  field: string,
): T {
  const s = typeof v === "string" ? v : "";
  if (!(allowed as readonly string[]).includes(s))
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  return s as T;
}

// "12", "12.5", "12.50" → 1250. Positive, max two decimals, no float math.
export function centsFromDollars(v: FormValue, field: string): number {
  const s = typeof v === "string" ? v.trim().replace(/^\$/, "") : "";
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new ValidationError(`${field} must be a positive dollar amount like 12.50`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function optIsoDate(v: FormValue, field: string): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s)))
    throw new ValidationError(`${field} must be a valid date`);
  return s;
}

export function optUrl(v: FormValue, field: string): string {
  const s = optStr(v, field, 500);
  if (!s) return "";
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    return u.toString();
  } catch {
    throw new ValidationError(`${field} must be a valid URL`);
  }
}
