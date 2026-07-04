export interface XLSXParseResult {
  prices: { combination: string; [volume: string]: number | string }[];
  thresholds: { combination: string; [volume: string]: number | string }[];
  deliveryTimes: { combination: string; [volume: string]: number | string }[];
  active: { combination: string; [volume: string]: boolean | string }[];
}
