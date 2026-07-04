export class PolkurierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolkurierError";
    Object.setPrototypeOf(this, PolkurierError.prototype);
  }
}

export class PolkurierFatalError extends PolkurierError {
  constructor(message: string) {
    super(message);
    this.name = "PolkurierFatalError";
    Object.setPrototypeOf(this, PolkurierFatalError.prototype);
  }
}

export class PolkurierApiError extends PolkurierError {
  constructor(message: string) {
    super(message);
    this.name = "PolkurierApiError";
    Object.setPrototypeOf(this, PolkurierApiError.prototype);
  }
}
