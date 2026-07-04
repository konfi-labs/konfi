import { OrderFilesStatus, OrderStatus } from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import {
  RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MINUTES,
  getOrderAgeInMinutes,
  isSystemOrderActor,
  shouldRequireStatusActorSelection,
  shouldRequireStatusEmailConfirmation,
  shouldWarnOrderMayBeIncomplete,
} from "./status-change-confirmation";

describe("status change confirmation helpers", () => {
  const now = new Date("2026-03-26T12:30:00.000Z");

  it("requires email confirmation for store orders moving to ready-like statuses", () => {
    expect(
      shouldRequireStatusEmailConfirmation(
        { isFromStore: true },
        OrderStatus.READY,
      ),
    ).toBe(true);

    expect(
      shouldRequireStatusEmailConfirmation(
        { isFromStore: true },
        OrderStatus.DELAYED,
      ),
    ).toBe(true);

    expect(
      shouldRequireStatusEmailConfirmation(
        { isFromStore: false },
        OrderStatus.READY,
      ),
    ).toBe(false);
  });

  it("identifies the system actor by id only", () => {
    expect(isSystemOrderActor({ id: "system" })).toBe(true);
    expect(isSystemOrderActor({ id: "member-1" })).toBe(false);
    expect(isSystemOrderActor({ id: "member-1", name: "System" })).toBe(false);
    expect(isSystemOrderActor(undefined)).toBe(false);
  });

  it("requires actor selection for store orders where only system actors are attached", () => {
    expect(
      shouldRequireStatusActorSelection({
        createdBy: { id: "system", name: "System" },
        isFromStore: true,
        updatedBy: { id: "system", name: "System" },
      }),
    ).toBe(true);
  });

  it("does not require actor selection for non-store orders", () => {
    expect(
      shouldRequireStatusActorSelection({
        createdBy: { id: "system", name: "System" },
        isFromStore: false,
        updatedBy: { id: "system", name: "System" },
      }),
    ).toBe(false);
  });

  it("does not require actor selection when a store order already has a real updater", () => {
    expect(
      shouldRequireStatusActorSelection({
        createdBy: { id: "system", name: "System" },
        isFromStore: true,
        updatedBy: { id: "member-1", name: "Member One" },
      }),
    ).toBe(false);
  });

  it("warns when a very recent order is moved to in progress even if files are already marked as ready", () => {
    const createdAt = Timestamp.fromDate(
      new Date(
        now.getTime() -
          (RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MINUTES - 5) * 60 * 1000,
      ),
    );

    expect(
      shouldWarnOrderMayBeIncomplete(
        {
          createdAt,
          filesStatus: OrderFilesStatus.FILES_ARE_READY,
        },
        OrderStatus.IN_PROGRESS,
        now,
      ),
    ).toBe(true);
  });

  it("does not warn when files are not marked as ready", () => {
    const createdAt = Timestamp.fromDate(
      new Date(now.getTime() - 5 * 60 * 1000),
    );

    expect(
      shouldWarnOrderMayBeIncomplete(
        {
          createdAt,
          filesStatus: OrderFilesStatus.WAITING_FOR_FILES,
        },
        OrderStatus.IN_PROGRESS,
        now,
      ),
    ).toBe(false);
  });

  it("does not warn when the order is older than the warning window", () => {
    const createdAt = Timestamp.fromDate(
      new Date(
        now.getTime() -
          (RECENT_ORDER_IN_PROGRESS_WARNING_WINDOW_MINUTES + 1) * 60 * 1000,
      ),
    );

    expect(
      shouldWarnOrderMayBeIncomplete(
        {
          createdAt,
          filesStatus: OrderFilesStatus.WAITING_FOR_FILES_APPROVAL,
        },
        OrderStatus.IN_PROGRESS,
        now,
      ),
    ).toBe(false);
  });

  it("returns a human-friendly order age in minutes", () => {
    const createdAt = Timestamp.fromDate(
      new Date(now.getTime() - 12 * 60 * 1000),
    );

    expect(getOrderAgeInMinutes({ createdAt }, now)).toBe(12);
    expect(
      getOrderAgeInMinutes(
        {
          createdAt: Timestamp.fromDate(new Date(now.getTime() - 10 * 1000)),
        },
        now,
      ),
    ).toBe(1);
  });
});
