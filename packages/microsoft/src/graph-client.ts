/**
 * Microsoft Graph API Client
 */

import { Client, type ClientOptions } from "@microsoft/microsoft-graph-client";
import type { MicrosoftUser } from "./types";

/**
 * Create a Microsoft Graph client with the provided access token
 */
export function createGraphClient(accessToken: string): Client {
  const clientOptions: ClientOptions = {
    authProvider: {
      getAccessToken: async () => accessToken,
    },
  };

  return Client.initWithMiddleware(clientOptions);
}

/**
 * Get the current user's profile
 */
export async function getCurrentUser(
  accessToken: string,
): Promise<MicrosoftUser> {
  const client = createGraphClient(accessToken);

  const user = await client
    .api("/me")
    .select([
      "id",
      "displayName",
      "mail",
      "userPrincipalName",
      "givenName",
      "surname",
      "jobTitle",
      "officeLocation",
      "mobilePhone",
      "businessPhones",
    ])
    .get();

  return user as MicrosoftUser;
}

/**
 * Get the current user's profile photo as base64
 */
export async function getUserPhoto(
  accessToken: string,
): Promise<string | null> {
  const client = createGraphClient(accessToken);

  try {
    const photo = await client.api("/me/photo/$value").get();

    if (photo instanceof Blob) {
      const buffer = await photo.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return `data:image/jpeg;base64,${base64}`;
    }

    if (Buffer.isBuffer(photo)) {
      return `data:image/jpeg;base64,${photo.toString("base64")}`;
    }

    return null;
  } catch (error) {
    // Photo might not exist
    console.warn("Failed to get user photo:", error);
    return null;
  }
}
