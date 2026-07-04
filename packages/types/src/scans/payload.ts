export type ScanStage = "AUTO" | "PICKUP" | "DELIVERY";

export type ScanPayload = {
  v: number;
  t: string;
  cid?: string;
  oid?: string;
  n?: string;
  stage?: ScanStage;
  sig?: string;
};

export function isScanPayload(x: unknown): x is ScanPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.v === "number" && typeof o.t === "string";
}
