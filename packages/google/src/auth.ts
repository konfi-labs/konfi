import { GoogleAuth } from "google-auth-library";
import type { AuthClient } from "google-auth-library";

let auth: GoogleAuth | undefined;
let clientPromise: Promise<AuthClient> | undefined;

type GoogleAuthEnvironment = Record<string, string | undefined>;

type GoogleServiceAccountCredential = {
  client_email: string;
  private_key: string;
};

function isGoogleServiceAccountCredential(
  value: unknown,
): value is GoogleServiceAccountCredential {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { client_email?: unknown }).client_email === "string" &&
    typeof (value as { private_key?: unknown }).private_key === "string"
  );
}

export function getGoogleAuthConfig(env: GoogleAuthEnvironment = process.env) {
  const encodedCredentials = env.GOOGLE_APPLICATION_CREDENTIALS;
  const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!encodedCredentials) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS environment variable is required",
    );
  }

  if (!projectId) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is required",
    );
  }

  let credential: unknown;
  try {
    credential = JSON.parse(
      Buffer.from(encodedCredentials, "base64").toString(),
    );
  } catch (error) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS must be base64 JSON", {
      cause: error,
    });
  }

  if (!isGoogleServiceAccountCredential(credential)) {
    throw new Error(
      "GOOGLE_APPLICATION_CREDENTIALS must include client_email and private_key",
    );
  }

  return {
    projectId,
    credentials: {
      client_email: credential.client_email,
      private_key: credential.private_key,
    },
    scopes: ["https://www.googleapis.com/auth/content"],
  };
}

export function getGoogleAuth(): GoogleAuth {
  if (!auth) {
    auth = new GoogleAuth(getGoogleAuthConfig());
  }

  return auth;
}

export async function getGoogleAuthClient(): Promise<AuthClient> {
  clientPromise ??= getGoogleAuth().getClient();

  return clientPromise;
}
