import { Customer, Order, SearchType } from "@konfi/types";
import { FirebaseError } from "firebase/app";
import { getAuth } from "firebase/auth";
import { httpsCallable, HttpsCallableResult } from "firebase/functions";
import { app, functions, initApp, initFunctions } from "./lib";

type newsletterResult = {
  message: string;
};

async function callNewsletterRoute(
  path: "/api/newsletter/subscribe" | "/api/newsletter/unsubscribe",
): Promise<HttpsCallableResult<newsletterResult> | FirebaseError> {
  try {
    if (!app) {
      initApp();
    }

    if (!app) {
      throw new FirebaseError("app/no-app", "Firebase app is not initialized.");
    }

    const user = getAuth(app).currentUser;
    if (!user) {
      throw new FirebaseError(
        "auth/unauthenticated",
        "User must be authenticated.",
      );
    }

    const response = await fetch(path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
      },
    });
    const data = (await response.json()) as newsletterResult;

    if (!response.ok) {
      throw new FirebaseError(
        `functions/${response.status}`,
        data.message || "Newsletter request failed.",
      );
    }

    return { data };
  } catch (error: unknown) {
    if (error instanceof FirebaseError) {
      console.error(error);
      return error;
    }

    console.error("An unknown error occurred:", error);
    throw error;
  }
}

export async function newsletterSubscribe(): Promise<
  HttpsCallableResult<newsletterResult> | FirebaseError
> {
  return callNewsletterRoute("/api/newsletter/subscribe");
}

export async function newsletterUnsubscribe(): Promise<
  HttpsCallableResult<newsletterResult> | FirebaseError
> {
  return callNewsletterRoute("/api/newsletter/unsubscribe");
}

export async function vectorSearch(
  type: SearchType,
  channelId: string,
  question: string,
): Promise<{ label: string; value: string }[] | string[]> {
  try {
    if (!functions) {
      initFunctions();
    }
    if (type === SearchType.PRODUCTS) {
      const request = httpsCallable<
        { type: SearchType; channelId: string; question: string },
        { label: string; value: string }[]
      >(functions, "search");
      const result = (await request({ type, channelId, question })).data;
      return result;
    } else if (type === SearchType.ORDERS) {
      const request = httpsCallable<
        { type: SearchType; channelId: string; question: string },
        Order["id"][]
      >(functions, "search");
      const result = (await request({ type, channelId, question })).data;
      return result;
    } else if (type === SearchType.CUSTOMERS) {
      const request = httpsCallable<
        { type: SearchType; channelId: string; question: string },
        Customer["id"][]
      >(functions, "search");
      const result = (await request({ type, channelId, question })).data;
      return result;
    } else {
      return [];
    }
  } catch (error) {
    console.error(error);
    return [];
  }
}
