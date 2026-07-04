import { DesignatedPickupArea } from "@konfi/types";

/**
 * Determines whether the pickup email requires arrival confirmation
 * (i.e. the designated pickup warehouse differs from all source warehouses).
 */
export function requiresPickupArrivalConfirmation(params: {
  designatedPickupAreaId?: string;
  pickupAreaWarehouseId?: string;
  sourceWarehouseIds: string[];
}): boolean {
  const { designatedPickupAreaId, pickupAreaWarehouseId, sourceWarehouseIds } =
    params;
  if (!designatedPickupAreaId || !pickupAreaWarehouseId) return false;
  if (sourceWarehouseIds.length === 0) return false;
  return !sourceWarehouseIds.includes(pickupAreaWarehouseId);
}

/**
 * Generates a unique name for a designated pickup area following the format:
 * {warehouse.name}#{area_description}
 *
 * @param warehouseName - The name of the warehouse
 * @param areaDescription - The description of the pickup area (e.g., "A1-R2")
 * @returns Formatted pickup area name
 */
export function generateDesignatedPickupAreaName(
  warehouseName: string,
  areaDescription: string,
): string {
  return `${warehouseName}#${areaDescription}`;
}

/**
 * Parses a designated pickup area name to extract warehouse name and area description
 *
 * @param pickupAreaName - The formatted pickup area name
 * @returns Object containing warehouse name and area description
 */
export function parseDesignatedPickupAreaName(pickupAreaName: string): {
  warehouseName: string;
  areaDescription: string;
} {
  const hashIndex = pickupAreaName.indexOf("#");
  if (hashIndex === -1) {
    return {
      warehouseName: pickupAreaName,
      areaDescription: "",
    };
  }

  return {
    warehouseName: pickupAreaName.substring(0, hashIndex),
    areaDescription: pickupAreaName.substring(hashIndex + 1),
  };
}

/**
 * Filters designated pickup areas by shipping option
 *
 * @param pickupAreas - Array of pickup areas to filter
 * @param shippingOption - The shipping option to filter by
 * @returns Filtered array of pickup areas
 */
export function getPickupAreasByShippingOption(
  pickupAreas: DesignatedPickupArea[],
  shippingOption: string,
): DesignatedPickupArea[] {
  return pickupAreas.filter(
    (area) =>
      area.shippingOptions?.includes(shippingOption) ||
      !area.shippingOptions ||
      area.shippingOptions.length === 0,
  );
}

/**
 * Checks if a designated pickup area supports a specific shipping option
 *
 * @param pickupArea - The pickup area to check
 * @param shippingOption - The shipping option to check
 * @returns True if the pickup area supports the shipping option
 */
export function isPickupAreaCompatibleWithShipping(
  pickupArea: DesignatedPickupArea,
  shippingOption: string,
): boolean {
  // If no shipping options are specified, the area is compatible with all options
  if (!pickupArea.shippingOptions || pickupArea.shippingOptions.length === 0) {
    return true;
  }

  return pickupArea.shippingOptions.includes(shippingOption);
}
