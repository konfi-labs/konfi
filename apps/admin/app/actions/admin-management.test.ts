import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminAuth: vi.fn(),
  getUserByEmail: vi.fn(),
  requireSuperAdminAuth: vi.fn(),
  setCustomUserClaims: vi.fn(),
}));

vi.mock("@/actions/auth-utils", () => ({
  requireSuperAdminAuth: mocks.requireSuperAdminAuth,
}));

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: vi.fn(),
  getAdminAuth: mocks.getAdminAuth,
}));

describe("admin management actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAdminAuth.mockReturnValue({
      getUserByEmail: mocks.getUserByEmail,
      setCustomUserClaims: mocks.setCustomUserClaims,
    });
  });

  it("adds an admin from the admin app server", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "user-1",
      customClaims: { courier: true },
    });
    const { addAdminAction } = await import("./admin-management");

    await addAdminAction({ email: " admin@example.com " });

    expect(mocks.requireSuperAdminAuth).toHaveBeenCalledOnce();
    expect(mocks.getUserByEmail).toHaveBeenCalledWith("admin@example.com");
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("user-1", {
      courier: true,
      admin: true,
      accessLevel: 1,
    });
  });

  it("removes admin claims without dropping unrelated claims", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "user-2",
      customClaims: {
        admin: true,
        accessLevel: 9999,
        courier: true,
      },
    });
    const { removeAdminAction } = await import("./admin-management");

    await removeAdminAction({ email: "admin@example.com" });

    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("user-2", {
      courier: true,
    });
  });

  it("updates an admin access level", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "user-3",
      customClaims: { admin: true, accessLevel: 1 },
    });
    const { updateAdminAction } = await import("./admin-management");

    await updateAdminAction({
      email: "admin@example.com",
      accessLevel: 42,
    });

    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("user-3", {
      admin: true,
      accessLevel: 42,
    });
  });

  it("rejects invalid admin access levels", async () => {
    const { updateAdminAction } = await import("./admin-management");

    await expect(
      updateAdminAction({
        email: "admin@example.com",
        accessLevel: 0,
      }),
    ).rejects.toThrow("Access level must be an integer between 1 and 9999.");

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("rejects non-string emails with a controlled validation error", async () => {
    const { addAdminAction } = await import("./admin-management");

    await expect(
      addAdminAction({ email: undefined as unknown as string }),
    ).rejects.toThrow("Email must be a string.");

    expect(mocks.getUserByEmail).not.toHaveBeenCalled();
    expect(mocks.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("does not promote a non-admin when updating access level", async () => {
    mocks.getUserByEmail.mockResolvedValue({
      uid: "user-4",
      customClaims: { courier: true },
    });
    const { updateAdminAction } = await import("./admin-management");

    await expect(
      updateAdminAction({
        email: "courier@example.com",
        accessLevel: 42,
      }),
    ).rejects.toThrow("User is not an administrator.");

    expect(mocks.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it("adds and removes courier claims on the admin app server", async () => {
    mocks.getUserByEmail
      .mockResolvedValueOnce({
        uid: "user-4",
        customClaims: { admin: true, accessLevel: 9999 },
      })
      .mockResolvedValueOnce({
        uid: "user-4",
        customClaims: {
          admin: true,
          accessLevel: 9999,
          courier: true,
        },
      });
    const { addCourierAction, removeCourierAction } =
      await import("./admin-management");

    await addCourierAction({ email: "courier@example.com" });
    await removeCourierAction({ email: "courier@example.com" });

    expect(mocks.setCustomUserClaims).toHaveBeenNthCalledWith(1, "user-4", {
      admin: true,
      accessLevel: 9999,
      courier: true,
    });
    expect(mocks.setCustomUserClaims).toHaveBeenNthCalledWith(2, "user-4", {
      admin: true,
      accessLevel: 9999,
    });
  });
});
