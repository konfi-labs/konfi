import type {
  AllegroCategoryParametersResponse,
  AllegroCategorySearchResponse,
} from "@/lib/allegro-export-preview";
import type {
  AllegroAuthStatus,
  AllegroOrder,
  AllegroOrdersResponse,
} from "@/lib/allegro-order-import";

export function isDevelopmentAllegroMockEnabled(): boolean {
  const sandboxFlag = process.env.ALLEGRO_SANDBOX?.trim().toLowerCase();
  const sandboxEnabled =
    sandboxFlag === "true" || sandboxFlag === "1" || sandboxFlag === "yes";

  // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
  return process.env.NODE_ENV === "development" && !sandboxEnabled;
}

export function getDevelopmentAllegroAuthStatus(): AllegroAuthStatus & {
  expiresAt: number;
} {
  return {
    connected: true,
    user: {
      id: "dev-allegro-user",
      login: "allegro-dev-mock",
      email: "allegro-dev-mock@example.local",
    },
    expiresAt: Date.now() + 1000 * 60 * 60 * 24,
  };
}

function createMockOrders(): AllegroOrder[] {
  return [
    {
      id: "7f22f4f3-7a73-4dff-94fe-dev0001",
      revision: "rev-dev-1",
      status: "BOUGHT",
      buyer: {
        id: "buyer-dev-1",
        email: "buyer.one@example.com",
        login: "buyer-one",
        firstName: "Example",
        lastName: "Buyer",
        phoneNumber: "000000001",
      },
      lineItems: [
        {
          id: "line-item-dev-1",
          offer: {
            id: "offer-dev-1",
            name: "Wizytówki 90x50 mm",
            external: { id: "external-offer-dev-1" },
          },
          quantity: 2,
          originalPrice: { amount: "34.90", currency: "PLN" },
          price: { amount: "29.90", currency: "PLN" },
          boughtAt: "2026-03-19T09:15:00.000Z",
        },
      ],
      payment: {
        id: "payment-dev-1",
        type: "CARD",
        finishedAt: "2026-03-19T09:16:00.000Z",
        paidAmount: { amount: "74.70", currency: "PLN" },
      },
      delivery: {
        method: { id: "delivery-dev-1", name: "InPost Paczkomat 24/7" },
        cost: { amount: "14.90", currency: "PLN" },
        address: {
          firstName: "Example",
          lastName: "Buyer",
          street: "Example Street 1",
          city: "Example City",
          zipCode: "00-000",
          countryCode: "PL",
        },
        pickupPoint: {
          id: "WAW01A",
          name: "WAW01A",
          address: {
            street: "Example Locker Street 10",
            zipCode: "00-010",
            city: "Example City",
            countryCode: "PL",
          },
        },
      },
      fulfillment: {
        provider: { id: "SELLER" },
        status: "NEW",
        shipmentSummary: { lineItemsSent: "NONE" },
      },
      summary: {
        totalToPay: { amount: "74.70", currency: "PLN" },
      },
      updatedAt: "2026-03-19T09:17:00.000Z",
      messageToSeller: "Proszę sprawdzić projekt przed drukiem",
    },
    {
      id: "ac7b219f-0460-4cc2-8f63-dev0002",
      revision: "rev-dev-2",
      status: "READY_FOR_PROCESSING",
      buyer: {
        id: "buyer-dev-2",
        email: "buyer.two@example.com",
        login: "buyer-two",
        firstName: "Sample",
        lastName: "Buyer",
        phoneNumber: "000000002",
      },
      lineItems: [
        {
          id: "line-item-dev-2",
          offer: {
            id: "offer-dev-2",
            name: "Naklejki cięte po obrysie",
            external: { id: "external-offer-dev-2" },
          },
          quantity: 1,
          originalPrice: { amount: "49.00", currency: "PLN" },
          price: { amount: "49.00", currency: "PLN" },
          boughtAt: "2026-03-18T16:20:00.000Z",
        },
        {
          id: "line-item-dev-3",
          offer: {
            id: "offer-dev-3",
            name: "Ulotki A5 130g",
            external: { id: "external-offer-dev-3" },
          },
          quantity: 3,
          originalPrice: { amount: "19.99", currency: "PLN" },
          price: { amount: "17.50", currency: "PLN" },
          boughtAt: "2026-03-18T16:21:00.000Z",
        },
      ],
      payment: {
        id: "payment-dev-2",
        type: "BLIK",
        finishedAt: "2026-03-18T16:22:00.000Z",
        paidAmount: { amount: "101.50", currency: "PLN" },
      },
      delivery: {
        method: { id: "delivery-dev-2", name: "Kurier DPD" },
        cost: { amount: "0.00", currency: "PLN" },
        address: {
          firstName: "Sample",
          lastName: "Buyer",
          street: "Example Avenue 5",
          city: "Example City",
          zipCode: "00-001",
          countryCode: "PL",
          companyName: "Example Studio",
        },
      },
      fulfillment: {
        provider: { id: "SELLER" },
        status: "PROCESSING",
        shipmentSummary: { lineItemsSent: "NONE" },
      },
      summary: {
        totalToPay: { amount: "101.50", currency: "PLN" },
      },
      updatedAt: "2026-03-18T16:23:00.000Z",
      messageToSeller: "Zależy mi na szybkiej realizacji",
    },
    {
      id: "d2e01b8b-1fd5-4d5a-8560-dev0003",
      revision: "rev-dev-3",
      status: "BOUGHT",
      buyer: {
        id: "buyer-dev-3",
        email: "biuro@example.org",
        login: "example-company",
        companyName: "Example Company",
        phoneNumber: "000000003",
      },
      invoice: {
        required: true,
        address: {
          street: "Example Road 7",
          city: "Example City",
          zipCode: "00-002",
          countryCode: "PL",
          company: {
            name: "Example Company",
            taxId: "000-00-00-000",
            ids: [{ type: "PL_NIP", value: "000-00-00-000" }],
          },
        },
      },
      lineItems: [
        {
          id: "line-item-dev-4",
          offer: {
            id: "offer-dev-4",
            name: "Baner 200x100 cm",
            external: { id: "external-offer-dev-4" },
          },
          quantity: 1,
          originalPrice: { amount: "129.00", currency: "PLN" },
          price: { amount: "119.00", currency: "PLN" },
          boughtAt: "2026-03-17T12:05:00.000Z",
        },
      ],
      payment: {
        id: "payment-dev-3",
        type: "TRANSFER",
        paidAmount: { amount: "50.00", currency: "PLN" },
      },
      delivery: {
        method: { id: "delivery-dev-3", name: "Allegro One Box" },
        cost: { amount: "9.99", currency: "PLN" },
        address: {
          companyName: "Example Company",
          street: "Example Road 7",
          city: "Example City",
          zipCode: "00-002",
          countryCode: "PL",
        },
        pickupPoint: {
          id: "POZ02M",
          name: "POZ02M",
          address: "Example Road 8, Example City",
        },
      },
      fulfillment: {
        provider: { id: "ALLEGRO" },
        status: "READY_FOR_SHIPMENT",
        shipmentSummary: { lineItemsSent: "NONE" },
      },
      summary: {
        totalToPay: { amount: "128.99", currency: "PLN" },
      },
      updatedAt: "2026-03-17T12:10:00.000Z",
      messageToSeller: "Faktura na firmę, proszę o kontakt przed wysyłką",
    },
  ];
}

