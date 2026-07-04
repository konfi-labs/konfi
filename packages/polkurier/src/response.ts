import { ApiResponse } from "./types/interfaces";

export class Response {
  private data: ApiResponse;

  constructor(jsonString: string) {
    try {
      this.data = JSON.parse(jsonString) as ApiResponse;
    } catch (error) {
      throw new Error(
        `Failed to parse response JSON: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  get<T = unknown>(key: keyof ApiResponse): T {
    return this.data[key] as T;
  }

  getData<T = unknown>(): T {
    return this.data as T;
  }
}
