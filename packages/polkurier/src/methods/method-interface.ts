import { RequestHeaders, RequestBody } from "../types/interfaces";

export interface MethodInterface {
  getName(): string;
  getRequestData(): RequestBody;
  setResponseData(response: unknown): void;
}
