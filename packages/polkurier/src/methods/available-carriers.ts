import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class AvailableCarriers extends AbstractMethod {
  private senderPostcode?: string;
  private recipientPostcode?: string;
  private recipientCountry?: string;
  private additionalData?: boolean;
  private returnCarrier?: string;

  getName(): string {
    return "available_carriers";
  }

  getRequestData(): RequestBody {
    const payload: RequestBody = {
      sender_postcode: this.senderPostcode,
      recipient_postcode: this.recipientPostcode,
      recipient_country: this.recipientCountry,
    };

    if (this.additionalData !== undefined) {
      payload.additional_data = this.additionalData;
    }

    if (this.returnCarrier) {
      payload.returncarrier = this.returnCarrier;
    }

    return payload;
  }

  setSenderPostcode(postcode: string): this {
    this.senderPostcode = postcode;
    return this;
  }

  setRecipientPostcode(postcode: string): this {
    this.recipientPostcode = postcode;
    return this;
  }

  setRecipientCountry(country: string): this {
    this.recipientCountry = country;
    return this;
  }

  setAdditionalData(value: boolean): this {
    this.additionalData = value;
    return this;
  }

  setReturnCarrier(value: string): this {
    const trimmed = value?.toString().trim();
    this.returnCarrier = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }
}
