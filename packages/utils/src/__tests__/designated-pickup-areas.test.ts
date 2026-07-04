import { DesignatedPickupArea } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import {
  generateDesignatedPickupAreaName,
  parseDesignatedPickupAreaName,
  getPickupAreasByShippingOption,
  isPickupAreaCompatibleWithShipping,
} from "../designated-pickup-areas";

describe("Designated Pickup Area Utilities", () => {
  describe("generateDesignatedPickupAreaName", () => {
    it("should generate correctly formatted pickup area name", () => {
      const result = generateDesignatedPickupAreaName("MAIN", "A1-R2");
      expect(result).toBe("MAIN#A1-R2");
    });

    it("should handle empty descriptions", () => {
      const result = generateDesignatedPickupAreaName("WAREHOUSE", "");
      expect(result).toBe("WAREHOUSE#");
    });

    it("should handle special characters", () => {
      const result = generateDesignatedPickupAreaName(
        "MAIN-WAREHOUSE",
        "A1/R2",
      );
      expect(result).toBe("MAIN-WAREHOUSE#A1/R2");
    });
  });

  describe("parseDesignatedPickupAreaName", () => {
    it("should parse correctly formatted pickup area name", () => {
      const result = parseDesignatedPickupAreaName("MAIN#A1-R2");
      expect(result).toEqual({
        warehouseName: "MAIN",
        areaDescription: "A1-R2",
      });
    });

    it("should handle name without hash", () => {
      const result = parseDesignatedPickupAreaName("MAIN");
      expect(result).toEqual({
        warehouseName: "MAIN",
        areaDescription: "",
      });
    });

    it("should handle empty string", () => {
      const result = parseDesignatedPickupAreaName("");
      expect(result).toEqual({
        warehouseName: "",
        areaDescription: "",
      });
    });

    it("should handle multiple hashes", () => {
      const result = parseDesignatedPickupAreaName("MAIN#A1#R2");
      expect(result).toEqual({
        warehouseName: "MAIN",
        areaDescription: "A1#R2",
      });
    });
  });

  describe("getPickupAreasByShippingOption", () => {
    const mockPickupAreas: DesignatedPickupArea[] = [
      {
        id: "area1",
        name: "MAIN#A1-R2",
        warehouseId: "warehouse1",
        shippingOptions: ["PERSONAL_COLLECTION", "DHL"],
        keywords: [],
        createdBy: { id: "user1", name: "User 1" },
        createdAt: Timestamp.now(),
        updatedBy: { id: "user1", name: "User 1" },
        updatedAt: Timestamp.now(),
        active: true,
      },
      {
        id: "area2",
        name: "MAIN#B1-R1",
        warehouseId: "warehouse1",
        shippingOptions: ["PERSONAL_COLLECTION"],
        keywords: [],
        createdBy: { id: "user1", name: "User 1" },
        createdAt: Timestamp.now(),
        updatedBy: { id: "user1", name: "User 1" },
        updatedAt: Timestamp.now(),
        active: true,
      },
      {
        id: "area3",
        name: "MAIN#C1-R1",
        warehouseId: "warehouse1",
        shippingOptions: [],
        keywords: [],
        createdBy: { id: "user1", name: "User 1" },
        createdAt: Timestamp.now(),
        updatedBy: { id: "user1", name: "User 1" },
        updatedAt: Timestamp.now(),
        active: true,
      },
    ];

    it("should filter areas by shipping option", () => {
      const result = getPickupAreasByShippingOption(mockPickupAreas, "DHL");
      expect(result).toHaveLength(2); // area1 (has DHL) and area3 (empty = supports all)
      expect(result[0].id).toBe("area1");
      expect(result[1].id).toBe("area3");
    });

    it("should return areas with empty shipping options", () => {
      const result = getPickupAreasByShippingOption(mockPickupAreas, "FEDEX");
      expect(result).toHaveLength(1); // only area3 (empty = supports all)
      expect(result[0].id).toBe("area3");
    });

    it("should return all areas for PERSONAL_COLLECTION", () => {
      const result = getPickupAreasByShippingOption(
        mockPickupAreas,
        "PERSONAL_COLLECTION",
      );
      expect(result).toHaveLength(3); // all areas support PERSONAL_COLLECTION
    });

    it("should handle empty array", () => {
      const result = getPickupAreasByShippingOption([], "DHL");
      expect(result).toHaveLength(0);
    });
  });

  describe("isPickupAreaCompatibleWithShipping", () => {
    const mockPickupArea: DesignatedPickupArea = {
      id: "area1",
      name: "MAIN#A1-R2",
      warehouseId: "warehouse1",
      shippingOptions: ["PERSONAL_COLLECTION", "DHL"],
      keywords: [],
      createdBy: { id: "user1", name: "User 1" },
      createdAt: Timestamp.now(),
      updatedBy: { id: "user1", name: "User 1" },
      updatedAt: Timestamp.now(),
      active: true,
    };

    it("should return true for supported shipping option", () => {
      const result = isPickupAreaCompatibleWithShipping(mockPickupArea, "DHL");
      expect(result).toBe(true);
    });

    it("should return false for unsupported shipping option", () => {
      const result = isPickupAreaCompatibleWithShipping(
        mockPickupArea,
        "FEDEX",
      );
      expect(result).toBe(false);
    });

    it("should return true for empty shipping options", () => {
      const areaWithEmptyOptions = { ...mockPickupArea, shippingOptions: [] };
      const result = isPickupAreaCompatibleWithShipping(
        areaWithEmptyOptions,
        "FEDEX",
      );
      expect(result).toBe(true);
    });

    it("should return true for undefined shipping options", () => {
      const areaWithUndefinedOptions = {
        ...mockPickupArea,
        shippingOptions: undefined,
      };
      const result = isPickupAreaCompatibleWithShipping(
        areaWithUndefinedOptions,
        "FEDEX",
      );
      expect(result).toBe(true);
    });
  });
});
