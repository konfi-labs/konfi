import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getOrderRelativePath,
  normalizeRelativePath,
  resolveOrderRelativePath,
} from "./desktop-paths";

describe("desktop path guards", () => {
  const orderRootPath = path.resolve("orders");
  const orderFilePath = path.join(orderRootPath, "1001", "item", "design.pdf");

  it("rejects traversal in order relative paths", () => {
    expect(normalizeRelativePath("../secret.pdf")).toBeNull();
    expect(normalizeRelativePath("item/../../secret.pdf")).toBeNull();
    expect(
      resolveOrderRelativePath(orderRootPath, 1001, "../secret.pdf"),
    ).toBeNull();
  });

  it("permits order-root-relative files", () => {
    const resolved = resolveOrderRelativePath(
      orderRootPath,
      1001,
      "item/design.pdf",
    );
    expect(resolved).toBe(orderFilePath);
  });

  it("returns normalized relative paths for order files", () => {
    expect(getOrderRelativePath(orderRootPath, 1001, orderFilePath)).toBe(
      "item/design.pdf",
    );
  });
});
