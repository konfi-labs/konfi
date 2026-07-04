import { Timestamp } from "firebase/firestore";
import { Price } from "../price";
import { NestedMember } from "../configuration/member";

export interface ProductPrice {
  id: string; // This will be the calculatedCombination
  productId: string;
  channelId: string;
  prices: Price[]; // Array of prices for different volumes
  isDefault?: boolean; // Mark the default/base price
}

export interface ProductPageCountPrice extends ProductPrice {
  pageCount: number;
  calculatedCombination: string;
}
