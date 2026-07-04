// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import useSWRImmutable from "swr/immutable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTenantContext } from "@/context/tenant";
import {
  adminConfigFlagsSWRKey,
  IntegrationAvailabilityGate,
} from "./IntegrationAvailabilityGate";

vi.mock("@/actions", () => ({
  getAdminConfigFlags: vi.fn(),
}));

vi.mock("@/context/tenant", () => ({
  useTenantContext: vi.fn(),
}));

vi.mock("swr/immutable", () => ({
  default: vi.fn(),
}));

vi.mock("../layout/AdminLoadingSkeleton", () => ({
  default: ({
    rows,
    variant,
  }: {
    rows?: number;
    variant?: string;
  }) => (
    <div data-testid="loading-skeleton">
      {variant}:{rows}
    </div>
  ),
}));

vi.mock("./IntegrationUnavailableCard", () => ({
  IntegrationUnavailableCard: ({
    integrationName,
  }: {
    integrationName: string;
  }) => <div data-testid="integration-unavailable">{integrationName}</div>,
}));

const tenantContext: TenantContext = {
  deploymentMode: "saas",
  requireTenantId: true,
  tenantId: "tenant-a",
};

const mockedUseTenantContext = vi.mocked(useTenantContext);
const mockedUseSWRImmutable = vi.mocked(useSWRImmutable);

function renderGate() {
  return render(
    <IntegrationAvailabilityGate
      fallbackRows={8}
      fallbackVariant="table"
      flagKey="przelewy24Configured"
      integrationName="Przelewy24"
    >
      <div>Configured content</div>
    </IntegrationAvailabilityGate>,
  );
}

describe("IntegrationAvailabilityGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseTenantContext.mockReturnValue(tenantContext);
  });

  it("builds a tenant-scoped admin config flags SWR key", () => {
    expect(adminConfigFlagsSWRKey(tenantContext)).toEqual([
      "admin-config-flags",
      "saas",
      true,
      "tenant-a",
    ]);
  });

  it("renders the configured loading skeleton while flags are unavailable", () => {
    mockedUseSWRImmutable.mockReturnValue({
      data: undefined,
      error: undefined,
    } as ReturnType<typeof useSWRImmutable>);

    renderGate();

    expect(screen.getByTestId("loading-skeleton")).toHaveTextContent(
      "table:8",
    );
  });

  it("renders the unavailable card when the selected flag is false", () => {
    mockedUseSWRImmutable.mockReturnValue({
      data: { przelewy24Configured: false },
      error: undefined,
    } as ReturnType<typeof useSWRImmutable>);

    renderGate();

    expect(screen.getByTestId("integration-unavailable")).toHaveTextContent(
      "Przelewy24",
    );
  });

  it("renders children when the selected flag is true", () => {
    mockedUseSWRImmutable.mockReturnValue({
      data: { przelewy24Configured: true },
      error: undefined,
    } as ReturnType<typeof useSWRImmutable>);

    renderGate();

    expect(screen.getByText("Configured content")).toBeInTheDocument();
  });

  it("throws SWR errors", () => {
    const error = new Error("config flags failed");
    mockedUseSWRImmutable.mockReturnValue({
      data: undefined,
      error,
    } as ReturnType<typeof useSWRImmutable>);

    expect(() => renderGate()).toThrow(error);
  });

  it("uses the tenant-scoped key when loading flags", () => {
    mockedUseSWRImmutable.mockReturnValue({
      data: { przelewy24Configured: true },
      error: undefined,
    } as ReturnType<typeof useSWRImmutable>);

    renderGate();

    expect(mockedUseSWRImmutable).toHaveBeenCalledWith(
      ["admin-config-flags", "saas", true, "tenant-a"],
      expect.any(Function),
    );
  });
});
