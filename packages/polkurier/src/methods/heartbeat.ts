import { AbstractMethod } from "./abstract-method";
import { RequestBody } from "../types/interfaces";

export class Heartbeat extends AbstractMethod {
  getName(): string {
    return "heartbeat";
  }

  getRequestData(): RequestBody {
    return {};
  }
}
