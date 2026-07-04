import { PolkurierConfig } from "./types/interfaces";

export class Config {
  private apiUrl: string;
  private apiTimeout: number;
  private authLogin: string;
  private authToken: string;

  constructor(config: PolkurierConfig) {
    this.apiUrl = config.apiUrl ?? "https://api.polkurier.pl/";
    this.apiTimeout = config.apiTimeout ?? 30;
    this.authLogin = config.authLogin;
    this.authToken = config.authToken;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  getApiTimeout(): number {
    return this.apiTimeout;
  }

  getAuthLogin(): string {
    return this.authLogin;
  }

  getAuthToken(): string {
    return this.authToken;
  }

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  setApiTimeout(timeout: number): void {
    this.apiTimeout = timeout;
  }
}
