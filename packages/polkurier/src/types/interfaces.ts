export interface PolkurierConfig {
  authLogin: string;
  authToken: string;
  apiUrl?: string;
  apiTimeout?: number;
}

export interface ApiResponse<T = unknown> {
  status: string;
  response: T;
}

export interface RequestHeaders {
  [key: string]: string;
}

export interface RequestBody {
  [key: string]: unknown;
}
