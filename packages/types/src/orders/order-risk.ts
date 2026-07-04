import { Timestamp } from "firebase/firestore";
import { Locale, PaymentStatus } from "../enums";
import type { PaymentMethodId } from "../configuration/payment-methods";
import type { ShippingMethodId } from "../configuration/shipping-methods";
import type { CurrencyCode } from "../enums";

export enum OrderRiskRecommendation {
  PROCEED = "PROCEED",
  REVIEW = "REVIEW",
  HOLD = "HOLD",
}

export enum OrderRiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum OrderRiskDimension {
  FRAUD = "FRAUD",
  OPERATIONAL = "OPERATIONAL",
}

export enum OrderRiskAnalysisStatus {
  PENDING = "PENDING",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
}

export enum OrderRiskSkipReason {
  EXISTING_CUSTOMER = "EXISTING_CUSTOMER",
}

export enum OrderRiskAnalysisSource {
  AUTO = "AUTO",
  MANUAL_RERUN = "MANUAL_RERUN",
}

export enum OrderRiskAnalysisDocumentKind {
  LATEST = "LATEST",
  HISTORY = "HISTORY",
}

export interface OrderRiskSignal {
  code: string;
  title: string;
  detail: string;
  dimension: OrderRiskDimension;
  weight: number;
}

export interface OrderRiskLocalizedText {
  summary: string;
  reasons: string[];
}

export interface OrderRiskSnapshot {
  orderId: string;
  channelId: string;
  number: number;
  totalPrice: number;
  currency: CurrencyCode;
  paymentType: PaymentMethodId;
  paymentStatus: PaymentStatus;
  shippingOption: ShippingMethodId | null;
  isTest: boolean;
  specialNotes: string;
  itemNames: string[];
  customerName: string;
  customerEmail?: string;
  customerCompanyName?: string;
  contactName: string;
  contactEmail?: string;
  contactPhone?: string;
  shippingName?: string;
  shippingCity?: string;
  shippingCountry?: string;
  billingName?: string;
  billingCity?: string;
  billingCountry?: string;
  externalSourceProvider?: string;
  externalBuyerLogin?: string;
  externalPaymentId?: string;
  pickupPointName?: string;
  hasNestedCustomer: boolean;
  isFromStore: boolean;
}

export interface OrderRiskDeterministicEvaluation {
  snapshot: OrderRiskSnapshot;
  fraudScoreHint: number;
  operationalScoreHint: number;
  signals: OrderRiskSignal[];
  safeSignals: string[];
}

export interface OrderRiskAnalysis {
  id: string;
  orderId: string;
  channelId: string;
  tenantId?: string;
  documentKind: OrderRiskAnalysisDocumentKind;
  source: OrderRiskAnalysisSource;
  status: OrderRiskAnalysisStatus;
  workflowRunId?: string;
  inputHash?: string;
  recommendation?: OrderRiskRecommendation;
  overallScore?: number;
  overallLevel?: OrderRiskLevel;
  fraudScore?: number;
  fraudLevel?: OrderRiskLevel;
  operationalScore?: number;
  operationalLevel?: OrderRiskLevel;
  summary?: string;
  reasons: string[];
  localizedContent?: Partial<Record<Locale, OrderRiskLocalizedText>>;
  signals: OrderRiskSignal[];
  safeSignals: string[];
  confidence?: number;
  model?: string;
  version: string;
  createdBy: string;
  error?: string;
  skipReason?: OrderRiskSkipReason;
  createdAt?: Omit<Timestamp, "toJSON">;
  updatedAt?: Omit<Timestamp, "toJSON">;
}
