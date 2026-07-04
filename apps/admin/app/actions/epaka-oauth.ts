"use server";

import { cookies } from "next/headers";
import { Buffer } from "node:buffer";
import { checkAdmin } from ".";

const EPAKA_API_BASE = process.env.EPAKA_API_URL ?? "https://api.epaka.pl";
const EPAKA_AUTH_BASE =
  process.env.EPAKA_AUTH_URL ?? "https://epaka.pl/auth/oauth/authorize";
const EPAKA_CLIENT_ID = process.env.EPAKA_CLIENT_ID;
const EPAKA_CLIENT_SECRET = process.env.EPAKA_CLIENT_SECRET;
const EPAKA_REDIRECT_URI = process.env.EPAKA_REDIRECT_URI;

const ACCESS_TOKEN_COOKIE = "epaka_access_token";
const REFRESH_TOKEN_COOKIE = "epaka_refresh_token";
const EXPIRES_AT_COOKIE = "epaka_expires_at";
const STATE_COOKIE = "epaka_oauth_state";
const COOKIE_SECURE = process.env.NODE_ENV === "production";

type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

function requireOAuthEnv() {
  if (!EPAKA_CLIENT_ID || !EPAKA_CLIENT_SECRET || !EPAKA_REDIRECT_URI) {
    throw new Error("Epaka OAuth env vars missing (EPAKA_CLIENT_ID/SECRET/REDIRECT_URI)");
  }
}

export async function getEpakaAuthUrl(state?: string) {
  await checkAdmin();
  requireOAuthEnv();
  const effectiveState = state ?? crypto.randomUUID();
  const url = new URL(EPAKA_AUTH_BASE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", EPAKA_CLIENT_ID!);
  url.searchParams.set("redirect_uri", EPAKA_REDIRECT_URI!);
  url.searchParams.set("scope", "api");
  url.searchParams.set("state", effectiveState);

  const cookieStore = await cookies();
  cookieStore.set({
    name: STATE_COOKIE,
    value: effectiveState,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return url.toString();
}

async function setEpakaSessionTokens(token: TokenResponse) {
  const now = Date.now();
  const expiresAt = now + token.expires_in * 1000;

  const cookieStore = await cookies();

  cookieStore.set({
    name: ACCESS_TOKEN_COOKIE,
    value: token.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: token.expires_in,
  });

  if (token.refresh_token) {
    cookieStore.set({
      name: REFRESH_TOKEN_COOKIE,
      value: token.refresh_token,
      httpOnly: true,
      sameSite: "lax",
      secure: COOKIE_SECURE,
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }

  cookieStore.set({
    name: EXPIRES_AT_COOKIE,
    value: String(expiresAt),
    httpOnly: true,
    sameSite: "lax",
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: token.expires_in,
  });
}

export async function exchangeEpakaCode(code: string, state?: string) {
  await checkAdmin();
  requireOAuthEnv();
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE)?.value;
  if (!storedState || !state || storedState !== state) {
    throw new Error("Invalid OAuth state");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", EPAKA_REDIRECT_URI!);

  const token = await fetch(`${EPAKA_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${EPAKA_CLIENT_ID}:${EPAKA_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!token.ok) {
    const errorBody = await token.text();
    console.error("Epaka token exchange failed", {
      status: token.status,
      body: errorBody,
    });
    throw new Error(`Epaka token exchange failed (${token.status})`);
  }

  const tokenJson = (await token.json()) as TokenResponse;
  await setEpakaSessionTokens(tokenJson);
  cookieStore.delete(STATE_COOKIE);
  return { success: true };
}

export async function refreshEpakaToken() {
  await checkAdmin();
  requireOAuthEnv();
  const refreshToken = (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value;
  if (!refreshToken) {
    throw new Error("No Epaka refresh token");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", refreshToken);

  const token = await fetch(`${EPAKA_API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${EPAKA_CLIENT_ID}:${EPAKA_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!token.ok) {
    const errorBody = await token.text();
    console.error("Epaka token refresh failed", {
      status: token.status,
      body: errorBody,
    });
    throw new Error(`Epaka token refresh failed (${token.status})`);
  }

  const tokenJson = (await token.json()) as TokenResponse;
  await setEpakaSessionTokens(tokenJson);
  return { success: true };
}

export async function clearEpakaTokens() {
  await checkAdmin();
  const cookieStore = await cookies();
  cookieStore.delete(ACCESS_TOKEN_COOKIE);
  cookieStore.delete(REFRESH_TOKEN_COOKIE);
  cookieStore.delete(EXPIRES_AT_COOKIE);
  cookieStore.delete(STATE_COOKIE);
}

export async function getEpakaAccessTokenFromCookies(): Promise<{ token?: string; expiresAt?: number; }> {
  await checkAdmin();
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  const expiresAtRaw = cookieStore.get(EXPIRES_AT_COOKIE)?.value;
  const expiresAt = expiresAtRaw ? parseInt(expiresAtRaw, 10) : undefined;
  return { token, expiresAt };
}

export async function getEpakaRefreshTokenFromCookies(): Promise<string | undefined> {
  await checkAdmin();
  const cookieStore = await cookies();
  return cookieStore.get(REFRESH_TOKEN_COOKIE)?.value;
}
