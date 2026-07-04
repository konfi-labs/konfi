import { BaseEntity } from "./base-entity";

export class Address extends BaseEntity {
  private person?: string;
  private company?: string;
  private street?: string;
  private houseNumber?: string | number;
  private flatNumber?: string | number;
  private postcode?: string;
  private city?: string;
  private email?: string;
  private phone?: string;
  private country?: string;
  private pointId?: string;

  setPerson(person: string): this {
    this.person = person;
    return this;
  }

  setCompany(company: string): this {
    this.company = company;
    return this;
  }

  setStreet(street: string): this {
    this.street = street;
    return this;
  }

  setHouseNumber(houseNumber: string | number): this {
    this.houseNumber = houseNumber;
    return this;
  }

  setFlatNumber(flatNumber: string | number): this {
    this.flatNumber = flatNumber;
    return this;
  }

  setPostcode(postcode: string): this {
    this.postcode = postcode;
    return this;
  }

  getPostcode(): string | undefined {
    return this.postcode;
  }

  setCity(city: string): this {
    this.city = city;
    return this;
  }

  setEmail(email: string): this {
    this.email = email;
    return this;
  }

  getEmail(): string | undefined {
    return this.email;
  }

  setPhone(phone: string): this {
    this.phone = phone;
    return this;
  }

  setCountry(country: string): this {
    this.country = country;
    return this;
  }

  getCountry(): string | undefined {
    return this.country;
  }

  setPointId(pointId: string): this {
    const trimmed = pointId?.toString().trim();
    this.pointId = trimmed && trimmed.length > 0 ? trimmed : undefined;
    return this;
  }

  getPointId(): string | undefined {
    return this.pointId;
  }

  toArray(): Record<string, unknown> {
    return {
      person: this.person,
      company: this.company,
      street: this.street,
      housenumber: this.houseNumber,
      flatnumber: this.flatNumber,
      postcode: this.postcode,
      city: this.city,
      email: this.email,
      phone: this.phone,
      country: this.country,
      point_id: this.pointId,
    };
  }
}
