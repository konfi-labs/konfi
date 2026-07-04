import { Auth } from "./auth";
import { Config } from "./config";
import { HTTPClient } from "./http-client";
import { Request } from "./request";
import { Response } from "./response";
import { MethodInterface } from "./methods/method-interface";
import { PolkurierApiError } from "./exceptions";
import { ResponseStatus } from "./types/enums";

export class PolkurierWebService {
  private auth: Auth;
  private httpClient: HTTPClient;
  private config: Config;

  constructor(auth: Auth, config: Config) {
    this.auth = auth;
    this.config = config;
    this.httpClient = new HTTPClient(config);
  }

  async requestMethod(method: MethodInterface): Promise<Response> {
    const request = new Request(method, this.auth);
    const response = await this.httpClient.request(request);

    if (response.get("status") !== ResponseStatus.SUCCESS) {
      throw new PolkurierApiError(JSON.stringify(response.get("response")));
    }

    method.setResponseData(response.get("response"));
    return response;
  }
}
