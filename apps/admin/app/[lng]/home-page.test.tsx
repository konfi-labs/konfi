// @vitest-environment jsdom

import React from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./home-page";

let storedOrdersView = "production";

vi.mock("next/dynamic", () => ({
  default: () =>
    function DynamicProductionView() {
      return <div data-testid="production-view" />;
    },
}));

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: {
      resolvedLanguage: "pl",
    },
    t: (key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? key,
  }),
}));

vi.mock("@/context/tenant", () => ({
  useTenantContext: () => ({ tenantId: "tenant-1" }),
}));

vi.mock("context/auth", () => ({
  useAuth: () => ({ user: { uid: "user-1" } }),
}));

vi.mock("context/channels", () => ({
  useChannels: () => ({ channel: { id: "channel-1" } }),
}));

vi.mock("context/orders", () => ({
  OrdersProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="orders-provider">{children}</div>
  ),
}));

vi.mock("@/lib/firebase/clientApp", () => ({
  firestore: {},
}));

vi.mock("@konfi/firebase", () => ({
  db: {
    query: vi.fn(),
  },
  tenant: {
    queryConstraints: vi.fn(() => []),
  },
}));

vi.mock("firebase/firestore", () => ({
  onSnapshot: vi.fn(),
  where: vi.fn(),
}));

vi.mock("@konfi/components", () => ({
  ButtonLink: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
  MaterialSymbol: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@konfi/utils", () => ({
  ADMIN_TOOLS_MCP: "/tools/mcp",
  safeLocalStorage: {
    getItem: (key: string) =>
      key === "homepage.ordersView" ? storedOrdersView : null,
    setItem: (key: string, value: string) => {
      if (key === "homepage.ordersView") {
        storedOrdersView = value;
      }
    },
  },
}));

describe("HomePage", () => {
  beforeEach(() => {
    storedOrdersView = "production";
  });

  it("renders the production view without mounting OrdersProvider", () => {
    render(
      <ChakraProvider value={defaultSystem}>
        <HomePage />
      </ChakraProvider>,
    );

    expect(screen.getByTestId("production-view")).toBeInTheDocument();
    expect(screen.queryByTestId("orders-provider")).not.toBeInTheDocument();
  });
});
