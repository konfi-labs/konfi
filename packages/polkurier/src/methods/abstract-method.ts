import { MethodInterface } from "./method-interface";
import { RequestBody } from "../types/interfaces";

export abstract class AbstractMethod implements MethodInterface {
  protected data: unknown;

  abstract getName(): string;
  abstract getRequestData(): RequestBody;

  setResponseData(response: unknown): void {
    this.data = response;
  }

  getData<T = unknown>(): T {
    return this.data as T;
  }
}
