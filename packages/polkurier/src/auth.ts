import { Config } from "./config";

export class Auth {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getAuthLogin(): string {
    return this.config.getAuthLogin();
  }

  getAuthToken(): string {
    return this.config.getAuthToken();
  }
}
