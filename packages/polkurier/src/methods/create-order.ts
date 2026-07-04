import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";
import { Sender } from "../entities/sender";
import { Recipient } from "../entities/recipient";
import { Pack } from "../entities/pack";
import { Pickup } from "../entities/pickup";
import { COD } from "../entities/cod";
import { CourierServiceInterface } from "../entities/courier-service";
import { CoverAddress } from "../entities/cover-address";
import { ShipmentType } from "../types/enums";

export class CreateOrder extends AbstractMethod {
  private shipmentType?: ShipmentType;
  private courier?: string;
  private courierService: CourierServiceInterface[] = [];
  private description?: string;
  private sender: Sender;
  private recipient: Recipient;
  private coverAddress?: CoverAddress;
  private packs: Pack[] = [];
  private pickup: Pickup;
  private cod: COD;
  private insurance?: number;
  private additionalFields: Record<string, string> = {};

  constructor() {
    super();
    this.sender = new Sender();
    this.recipient = new Recipient();
    this.pickup = new Pickup();
    this.cod = new COD();
  }

  getName(): string {
    return "create_order";
  }

  getRequestData(): RequestBody {
    return {
      shipmenttype: this.shipmentType,
      courier: this.courier,
      courierservice: this.getCourierServiceMap(),
      description: this.description,
      sender: this.sender.toArray(),
      recipient: this.recipient.toArray(),
      cover_address: this.coverAddress?.toArray(),
      packs: this.packs.map((pack) => pack.toArray()),
      pickup: this.pickup.toArray(),
      COD: this.cod.hasValue() ? this.cod.toArray() : undefined,
      insurance: this.insurance,
      additional_fields:
        Object.keys(this.additionalFields).length > 0
          ? this.additionalFields
          : undefined,
    };
  }

  setShipmentType(shipmentType: ShipmentType): this {
    this.shipmentType = shipmentType;
    return this;
  }

  setCourier(courier: string): this {
    this.courier = courier;
    return this;
  }

  setDescription(description: string): this {
    this.description = description;
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

  setCoverAddress(coverAddress: CoverAddress): this {
    this.coverAddress = coverAddress;
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

  setPickup(pickup: Pickup): this {
    this.pickup = pickup;
    return this;
  }

  setCod(cod: COD): this {
    this.cod = cod;
    return this;
  }

  setInsurance(insurance: number): this {
    this.insurance = insurance;
    return this;
  }

  setAdditionalField(key: string, value: string): this {
    const normalizedKey = key.trim();

    if (!normalizedKey) {
      return this;
    }

    this.additionalFields[normalizedKey] = value;
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
