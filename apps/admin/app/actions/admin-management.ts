"use server";

import { requireSuperAdminAuth } from "@/actions/auth-utils";
import { getAdminAuth } from "@/lib/firebase/serverApp";

type UserClaims = Record<string, unknown>;

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") {
    throw new Error("Email must be a string.");
  }

  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    throw new Error("Email is required.");
  }

  return trimmedEmail;
}

function removeClaims(
  claims: UserClaims,
  keysToRemove: readonly string[],
): UserClaims {
  const keys = new Set(keysToRemove);

  return Object.fromEntries(
    Object.entries(claims).filter(([key]) => !keys.has(key)),
  );
}

function assertAccessLevel(accessLevel: number): number {
  if (!Number.isInteger(accessLevel) || accessLevel < 1 || accessLevel > 9999) {
    throw new Error("Access level must be an integer between 1 and 9999.");
  }

  return accessLevel;
}

export async function addAdminAction(data: { email: string }): Promise<void> {
  await requireSuperAdminAuth();

  const email = normalizeEmail(data.email);
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims: UserClaims = user.customClaims ?? {};

  if (currentClaims.admin === true) {
    throw new Error("User is already an administrator.");
  }

  await auth.setCustomUserClaims(user.uid, {
    ...currentClaims,
    admin: true,
    accessLevel: 1,
  });
}

export async function removeAdminAction(data: {
  email: string;
}): Promise<void> {
  await requireSuperAdminAuth();

  const email = normalizeEmail(data.email);
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims: UserClaims = user.customClaims ?? {};

  if (currentClaims.admin !== true) {
    throw new Error("User is not an administrator.");
  }

  await auth.setCustomUserClaims(
    user.uid,
    removeClaims(currentClaims, ["admin", "accessLevel"]),
  );
}

export async function updateAdminAction(data: {
  email: string;
  accessLevel: number;
}): Promise<void> {
  await requireSuperAdminAuth();

  const email = normalizeEmail(data.email);
  const accessLevel = assertAccessLevel(data.accessLevel);
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims: UserClaims = user.customClaims ?? {};

  if (currentClaims.admin !== true) {
    throw new Error("User is not an administrator.");
  }

  await auth.setCustomUserClaims(user.uid, {
    ...currentClaims,
    admin: true,
    accessLevel,
  });
}

export async function addCourierAction(data: { email: string }): Promise<void> {
  await requireSuperAdminAuth();

  const email = normalizeEmail(data.email);
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims: UserClaims = user.customClaims ?? {};

  if (currentClaims.courier === true) {
    throw new Error("User is already a courier.");
  }

  await auth.setCustomUserClaims(user.uid, {
    ...currentClaims,
    courier: true,
  });
}

export async function removeCourierAction(data: {
  email: string;
}): Promise<void> {
  await requireSuperAdminAuth();

  const email = normalizeEmail(data.email);
  const auth = getAdminAuth();
  const user = await auth.getUserByEmail(email);
  const currentClaims: UserClaims = user.customClaims ?? {};

  if (currentClaims.courier !== true) {
    throw new Error("User is not a courier.");
  }

  await auth.setCustomUserClaims(
    user.uid,
    removeClaims(currentClaims, ["courier"]),
  );
}
