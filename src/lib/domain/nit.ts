/**
 * NIT (Número de Identificación Tributaria) and its DIAN verification digit.
 * Algorithm: weights 3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71
 * applied from the rightmost digit; r = Σ mod 11; DV = r when r ∈ {0, 1}, else 11 − r.
 */
const WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Digits only (drops dots, spaces and dashes). */
export function nitDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function verificationDigit(nit: string): number {
  const digits = nitDigits(nit);
  if (digits.length === 0 || digits.length > WEIGHTS.length) throw new Error("NIT inválido");
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += Number(digits[digits.length - 1 - i]) * WEIGHTS[i]!;
  }
  const r = sum % 11;
  return r > 1 ? 11 - r : r;
}

export interface ParsedNit {
  /** Base number without the verification digit. */
  number: string;
  dv: string;
  /** DV typed by the user did not match the calculated one. */
  mismatch: boolean;
}

/**
 * Accepts "900123456-8", "900.123.456-8", "9001234568" (with `hasDv`) or a bare base number.
 * Returns null when there is nothing usable.
 */
export function parseNit(input: string): ParsedNit | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const dash = trimmed.match(/^([\d.\s]+)-\s*(\d)$/);
  const base = nitDigits(dash ? dash[1]! : trimmed);
  if (base.length < 5 || base.length > 15) return null;
  const dv = String(verificationDigit(base));
  return { number: base, dv, mismatch: dash ? dash[2] !== dv : false };
}

/** 900123456 + 8 → "900.123.456-8". */
export function formatNit(number: string, dv?: string | null): string {
  const digits = nitDigits(number);
  if (!digits) return "";
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dv ? `${grouped}-${dv}` : grouped;
}
