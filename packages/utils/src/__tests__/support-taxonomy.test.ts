import {
  ComplaintStatus,
  NoteCategory,
  NotePriority,
  RmaRequestStatus,
} from "@konfi/types";
import { describe, expect, it } from "vitest";

import {
  createComplaintStatusId,
  createDefaultSupportTaxonomySettings,
  getComplaintStatusDefinition,
  getComplaintStatusColorPalette,
  getComplaintStatusLabel,
  getComplaintStatusOptions,
  getNoteCategoryDefinition,
  getNoteCategoryLabel,
  getNoteCategoryOptions,
  getNotePriorityDefinitionsByWeight,
  getNotePriorityLabel,
  getNotePriorityOptions,
  getOpenComplaintStatusIds,
  getRmaReasonCategoryDefinition,
  getRmaStatusColorPalette,
  getRmaStatusDefinition,
  getRmaStatusLabel,
  hasMissingSupportTaxonomyDefaults,
  humanizeComplaintStatusId,
  normalizeSupportTaxonomySettings,
} from "../support-taxonomy";

describe("support-taxonomy", () => {
  it("creates defaults with legacy ids and complaint resolution semantics", () => {
    const settings = createDefaultSupportTaxonomySettings();

    expect(settings.complaintStatuses.map((status) => status.id)).toEqual([
      ComplaintStatus.NEW,
      ComplaintStatus.PROCESSING,
      ComplaintStatus.RESOLVED,
    ]);
    expect(settings.rmaStatuses.map((status) => status.id)).toEqual([
      RmaRequestStatus.NEW,
      RmaRequestStatus.UNDER_REVIEW,
      RmaRequestStatus.APPROVED,
      RmaRequestStatus.REJECTED,
      RmaRequestStatus.COMPLETED,
      RmaRequestStatus.CANCELED,
    ]);
    expect(settings.rmaReasonCategories.map((category) => category.id)).toEqual(
      [
        "customer-file-issue",
        "production-defect",
        "shipping-damage",
        "wrong-configuration",
        "late-delivery",
        "other",
      ],
    );
    expect(
      getComplaintStatusDefinition(ComplaintStatus.RESOLVED, settings),
    ).toMatchObject({
      resolved: true,
      terminal: true,
    });
    expect(
      getRmaStatusDefinition(RmaRequestStatus.COMPLETED, settings),
    ).toMatchObject({
      resolved: true,
      terminal: true,
    });
    expect(getOpenComplaintStatusIds(settings)).toEqual([
      ComplaintStatus.NEW,
      ComplaintStatus.PROCESSING,
    ]);
  });

  it("keeps archived values readable but excludes them from generated options", () => {
    const settings = normalizeSupportTaxonomySettings({
      complaintStatuses: [
        {
          id: "awaiting-customer",
          name: "Awaiting Customer",
          icon: "person_alert",
          colorPalette: "yellow",
          enabled: false,
          archived: true,
          isDefault: false,
          order: 0,
          resolved: false,
          terminal: false,
        },
      ],
      noteCategories: [
        {
          id: "production",
          name: "Production",
          icon: "precision_manufacturing",
          colorPalette: "purple",
          enabled: false,
          archived: true,
          isDefault: false,
          order: 0,
        },
      ],
      notePriorities: [
        {
          id: "blocked",
          name: "Blocked",
          icon: "block",
          colorPalette: "red",
          enabled: false,
          archived: true,
          isDefault: false,
          order: 0,
          weight: 90,
        },
      ],
      rmaReasonCategories: [
        {
          id: "carrier-missing-scan",
          name: "Carrier Missing Scan",
          icon: "barcode_scanner",
          colorPalette: "orange",
          enabled: false,
          archived: true,
          isDefault: false,
          order: 0,
        },
      ],
      rmaStatuses: [
        {
          id: "awaiting-carrier",
          name: "Awaiting Carrier",
          icon: "local_shipping",
          colorPalette: "orange",
          enabled: false,
          archived: true,
          isDefault: false,
          order: 0,
          resolved: false,
          terminal: false,
        },
      ],
    });

    expect(
      getComplaintStatusDefinition("awaiting-customer", settings)?.name,
    ).toBe("Awaiting Customer");
    expect(getComplaintStatusLabel("awaiting-customer", settings)).toBe(
      "Awaiting Customer",
    );
    expect(getNoteCategoryDefinition("production", settings)?.name).toBe(
      "Production",
    );
    expect(getNoteCategoryLabel("production", settings)).toBe("Production");
    expect(getNotePriorityLabel("blocked", settings)).toBe("Blocked");
    expect(getRmaStatusLabel("awaiting-carrier", settings)).toBe(
      "Awaiting Carrier",
    );
    expect(
      getRmaReasonCategoryDefinition("carrier-missing-scan", settings)?.name,
    ).toBe("Carrier Missing Scan");
    expect(getComplaintStatusOptions(settings)).not.toContainEqual({
      label: "Awaiting Customer",
      value: "awaiting-customer",
    });
    expect(getNoteCategoryOptions(settings)).not.toContainEqual({
      label: "Production",
      value: "production",
    });
    expect(getNotePriorityOptions(settings)).not.toContainEqual({
      label: "Blocked",
      value: "blocked",
    });
  });

  it("sorts enabled note priorities by weight for deterministic alerting", () => {
    const settings = normalizeSupportTaxonomySettings({
      notePriorities: [
        {
          id: "blocked",
          name: "Blocked",
          icon: "block",
          colorPalette: "red",
          enabled: true,
          archived: false,
          isDefault: false,
          order: 20,
          weight: 90,
        },
        {
          id: NotePriority.URGENT,
          name: "Urgent",
          icon: "notification_important",
          colorPalette: "red",
          enabled: true,
          archived: false,
          isDefault: true,
          order: 0,
          weight: 40,
        },
      ],
    });

    expect(
      getNotePriorityDefinitionsByWeight(settings)
        .slice(0, 2)
        .map((priority) => priority.id),
    ).toEqual(["blocked", NotePriority.URGENT]);
  });

  it("generates enabled options and translated legacy display fallbacks", () => {
    const t = (key: string, options?: { defaultValue?: string }) =>
      key === `NoteCategory.${NoteCategory.ORDER}`
        ? "Order translated"
        : (options?.defaultValue ?? key);
    const settings = normalizeSupportTaxonomySettings({
      noteCategories: [
        {
          id: "qa",
          name: "Quality Assurance",
          icon: "fact_check",
          colorPalette: "cyan",
          enabled: true,
          archived: false,
          isDefault: false,
          order: 50,
        },
      ],
    });

    expect(getNoteCategoryOptions(settings)).toContainEqual({
      label: "Quality Assurance",
      value: "qa",
    });
    expect(getNoteCategoryLabel(NoteCategory.ORDER, settings, t)).toBe(
      "Order translated",
    );
    expect(getComplaintStatusLabel("waiting-on-client")).toBe(
      "Waiting On Client",
    );
    expect(humanizeComplaintStatusId("WAITING_ON_CLIENT")).toBe(
      "Waiting On Client",
    );
    expect(
      createComplaintStatusId("Waiting on client", ["waiting-on-client"]),
    ).toBe("waiting-on-client-2");
  });

  it("normalizes partial settings by merging missing defaults without dropping custom values", () => {
    const partial = {
      complaintStatuses: [
        {
          id: ComplaintStatus.NEW,
          name: "Fresh",
          icon: "fiber_new",
          colorPalette: "blue",
          enabled: true,
          archived: false,
          isDefault: true,
          order: 0,
          resolved: false,
          terminal: false,
        },
        {
          id: "supplier-review",
          name: "Supplier Review",
          icon: "support_agent",
          colorPalette: "purple",
          enabled: true,
          archived: false,
          isDefault: false,
          order: 10,
          resolved: false,
          terminal: false,
        },
      ],
      noteCategories: [],
      notePriorities: [],
    };

    expect(hasMissingSupportTaxonomyDefaults(partial)).toBe(true);

    const settings = normalizeSupportTaxonomySettings(partial);
    expect(hasMissingSupportTaxonomyDefaults(settings)).toBe(false);
    expect(
      settings.complaintStatuses.some(
        (status) => status.id === "supplier-review",
      ),
    ).toBe(true);
    expect(
      settings.complaintStatuses.some(
        (status) => status.id === ComplaintStatus.PROCESSING,
      ),
    ).toBe(true);
    expect(
      settings.noteCategories.some(
        (category) => category.id === NoteCategory.GENERAL,
      ),
    ).toBe(true);
    expect(
      settings.notePriorities.some(
        (priority) => priority.id === NotePriority.MEDIUM,
      ),
    ).toBe(true);
    expect(
      settings.rmaStatuses.some(
        (status) => status.id === RmaRequestStatus.UNDER_REVIEW,
      ),
    ).toBe(true);
    expect(
      settings.rmaReasonCategories.some(
        (category) => category.id === "production-defect",
      ),
    ).toBe(true);
  });

  it("migrates built-in support status colors away from primary", () => {
    const settings = normalizeSupportTaxonomySettings({
      complaintStatuses: [
        {
          id: ComplaintStatus.NEW,
          name: "New",
          icon: "fiber_new",
          colorPalette: "primary",
          enabled: true,
          archived: false,
          isDefault: true,
          order: 0,
          resolved: false,
          terminal: false,
        },
      ],
      noteCategories: [],
      notePriorities: [],
      rmaReasonCategories: [],
      rmaStatuses: [
        {
          id: RmaRequestStatus.NEW,
          name: "New",
          icon: "fiber_new",
          colorPalette: "primary",
          enabled: true,
          archived: false,
          isDefault: true,
          order: 0,
          resolved: false,
          terminal: false,
        },
      ],
    });

    expect(getComplaintStatusColorPalette(ComplaintStatus.NEW, settings)).toBe(
      "blue",
    );
    expect(getRmaStatusColorPalette(RmaRequestStatus.NEW, settings)).toBe(
      "blue",
    );
  });
});
