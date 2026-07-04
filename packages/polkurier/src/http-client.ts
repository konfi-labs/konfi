import { Config } from "./config";
import { Request } from "./request";
import { Response } from "./response";
import { PolkurierFatalError } from "./exceptions";

export class HTTPClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private prepareHeaders(request: Request): HeadersInit {
    const headers: HeadersInit = {};
    const requestHeaders = request.getHeaders();
    for (const [key, value] of Object.entries(requestHeaders)) {
      headers[key] = value;
    }
    return headers;
  }

  private preparePayload(request: Request): string {
    return JSON.stringify(request.getBody());
  }

  async request(request: Request): Promise<Response> {
    const headers = this.prepareHeaders(request);
    const payload = this.preparePayload(request);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.getApiTimeout() * 1000,
      );

      const response = await fetch(this.config.getApiUrl(), {
        method: "POST",
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status !== 200) {
        throw new PolkurierFatalError(
          `Nie można połączyć się z interfejsem API. HTTP_CODE: ${response.status}`,
        );
      }

      const result = await response.text();

      if (!result) {
        throw new PolkurierFatalError(
          "Nie można połączyć się z interfejsem API",
        );
      }

      return new Response(result);
    } catch (error) {
      if (error instanceof PolkurierFatalError) {
        throw error;
      }
      throw new PolkurierFatalError(
        `Nie można połączyć się z interfejsem API: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
