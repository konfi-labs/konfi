import { B2BInquiry } from "./inquiry";

export interface CreateB2BInquiry extends Omit<B2BInquiry, "accepted"> {}
