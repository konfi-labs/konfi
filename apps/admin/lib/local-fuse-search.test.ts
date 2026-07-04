import { describe, expect, it } from "vitest";
import {
  filterLocalFuseItems,
  getLocalSearchInitials,
  normalizeLocalSearchText,
  rankLocalFuseItems,
} from "./local-fuse-search";

interface SearchItem {
  id: string;
  name: string;
  secondary?: string;
}

describe("local Fuse search helper", () => {
  it("normalizes case and Polish diacritics before searching", () => {
    expect(normalizeLocalSearchText("  Łódź Śródmieście  ")).toBe(
      "lodz srodmiescie",
    );
    expect(getLocalSearchInitials("Łódź Śródmieście")).toBe("ls");
  });

  it("uses Fuse's basic build through a deterministic typed wrapper", () => {
    const items: SearchItem[] = [
      { id: "beta", name: "Beta customer" },
      { id: "alpha", name: "Alpha customer" },
    ];

    const results = rankLocalFuseItems(items, "customer", {
      keys: ["name"],
      compareItems: (left, right) => left.id.localeCompare(right.id),
    });

    expect(results.map((result) => result.item.id)).toEqual(["alpha", "beta"]);
  });

  it("matches weighted secondary fields without changing the original items", () => {
    const items: SearchItem[] = [
      { id: "one", name: "Invoice", secondary: "Net 14" },
      { id: "two", name: "Reminder", secondary: "Net 30" },
    ];

    expect(
      filterLocalFuseItems(items, "net 30", {
        keys: [
          { name: "name", weight: 0.7 },
          { name: "secondary", weight: 0.3 },
        ],
        threshold: 0.2,
      }).map((item) => item.id),
    ).toEqual(["two"]);
  });
});