export function getDevelopmentAllegroOrdersResponse(options?: {
  fulfillmentProviderId?: string | null;
  fulfillmentStatus?: string | null;
  limit?: number;
  lineItemsSent?: string | null;
  offset?: number;
  status?: string | null;
  buyerLogin?: string | null;
  buyerEmail?: string | null;
}): AllegroOrdersResponse {
  const allOrders = createMockOrders()
    .filter((order) => {
      if (options?.status && order.status !== options.status) {
        return false;
      }

      if (
        options?.fulfillmentStatus &&
        order.fulfillment?.status !== options.fulfillmentStatus
      ) {
        return false;
      }

      if (
        options?.fulfillmentProviderId &&
        order.fulfillment?.provider?.id !== options.fulfillmentProviderId
      ) {
        return false;
      }

      if (
        options?.lineItemsSent &&
        order.fulfillment?.shipmentSummary?.lineItemsSent !==
          options.lineItemsSent
      ) {
        return false;
      }

      if (
        options?.buyerLogin &&
        !order.buyer.login
          .toLowerCase()
          .includes(options.buyerLogin.toLowerCase())
      ) {
        return false;
      }

      if (
        options?.buyerEmail &&
        !order.buyer.email
          .toLowerCase()
          .includes(options.buyerEmail.toLowerCase())
      ) {
        return false;
      }

      return true;
    })
    .toSorted(
      (left, right) =>
        new Date(right.updatedAt).getTime() -
        new Date(left.updatedAt).getTime(),
    );

  const offset = Math.max(0, options?.offset ?? 0);
  const limit = Math.max(1, options?.limit ?? 25);
  const checkoutForms = allOrders.slice(offset, offset + limit);

  return {
    checkoutForms,
    count: checkoutForms.length,
    totalCount: allOrders.length,
  };
}

export function getDevelopmentAllegroCategoryParametersResponse(
  categoryId: string,
): AllegroCategoryParametersResponse & { categoryId: string } {
  return {
    categoryId,
    parameters: [
      {
        id: "dev-format",
        name: "Format",
        required: true,
        type: "dictionary",
      },
      {
        id: "dev-paper",
        name: "Paper",
        required: true,
        type: "dictionary",
      },
      {
        id: "dev-pages",
        name: "Number of Pages",
        required: false,
        type: "integer",
      },
      {
        id: "dev-finish",
        name: "Finish",
        required: false,
        type: "dictionary",
      },
    ],
  };
}

const DEVELOPMENT_ALLEGRO_CATEGORIES: AllegroCategorySearchResponse["categories"] =
  [
    {
      id: "257931",
      name: "Ulotki",
      path: ["Firma i uslugi", "Druk", "Ulotki"],
    },
    {
      id: "260734",
      name: "Wizytowki",
      path: ["Firma i uslugi", "Druk", "Wizytowki"],
    },
    {
      id: "258010",
      name: "Katalogi",
      path: ["Firma i uslugi", "Druk", "Katalogi"],
    },
    {
      id: "260121",
      name: "Plakaty",
      path: ["Firma i uslugi", "Druk", "Plakaty"],
    },
  ];

export function getDevelopmentAllegroCategorySearchResponse(
  query: string,
): AllegroCategorySearchResponse {
  const normalizedQuery = query.trim().toLowerCase();

  return {
    categories: DEVELOPMENT_ALLEGRO_CATEGORIES.filter((category) =>
      [category.name, category.id, ...category.path]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    ),
  };
}
