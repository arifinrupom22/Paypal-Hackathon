import Decimal from "decimal.js";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -12, toExpPos: 30 });

export type MoneyInput = string | number | Decimal | { toString(): string };

export function money(value: MoneyInput): Decimal {
  return new Decimal(value.toString());
}

export function formatMoney(value: MoneyInput, places = 2): string {
  return money(value).toFixed(places);
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function isSupportedCurrency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(money(value)), new Decimal(0));
}

export function formatCurrency(value: MoneyInput, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(money(value).toNumber());
}

export function formatCompact(value: MoneyInput, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(money(value).toNumber());
}

export function normalizeMerchant(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}
