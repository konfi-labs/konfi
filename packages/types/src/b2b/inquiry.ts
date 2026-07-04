import { Timestamp } from "firebase/firestore";
import { Address, Base } from "..";
import { NestedMember } from "../configuration/member";

export enum B2BInquiryStatus {
  NEW = "NEW",
  UNDER_REVIEW = "UNDER_REVIEW",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}

export interface B2BInquiry extends Omit<Base, "name" | "active"> {
  userId: string;
  businessDescription: string;
  billing: Address;
  accepted: boolean;
  status?: B2BInquiryStatus;
  customerId?: string;
  contactOwner?: NestedMember;
  notificationEmailLastError?: string | null;
  notificationEmailSentAt?: Omit<Timestamp, "toJSON">;
  acceptedAt?: Omit<Timestamp, "toJSON">;
  rejectedAt?: Omit<Timestamp, "toJSON">;
  acceptanceEmailSentAt?: Omit<Timestamp, "toJSON">;
  reviewedBy?: NestedMember;
  rejectionReason?: string;
}
