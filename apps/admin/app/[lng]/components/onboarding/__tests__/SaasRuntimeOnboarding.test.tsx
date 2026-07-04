// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/en/orders/create"}

import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaasRuntimeOnboarding } from "../SaasRuntimeOnboarding";

const context = vi.hoisted(() => ({
  catalog: {
    attributes: [{ id: "attribute-1" }],
    categories: [{ id: "category-1" }],
    categoriesCount: 1,
    loadingCategories: false,
    loadingProducts: false,
    products: [
      {
        active: true,
        availability: { published: true },
        id: "product-1",
      },
    ],
    productsCount: 1,
    productTypes: [{ id: "product-type-1" }],
    productTypesCount: 1,
  },
  channels: {
    channel: { id: "channel-1", warehouses: [] },
    channels: [{ id: "channel-1" }],
    loadingChannels: false,
  },
  configuration: {
    attributes: [{ id: "attribute-1" }],
    loadingAttributes: false,
    loadingProductTypes: false,
    loadingShopSettings: false,
    loadingWarehouses: false,
    orderWorkflowStatusesSettings: {
      fileStatuses: [{ id: "file-new", isInitial: true }],
      orderStatuses: [{ id: "order-new", isInitial: true }],
    },
    paymentMethodsSettings: {
      methods: [{ id: "BANK_TRANSFER" }],
    },
    productTypes: [{ id: "product-type-1" }],
    productTypesCount: 1,
    shippingMethodsSettings: {
      methods: [{ id: "PERSONAL_COLLECTION" }],
    },
    warehouses: [],
  },
  customers: {
    customers: [{ id: "customer-1" }],
    customersCount: 1,
    loadingCustomers: false,
  },
  tenantContext: {
    deploymentMode: "saas",
    requireTenantId: true,
    tenantId: "tenant-1",
  },
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string | { pathname?: string };
  }) => (
    <a
      href={typeof href === "string" ? href : (href.pathname ?? "")}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("swr/immutable", () => ({
  default: (key: [string] | null) => {
    if (key?.[0] === "saas-runtime-onboarding-policy-settings") {
      return {
        data: { hasRmaPolicySettings: false, hasTaxSettings: false },
        isLoading: false,
      };
    }

    return { data: 1, isLoading: false };
  },
}));

vi.mock("@/context/catalog", () => ({
  useCatalog: () => context.catalog,
}));

vi.mock("@/context/channels", () => ({
  useChannels: () => context.channels,
}));

vi.mock("@/context/configuration", () => ({
  useConfiguration: () => context.configuration,
}));

vi.mock("@/context/customers", () => ({
  useCustomers: () => context.customers,
}));

vi.mock("@/context/tenant", () => ({
  useTenantContext: () => context.tenantContext,
}));

vi.mock("@/i18n/client", () => ({
  useT: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (
      _key: string,
      options?: {
        count?: number;
        defaultValue?: string;
      },
    ) =>
      (options?.defaultValue ?? _key).replace(
        "{{count}}",
        String(options?.count ?? ""),
      ),
  }),
}));

vi.mock("@/lib/firebase/clientApp", () => ({ firestore: {} }));
vi.mock("@/lib/support-taxonomy-settings.client", () => ({
  getSupportTaxonomySettingsRef: vi.fn(),
}));
vi.mock("@/lib/tax-settings.client", () => ({
  getTaxSettingsRef: vi.fn(),
}));
vi.mock("@/lib/tenant-runtime", () => ({
  isSharedSaasTenantRuntime: () => true,
}));

vi.mock("@konfi/components", () => ({
  ButtonLink: ({
    ariaLabel,
    children,
    disabled,
    href,
    onClick,
  }: {
    ariaLabel: string;
    children: ReactNode;
    disabled?: boolean;
    href: string;
    onClick?: () => void;
  }) => (
    <a href={href}>
      <button
        aria-label={ariaLabel}
        disabled={disabled}
        type="button"
        onClick={onClick}
      >
        {children}
      </button>
    </a>
  ),
  MaterialSymbol: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

vi.mock("@konfi/firebase", () => ({
  db: { query: vi.fn() },
  tenant: {
    queryConstraints: (_context: unknown, constraints?: unknown[]) =>
      constraints ?? [],
  },
}));

vi.mock("@konfi/types", () => ({
  ShippingOptions: { PERSONAL_COLLECTION: "PERSONAL_COLLECTION" },
}));

vi.mock("@konfi/utils", () => ({
  ADMIN_CATALOG: "/catalog",
  ADMIN_CATALOG_PRODUCTS_CREATE: "/catalog/products/create",
  ADMIN_CATALOG_PRODUCTS_EDIT: "/catalog/products",
  ADMIN_CHANNELS: "/channels",
  ADMIN_CONFIG_ATTRIBUTES: "/configuration/attributes",
  ADMIN_CONFIG_ORDER_WORKFLOW_STATUSES:
    "/configuration/order-workflow-statuses",
  ADMIN_CONFIG_PAYMENT_METHODS: "/configuration/payment-methods",
  ADMIN_CONFIG_PRODUCT_TYPES: "/configuration/product-types",
  ADMIN_CONFIG_SHIPPING_METHODS: "/configuration/shipping-methods",
  ADMIN_CONFIG_SUPPORT_TAXONOMY: "/configuration/support-taxonomy",
  ADMIN_CONFIG_TAXES: "/configuration/taxes",
  ADMIN_CONFIG_WAREHOUSES: "/configuration/warehouses",
  ADMIN_CUSTOMERS: "/customers",
  getEnabledOrderFileStatusDefinitions: (settings: {
    fileStatuses?: unknown[];
  }) => settings.fileStatuses ?? [],
  getEnabledOrderWorkflowStatusDefinitions: (settings: {
    orderStatuses?: unknown[];
  }) => settings.orderStatuses ?? [],
  getEnabledPaymentMethodDefinitions: (settings: { methods?: unknown[] }) =>
    settings.methods ?? [],
  getEnabledShippingMethodDefinitions: (settings: { methods?: unknown[] }) =>
    settings.methods ?? [],
  hasShippingDestination: () => false,
}));

vi.mock("firebase/firestore", () => ({
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  where: vi.fn(),
}));

function renderOnboarding() {
  return render(
    <ChakraProvider value={defaultSystem}>
      <SaasRuntimeOnboarding intent="order" />
    </ChakraProvider>,
  );
}

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: createStorageMock(),
  });
});

describe("SaasRuntimeOnboarding", () => {
  it("marks default-backed setup steps ready after the user opens them", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    expect(await screen.findByText("Pickup address")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Configure warehouse" }),
    );
    await user.click(screen.getByRole("button", { name: "Configure tax" }));
    await user.click(
      screen.getByRole("button", { name: "Configure RMA policy" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "Configure warehouse" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Configure tax" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Configure RMA policy" }),
      ).not.toBeInTheDocument();
    });

    expect(
      window.localStorage.getItem(
        "admin.saasOrderOnboarding.acknowledgedDefaultSteps.v1",
      ),
    ).toContain("pickup-address");
    expect(
      window.localStorage.getItem(
        "admin.saasOrderOnboarding.acknowledgedDefaultSteps.v1",
      ),
    ).toContain("tax");
    expect(
      window.localStorage.getItem(
        "admin.saasOrderOnboarding.acknowledgedDefaultSteps.v1",
      ),
    ).toContain("rma-policy");
  });
});
