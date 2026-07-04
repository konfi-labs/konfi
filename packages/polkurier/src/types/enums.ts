export enum ShipmentType {
  BOX = "box",
  PALLET = "pallet",
  ENVELOPE = "envelope",
  DOCUMENT = "document",
}

export enum PackType {
  ST = "ST",
  NST = "NST",
  PPAL = "PPAL",
  PAL = "PAL",
  DLU = "DLU",
}

export enum CodType {
  STANDARD = "S",
  ONE_DAY = "1D",
  FOUR_DAYS = "4D",
  SIXTEEN_DAYS = "16D",
}

export enum ReturnCodType {
  BANK_ACCOUNT = "BA",
  POSTAL_ORDER = "PO",
  MONEYBOX = "MB",
}

export enum ResponseStatus {
  SUCCESS = "success",
  ERROR = "error",
}
