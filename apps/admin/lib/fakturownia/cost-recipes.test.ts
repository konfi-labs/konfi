import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => {
  const serverTimestampSentinel = { __fieldValue: "serverTimestamp" };
  const refs = new Map<
    string,
    {
      get: ReturnType<typeof vi.fn>;
      id: string;
      set: ReturnType<typeof vi.fn>;
    }
  >();
  const makeRef = (id: string) => {
    const existing = refs.get(id);
    if (existing) {
      return existing;
    }
    const ref = {
      get: vi.fn(),
      id,
      set: vi.fn(),
    };
    refs.set(id, ref);
    return ref;
  };
  const doc = vi.fn((id?: string) => makeRef(id ?? "generated-recipe"));
  const query = {
    get: vi.fn(),
    limit: vi.fn(() => query),
    where: vi.fn(() => query),
  };
  const collection = vi.fn(() => ({
    doc,
    where: query.where,
  }));
  const getAdminDb = vi.fn(() => ({
    collection,
  }));

  return {
    collection,
    doc,
    getAdminDb,
    query,
    refs,
    serverTimestampSentinel,
  };
});

vi.mock("@/lib/firebase/serverApp", () => ({
  getAdminDb: mocks.getAdminDb,
}));

vi.mock("firebase-admin/firestore", () => ({
  FieldValue: {
    serverTimestamp: () => mocks.serverTimestampSentinel,
  },
}));

import {
  buildFakturowniaCostRecipeId,
  listFakturowniaCostRecipes,
  softDeleteFakturowniaCostRecipe,
  writeFakturowniaCostRecipe,
} from "./cost-recipes";

const member = { id: "admin-1", name: "Admin" };

function existingRecipe(tenantId = "tenant-a") {
  return {
    active: true,
    components: [{ attributeId: "paper", optionValue: "silk-350" }],
    id: "recipe-existing",
    name: "Paper + laminate",
    targetAttributeId: "finish",
    targetOptionValue: "silk-350-mat",
    tenantId,
  };
}

describe("Fakturownia cost recipes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refs.clear();
    mocks.query.get.mockResolvedValue({ docs: [] });
  });

  it("builds a deterministic target id scoped by tenant", () => {
    const first = buildFakturowniaCostRecipeId({
      targetAttributeId: "finish",
      targetOptionValue: "mat",
      tenantId: "tenant-a",
    });
    const second = buildFakturowniaCostRecipeId({
      targetAttributeId: "finish",
      targetOptionValue: "mat",
      tenantId: "tenant-a",
    });
    const otherTenant = buildFakturowniaCostRecipeId({
      targetAttributeId: "finish",
      targetOptionValue: "mat",
      tenantId: "tenant-b",
    });

    expect(first).toBe(second);
    expect(first).not.toBe(otherTenant);
  });

  it("rejects recipes outside the active tenant", async () => {
    const id = buildFakturowniaCostRecipeId({
      targetAttributeId: "finish",
      targetOptionValue: "mat",
      tenantId: "tenant-b",
    });
    mocks.doc(id).get.mockResolvedValue({
      data: () => existingRecipe("tenant-a"),
      exists: true,
    });

    await expect(
      writeFakturowniaCostRecipe({
        components: [{ attributeId: "paper", optionValue: "silk-350" }],
        member,
        name: "Recipe",
        targetAttributeId: "finish",
        targetOptionValue: "mat",
        tenantId: "tenant-b",
      }),
    ).rejects.toThrow("outside the active tenant");
  });

  it("normalizes factors and writes an active recipe", async () => {
    const id = buildFakturowniaCostRecipeId({
      targetAttributeId: "finish",
      targetOptionValue: "mat",
      tenantId: "tenant-a",
    });
    mocks.doc(id).get.mockResolvedValue({ exists: false });

    await expect(
      writeFakturowniaCostRecipe({
        components: [
          { attributeId: "paper", optionValue: "silk-350" },
          { attributeId: "lamination", factor: 2.123456, optionValue: "mat" },
        ],
        member,
        name: " Recipe ",
        targetAttributeId: "finish",
        targetOptionValue: "mat",
        tenantId: "tenant-a",
      }),
    ).resolves.toBe(id);

    expect(mocks.refs.get(id)?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        components: [
          { attributeId: "paper", optionValue: "silk-350" },
          { attributeId: "lamination", factor: 2.1235, optionValue: "mat" },
        ],
        name: "Recipe",
      }),
      { merge: true },
    );
  });

  it("rejects duplicate and self-referential components", async () => {
    await expect(
      writeFakturowniaCostRecipe({
        components: [
          { attributeId: "paper", optionValue: "silk-350" },
          { attributeId: "paper", optionValue: "silk-350" },
        ],
        member,
        name: "Recipe",
        targetAttributeId: "finish",
        targetOptionValue: "mat",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("Duplicate recipe components");

    await expect(
      writeFakturowniaCostRecipe({
        components: [{ attributeId: "finish", optionValue: "mat" }],
        member,
        name: "Recipe",
        targetAttributeId: "finish",
        targetOptionValue: "mat",
        tenantId: "tenant-a",
      }),
    ).rejects.toThrow("same as the target option");
  });

  it("filters listed recipes by target key after tenant-scoped query", async () => {
    mocks.query.get.mockResolvedValue({
      docs: [
        {
          data: () => existingRecipe("tenant-a"),
          id: "recipe-1",
        },
        {
          data: () => ({
            ...existingRecipe("tenant-a"),
            targetOptionValue: "other",
          }),
          id: "recipe-2",
        },
      ],
    });

    const recipes = await listFakturowniaCostRecipes({
      targetKeys: ["finish:silk-350-mat"],
      tenantId: "tenant-a",
    });

    expect(recipes.map((recipe) => recipe.id)).toEqual(["recipe-1"]);
  });

  it("soft-deletes same-tenant recipes", async () => {
    mocks.doc("recipe-existing").get.mockResolvedValue({
      data: () => existingRecipe("tenant-a"),
      exists: true,
    });

    await softDeleteFakturowniaCostRecipe({
      id: "recipe-existing",
      member,
      tenantId: "tenant-a",
    });

    expect(mocks.refs.get("recipe-existing")?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        updatedBy: member,
      }),
      { merge: true },
    );
  });
});
