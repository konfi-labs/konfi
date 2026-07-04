import { Recipient } from "../entities/recipient";
import { Sender } from "../entities/sender";
import { CourierServiceInterface } from "../entities/courier-service";
import { Pack } from "../entities/pack";
import { RequestBody } from "../types/interfaces";
import { AbstractMethod } from "./abstract-method";

export class OrderValuation extends AbstractMethod {
  private courier?: string;
  private returnValuations?: boolean;
  private shipmenttype?: string;
  private sender?: Sender;
  private recipient?: Recipient;
  private packs: Pack[] = [];
  private codType?: string;
  private returnCod?: string;
  private insurance?: number;
  private cod?: number;
  private courierService: CourierServiceInterface[] = [];

  getName(): string {
    return "order_valuation";
  }

  getRequestData(): RequestBody {
    const payload: RequestBody = {
      returnvaluations: this.returnValuations,
      shipmenttype: this.shipmenttype,
      postcode_sender: this.sender?.getPostcode() ?? "",
      postcode_recipient: this.recipient?.getPostcode() ?? "",
      recipient_country: this.recipient?.getCountry() ?? "",
      recipient_email: this.recipient?.getEmail() ?? "",
      packs: this.packs.map((pack) => pack.toArray()),
      COD: this.cod,
      codtype: this.codType,
      return_cod: this.returnCod,
      insurance: this.insurance,
      courierservice: this.getCourierServiceMap(),
    };

    if (this.courier) {
      payload.courier = this.courier;
    }

    return payload;
  }

  setCourier(courier: string): this {
    this.courier = courier;
    return this;
  }

  setReturnValuations(returnValuations: boolean): this {
    this.returnValuations = returnValuations;
    return this;
  }

  setShipmentType(shipmenttype: string): this {
    this.shipmenttype = shipmenttype;
    return this;
  }

  setSenderPostcode(postcode: string): this {
    if (!this.sender) {
      this.sender = new Sender();
    }
    this.sender.setPostcode(postcode);
    return this;
  }

  setRecipientPostcode(postcode: string): this {
    if (!this.recipient) {
      this.recipient = new Recipient();
    }
    this.recipient.setPostcode(postcode);
    return this;
  }

  setRecipientCountry(country: string): this {
    if (!this.recipient) {
      this.recipient = new Recipient();
    }
    this.recipient.setCountry(country);
    return this;
  }

  setRecipientEmail(email: string): this {
    if (!this.recipient) {
      this.recipient = new Recipient();
    }
    this.recipient.setEmail(email);
    return this;
  }

  setSender(sender: Sender): this {
    this.sender = sender;
    return this;
  }

  setRecipient(recipient: Recipient): this {
    this.recipient = recipient;
    return this;
  }

  addPack(pack: Pack): this {
    this.packs.push(pack);
    return this;
  }

  addCourierService(courierService: CourierServiceInterface): this {
    this.courierService.push(courierService);
    return this;
  }

  setInsurance(insurance: number): this {
    this.insurance = insurance;
    return this;
  }

  setCOD(cod: number): this {
    this.cod = cod;
    return this;
  }

  setCod(cod: number): this {
    return this.setCOD(cod);
  }

  setCodtype(codType: string): this {
    this.codType = codType;
    return this;
  }

  setReturnCod(returnCod: string): this {
    this.returnCod = returnCod;
    return this;
  }

  private getCourierServiceMap(): Record<string, unknown> {
    const serviceMap: Record<string, unknown> = {};

    for (const service of this.courierService) {
      const itemArray = service.toArray();
      const key = Object.keys(itemArray)[0];

      if (key) {
        serviceMap[key] = itemArray[key];
      }
    }

    return serviceMap;
  }
}
