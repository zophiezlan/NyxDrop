/**
 * Australian-locale formatting helpers. Locale-aware versions land in Phase 6
 * once the i18n layer is in place; for now en-AU is fine for all six target
 * languages we plan to ship.
 */

const RELATIVE_TIME_FMT = new Intl.RelativeTimeFormat("en-AU", { numeric: "auto" });

export function relativeTime(input: Date | string | number): string {
  const date = input instanceof Date ? input : new Date(input);
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);

  if (abs < 60) return RELATIVE_TIME_FMT.format(diffSec, "second");
  if (abs < 3600) return RELATIVE_TIME_FMT.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return RELATIVE_TIME_FMT.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86_400 * 30) return RELATIVE_TIME_FMT.format(Math.round(diffSec / 86_400), "day");
  if (abs < 86_400 * 365)
    return RELATIVE_TIME_FMT.format(Math.round(diffSec / (86_400 * 30)), "month");
  return RELATIVE_TIME_FMT.format(Math.round(diffSec / (86_400 * 365)), "year");
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

const CURRENCY_FMT = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
});

export function formatAud(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined) return "";
  const n = typeof amount === "number" ? amount : Number.parseFloat(amount);
  if (!Number.isFinite(n)) return "";
  return CURRENCY_FMT.format(n);
}

export function formatLocalYmd(date: Date = new Date()): string {
  // Local Y-M-D, used to compute `visitDate` from the user's clock.
  // See decisions.md D-003.
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
