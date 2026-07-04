import { describe, expect, it } from "vitest";
import {
  findMatchingDepartmentForWarehouseText,
  resolveDepartmentChannelId,
  type DepartmentChannelLookup,
  type DepartmentWarehouseLookup,
  type FakturowniaDepartmentLookup,
} from "../department-channel-matching";

const channels = [
  { id: "MARKI", name: "MARKI", warehouses: ["marki-main"] },
  { id: "W33", name: "W33", warehouses: ["w33-main"] },
] satisfies DepartmentChannelLookup[];

const warehouses = [
  {
    id: "marki-main",
    name: "W33 Marki production",
    address: { city: "Marki" },
  },
  {
    id: "w33-main",
    name: "W33",
    address: { city: "Warszawa" },
  },
] satisfies DepartmentWarehouseLookup[];

describe("department channel matching", () => {
  it("prefers exact channel id matches over loose warehouse text matches", () => {
    const departments = [
      { id: 1, shortcut: "W33", name: "Warszawa W33" },
    ] satisfies FakturowniaDepartmentLookup[];

    expect(
      resolveDepartmentChannelId({
        channels,
        departmentId: "1",
        departments,
        warehouses,
      }),
    ).toBe("W33");
  });

  it("does not match department terms inside larger words", () => {
    const departments = [
      { id: 1, shortcut: "ARK", name: "Ark" },
    ] satisfies FakturowniaDepartmentLookup[];

    expect(
      resolveDepartmentChannelId({
        channels,
        departmentId: "1",
        departments,
        warehouses,
      }),
    ).toBeUndefined();
  });

  it("uses the preferred channel only when heuristic matches tie", () => {
    const tiedChannels = [
      { id: "MARKI", name: "MARKI", warehouses: ["marki-main"] },
      { id: "W33", name: "W33", warehouses: ["w33-marki"] },
    ] satisfies DepartmentChannelLookup[];
    const tiedWarehouses = [
      {
        id: "marki-main",
        name: "Main",
        address: { city: "Zielonka" },
      },
      {
        id: "w33-marki",
        name: "Production",
        address: { city: "Zielonka" },
      },
    ] satisfies DepartmentWarehouseLookup[];
    const departments = [
      { id: 1, shortcut: "Zielonka", name: "Zielonka" },
    ] satisfies FakturowniaDepartmentLookup[];

    expect(
      resolveDepartmentChannelId({
        channels: tiedChannels,
        departmentId: "1",
        departments,
        preferredChannelId: "W33",
        warehouses: tiedWarehouses,
      }),
    ).toBe("W33");
  });

  it("does not pick an arbitrary channel for ambiguous heuristic matches", () => {
    const tiedChannels = [
      { id: "MARKI", name: "MARKI", warehouses: ["marki-main"] },
      { id: "W33", name: "W33", warehouses: ["w33-marki"] },
    ] satisfies DepartmentChannelLookup[];
    const tiedWarehouses = [
      {
        id: "marki-main",
        name: "Main",
        address: { city: "Zielonka" },
      },
      {
        id: "w33-marki",
        name: "Production",
        address: { city: "Zielonka" },
      },
    ] satisfies DepartmentWarehouseLookup[];
    const departments = [
      { id: 1, shortcut: "Zielonka", name: "Zielonka" },
    ] satisfies FakturowniaDepartmentLookup[];

    expect(
      resolveDepartmentChannelId({
        channels: tiedChannels,
        departmentId: "1",
        departments,
        warehouses: tiedWarehouses,
      }),
    ).toBeUndefined();
  });

  it("finds departments by warehouse text without arbitrary substrings", () => {
    const departments = [
      { id: 1, shortcut: "W33", name: "Warszawa W33" },
      { id: 2, shortcut: "ARK", name: "Ark" },
    ] satisfies FakturowniaDepartmentLookup[];

    expect(
      findMatchingDepartmentForWarehouseText(
        "Production W33 Marki",
        departments,
      )?.id,
    ).toBe(1);
    expect(
      findMatchingDepartmentForWarehouseText("Production Marki", departments),
    ).toBeUndefined();
  });
});
