import { Timestamp } from "firebase/firestore";
import type { TenantOwned } from "../tenant";

export interface Rating extends TenantOwned {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment?: string;
  createdAt?: Omit<Timestamp, "toJSON">;
  isRated: boolean;
  classification?: Classification;
  active: boolean;
}

export type Classification = {
  label: "Positive" | "Neutral" | "Negative";
  confidence: number;
};
