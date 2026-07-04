import { Base } from "../base";

/**
 * Fakturownia estimate invoice automation settings for a customer.
 *
 * Stored under:
 *   customers/{customerId}/fakturowniaAutomation/estimate
 */
export interface CustomerInvoiceAutomation extends Base {
  enabled: boolean;
  /** Fakturownia client ID that should be used as buyer on created estimates */
  fakturowniaClientId: string;
}

export interface CustomerInvoiceAutomationCreate {
  enabled: boolean;
  /** Fakturownia client ID that should be used as buyer on created estimates */
  fakturowniaClientId: string;
}

export interface CustomerInvoiceAutomationUpdate {
  enabled: boolean;
  /** Fakturownia client ID that should be used as buyer on created estimates */
  fakturowniaClientId: string;
}
