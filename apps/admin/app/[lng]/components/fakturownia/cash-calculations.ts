import { roundTotal } from "@konfi/utils";

export type CashNumpadKey =
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "."
  | "backspace"
  | "clear";

const roundCurrency = (value: number): number => roundTotal(value);

export const normalizeDisplayTotal = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = roundCurrency(value);
  if (Object.is(rounded, -0) || Math.abs(rounded) < 0.0005) {
    return 0;
  }
  return rounded;
};

export const parseCashReceivedInput = (input: string): number => {
  if (!input) {
    return 0;
  }
  const normalized = Number(input.replace(/,/g, "."));
  return Number.isFinite(normalized) ? normalized : 0;
};

export const calculateCashBaseAmount = (
  paidAmount: number,
  totalsGross: number,
): number => {
  return paidAmount > 0 ? paidAmount : totalsGross;
};

export const calculateCashChangeDue = (
  cashReceivedValue: number,
  cashBaseAmount: number,
): number => {
  return normalizeDisplayTotal(cashReceivedValue - cashBaseAmount);
};

export const sanitizeCashReceivedInput = (value: string): string => {
  const sanitized = value.replace(/,/g, ".").replace(/[^\d.]/g, "");
  const [whole, ...decimals] = sanitized.split(".");
  if (decimals.length === 0) {
    return whole;
  }
  return `${whole}.${decimals.join("")}`;
};

export const handleNumpadKey = (current: string, key: CashNumpadKey): string => {
  const normalized = sanitizeCashReceivedInput(current);
  if (key === "clear") {
    return "";
  }
  if (key === "backspace") {
    return normalized.slice(0, -1);
  }
  if (key === ".") {
    if (normalized === "") {
      return "0.";
    }
    if (normalized.includes(".")) {
      return normalized;
    }
    return `${normalized}.`;
  }
  if (normalized === "0" && !normalized.includes(".")) {
    return key;
  }
  return `${normalized}${key}`;
};