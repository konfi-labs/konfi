export interface CourierServiceInterface {
  toArray(): Record<string, unknown>;
}

export abstract class CourierService implements CourierServiceInterface {
  abstract toArray(): Record<string, unknown>;
}
