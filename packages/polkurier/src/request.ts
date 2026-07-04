import { Auth } from "./auth";
import { MethodInterface } from "./methods/method-interface";
import { RequestHeaders, RequestBody } from "./types/interfaces";

export class Request {
  private headers: RequestHeaders;
  private body: RequestBody;

  constructor(method: MethodInterface, auth: Auth) {
    this.headers = {
      "Content-Type": "application/json",
    };
    this.body = {
      apimetod: method.getName(),
      apimethod: method.getName(),
      data: method.getRequestData(),
      authorization: {
        login: auth.getAuthLogin(),
        token: auth.getAuthToken(),
      },
    };
  }

  getHeaders(): RequestHeaders {
    return this.headers;
  }

  getBody(): RequestBody {
    return this.body;
  }
}
