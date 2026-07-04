import {
  DesignatedPickupAreaCreateSchema,
  DesignatedPickupAreaUpdateSchema,
} from "../../schemas";

describe("Designated Pickup Area Schemas", () => {
  describe("DesignatedPickupAreaCreateSchema", () => {
    it("should validate a valid designated pickup area creation", () => {
      const validData = {
        name: "MAIN#A1-R2",
        warehouseId: "warehouse-123",
        description: "Area A1, Row 2",
        shippingOptions: ["PERSONAL_COLLECTION", "DHL"],
        createdBy: {
          id: "user-123",
          name: "John Doe",
        },
      };

      const result = DesignatedPickupAreaCreateSchema.validateSync(validData);
      expect(result).toEqual(validData);
    });

    it("should require name and warehouseId", () => {
      const invalidData = {
        description: "Area A1, Row 2",
        createdBy: {
          id: "user-123",
          name: "John Doe",
        },
      };

      expect(() => {
        DesignatedPickupAreaCreateSchema.validateSync(invalidData);
      }).toThrow();
    });

    it("should allow optional fields", () => {
      const minimalData = {
        name: "MAIN#A1-R2",
        warehouseId: "warehouse-123",
        createdBy: {
          id: "user-123",
          name: "John Doe",
        },
      };

      const result = DesignatedPickupAreaCreateSchema.validateSync(minimalData);
      expect(result.name).toBe("MAIN#A1-R2");
      expect(result.warehouseId).toBe("warehouse-123");
      expect(result.description).toBeUndefined();
      expect(result.shippingOptions).toBeUndefined();
    });
  });

  describe("DesignatedPickupAreaUpdateSchema", () => {
    it("should validate a valid designated pickup area update", () => {
      const validData = {
        name: "MAIN#A1-R2-UPDATED",
        warehouseId: "warehouse-123",
        description: "Updated Area A1, Row 2",
        shippingOptions: ["PERSONAL_COLLECTION"],
        updatedBy: {
          id: "user-123",
          name: "John Doe",
        },
      };

      const result = DesignatedPickupAreaUpdateSchema.validateSync(validData);
      expect(result).toEqual(validData);
    });

    it("should require name, warehouseId, and updatedBy", () => {
      const invalidData = {
        description: "Updated Area A1, Row 2",
      };

      expect(() => {
        DesignatedPickupAreaUpdateSchema.validateSync(invalidData);
      }).toThrow();
    });
  });
});
