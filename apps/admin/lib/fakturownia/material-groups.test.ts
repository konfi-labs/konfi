import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const deleteSentinel = { __fieldValue: "delete" };
  const serverTimestampSentinel = { __fieldValue: "serverTimestamp" };
  const docGet = vi.fn();
  const docSet = vi.fn();
  const docUpdate = vi.fn();
  const doc = vi.fn(() => ({
    get: docGet,
    id: "group-1",
    set: docSet,
    update: docUpdate,
  }));
  const collection = vi.fn(() => ({
    doc,
  }));
  const getAdminDb = vi.fn(() => ({
    collection,
  }));

  return {
    collection,
    deleteSentinel,
    doc,
    docGet,
    docSet,
    docUpdate,
    getAdminDb,
    serverTimestampSentinel,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    delete: () => mocks.deleteSentinel,
    serverTimestamp: () => mocks.serverTimestampSentinel,
  },
}));

import {
  softDeleteFakturowniaMaterialGroup,
  writeFakturowniaMaterialGroup,
} from "./material-groups";

const member = { id: "admin-1", name: "Admin" };

describe("Fakturownia material groups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.docGet.mockResolvedValue({
      data: () => ({
        active: true,
        attributeIds: ["paper"],
        id: "group-1",
        name: "Paper",
        tenantId: "tenant-a",
        valueAliases: { old: "canonical" },
      }),
      exists: true,
    });
  });

  it("rejects updates outside the active tenant", async () => {
    await expect(
      writeFakturowniaMaterialGroup({
        attributeIds: ["paper"],
        id: "group-1",
        member,
        name: "Paper",
        tenantId: "tenant-b",
      }),
    ).rejects.toThrow("outside the active tenant");

    expect(mocks.docUpdate).not.toHaveBeenCalled();
  });

  it("allows dedicated-mode updates without a tenant scope", async () => {
    await expect(
      writeFakturowniaMaterialGroup({
        attributeIds: ["paper"],
        id: "group-1",
        member,
        name: "Paper",
      }),
    ).resolves.toBe("group-1");

    expect(mocks.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        attributeIds: ["paper"],
        name: "Paper",
      }),
    );
  });

  it("deletes stale aliases when an edit clears the alias map", async () => {
    await writeFakturowniaMaterialGroup({
      attributeIds: ["paper"],
      id: "group-1",
      member,
      name: "Paper",
      tenantId: "tenant-a",
      valueAliases: {},
    });

    expect(mocks.docUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        valueAliases: mocks.deleteSentinel,
      }),
    );
  });

  it("rejects soft deletes outside the active tenant", async () => {
    await expect(
      softDeleteFakturowniaMaterialGroup({
        id: "group-1",
        member,
        tenantId: "tenant-b",
      }),
    ).rejects.toThrow("outside the active tenant");

    expect(mocks.docSet).not.toHaveBeenCalled();
  });

  it("soft-deletes same-tenant groups", async () => {
    await softDeleteFakturowniaMaterialGroup({
      id: "group-1",
      member,
      tenantId: "tenant-a",
    });

    expect(mocks.docSet).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        updatedBy: member,
      }),
      { merge: true },
    );
  });
});
