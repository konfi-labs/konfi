import { getAdminDb } from "@/lib/firebase/serverApp";
import "server-only";

import { searchWeb } from "@/lib/search";
import { searchCustomersIndex } from "@konfi/meilisearch";
import {
  Attribute,
  Customer,
  NestedMember,
  Order,
  type TenantContext,
} from "@konfi/types";
import {
  createInternalToolAuthContext,
  createInternalToolRuntime,
  searchMaterialCostsByQuery,
  suggestOrderItems,
} from "@/lib/ai/tool-layer";
import { tool, ToolSet } from "ai";
import { isEmpty } from "es-toolkit/compat";
import { TFunction } from "i18next";
import { z } from "zod";
import {
  getClientById,
  getClients,
  getInvoiceById,
  getInvoices,
  getOverdueInvoicesForClient,
  listFakturowniaDepartments,
} from "../../app/actions/fakturownia";
import {
  customerToContext,
  orderItemToContext,
  orderToContext,
} from "../assistant/to-context";

export interface ToolContext {
  channelId: string;
  firestore: FirebaseFirestore.Firestore;
  tenantContext: TenantContext;
  t: TFunction;
  attributes: Attribute[];
  idToken?: string;
  createdBy?: NestedMember;
  onLog?: (message: string) => void;
}

// Server-side helper to get orders by date using Admin SDK
async function getOrdersByDateAdmin(
  firestore: FirebaseFirestore.Firestore,
  startDate: Date,
  endDate: Date,
  channelId: string,
  tenantId?: string,
): Promise<Order[]> {
  try {
    const ordersRef = firestore.collectionGroup("orders");
    let query = ordersRef
      .where("active", "==", true)
      .where("channelId", "==", channelId)
      .where("createdAt", ">=", startDate)
      .where("createdAt", "<=", endDate);

    if (tenantId) {
      query = query.where("tenantId", "==", tenantId);
    }

    const snapshot = await query.limit(99).get();

    if (snapshot.empty) {
      return [];
    }

    return snapshot.docs.map((doc) => doc.data() as Order);
  } catch (error) {
    console.error("[getOrdersByDateAdmin] Error:", error);
    return [];
  }
}

function shouldScopeToolTenant(context: TenantContext): boolean {
  return context.deploymentMode === "saas" || context.requireTenantId;
}

function getToolTenantId(context: TenantContext): string | undefined {
  if (!shouldScopeToolTenant(context)) {
    return undefined;
  }

  const tenantId = context.tenantId?.trim();
  if (!tenantId) {
    throw new Error("Tenant context is required for assistant tools.");
  }

  return tenantId;
}

function isVisibleTenantDocument(
  data: { tenantId?: string | null } | undefined,
  tenantId: string | undefined,
): boolean {
  return !tenantId || data?.tenantId === tenantId;
}

function toTimestampMillis(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  if (typeof value === "object" && value !== null) {
    const candidate = value as { toMillis?: unknown; seconds?: unknown };
    if (typeof candidate.toMillis === "function") {
      return candidate.toMillis();
    }
    if (typeof candidate.seconds === "number") {
      return candidate.seconds * 1000;
    }
  }

  return 0;
}

export function createAssistantTools(context: ToolContext): ToolSet {
  const {
    channelId,
    firestore,
    tenantContext,
    t,
    attributes,
    createdBy,
    onLog,
  } = context;
  const tenantId = getToolTenantId(tenantContext);

  const log = (message: string) => {
    if (onLog) onLog(message);
  };

  return {
    getDate: tool({
      description: "Get the current date in YYYY-MM-DD format.",
      inputSchema: z.object({}),
      execute: async () => {
        log(
          t("assistant.gettingDate", { defaultValue: "Getting today's date" }),
        );
        return { date: new Date().toISOString().split("T")[0] };
      },
    }),

    mathTool: tool({
      description:
        "Perform reliable arithmetic (addition, subtraction, multiplication, division) on numeric inputs.",
      inputSchema: z.object({
        operation: z
          .enum(["add", "subtract", "multiply", "divide"])
          .describe("Arithmetic operation to perform."),
        values: z
          .array(z.number())
          .min(2)
          .describe("List of numeric inputs to apply the operation to."),
      }),
      execute: async ({ operation, values }) => {
        log(
          t("assistant.performingCalculation", {
            defaultValue: "Performing arithmetic calculation...",
          }),
        );

        let result: number;
        switch (operation) {
          case "add":
            result = values.reduce((acc: number, v: number) => acc + v, 0);
            break;
          case "subtract":
            result = values
              .slice(1)
              .reduce((acc: number, v: number) => acc - v, values[0]);
            break;
          case "multiply":
            result = values.reduce((acc: number, v: number) => acc * v, 1);
            break;
          case "divide":
            if (values.slice(1).some((v: number) => v === 0)) {
              return { error: "Cannot divide by zero." };
            }
            result = values
              .slice(1)
              .reduce((acc: number, v: number) => acc / v, values[0]);
            break;
          default:
            return { error: "Unknown operation" };
        }

        const operatorSymbols: Record<string, string> = {
          add: "+",
          subtract: "-",
          multiply: "×",
          divide: "÷",
        };

        return {
          operation,
          inputs: values,
          expression: values.join(` ${operatorSymbols[operation]} `),
          value: result,
        };
      },
    }),

    fetchOrdersByDate: tool({
      description: "Fetch orders from the database for a specific date range.",
      inputSchema: z.object({
        startDate: z.string().describe("The start date (YYYY-MM-DD)."),
        endDate: z.string().describe("The end date (YYYY-MM-DD, inclusive)."),
      }),
      execute: async ({ startDate, endDate }) => {
        log(
          t("assistant.fetchingOrders", {
            startDate,
            endDate,
            defaultValue:
              "Fetching orders from {{startDate}} to {{endDate}}...",
          }),
        );

        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        endDateObj.setHours(23, 59, 59, 999);

        const orders = await getOrdersByDateAdmin(
          firestore,
          startDateObj,
          endDateObj,
          channelId,
          tenantId,
        );

        if (!orders.length) {
          return {
            message: t("assistant.noOrdersFound", {
              defaultValue: "No orders found in the specified period",
            }),
          };
        }

        log(
          t("assistant.ordersRetrieved", {
            count: orders.length,
            defaultValue: "Retrieved {{count}} orders",
          }),
        );
        return { orders: orders.map((order) => orderToContext(order, t)) };
      },
    }),

    searchWeb: tool({
      description: "Search the web for a specific query.",
      inputSchema: z.object({
        query: z.string().describe("The query to search for."),
      }),
      execute: async ({ query }) => {
        log(
          t("assistant.searchingWeb", {
            query,
            defaultValue: 'Searching the web for: "{{query}}"...',
          }),
        );

        const searchResult = await searchWeb(query);

        if (!searchResult) {
          return {
            error: t("assistant.noSearchResults", {
              defaultValue: "No search results found.",
            }),
          };
        }

        const references = [
          ...searchResult.results.map((result) => ({
            url: result.url,
            title: result.title,
            content: result.content,
            thumbnail: result.thumbnail || "",
          })),
          ...searchResult.answers.map((answer) => ({
            url: answer.url,
            title: "",
            content: answer.answer,
            thumbnail: "",
          })),
        ];

        log(
          t("assistant.foundSearchResults", {
            count: references.length,
            defaultValue: "Found {{count}} search results",
          }),
        );

        return {
          searchResult,
          references,
        };
      },
    }),

    suggestProducts: tool({
      description:
        "Suggest products based on the user's query. Uses AI to match the query to available products and their configurations.",
      inputSchema: z.object({
        question: z
          .string()
          .describe(
            "The query to suggest products for, describing what the customer needs.",
          ),
      }),
      execute: async ({ question }) => {
        log(
          t("assistant.suggestingProducts", {
            defaultValue: "Suggesting products...",
          }),
        );

        if (!attributes || isEmpty(attributes)) {
          return {
            error: t("assistant.noAttributes", {
              defaultValue: "No attributes found for the channel.",
            }),
          };
        }

        try {
          log(
            t("assistant.loadingProducts", {
              defaultValue: "Loading product catalog...",
            }),
          );
          const runtime = createInternalToolRuntime(
            createInternalToolAuthContext({
              channelId,
              createdBy,
              scopes: ["products:read", "pricing:explain"],
              source: "admin-assistant",
              ...(tenantId ? { tenantId } : {}),
            }),
          );

          log(
            t("assistant.callingProductSuggestion", {
              defaultValue: "Analyzing product catalog for suggestions...",
            }),
          );
          const result = await suggestOrderItems(runtime, {
            channelId,
            query: question,
          });
          const orderItems = result.items;

          if (process.env.NODE_ENV === "development") {
            console.log("[suggestProducts] Order items fetched:", orderItems);
          }

          if (isEmpty(orderItems)) {
            return {
              error: t("assistant.noOrderItemsFound", {
                defaultValue: "No matching products found for the query.",
              }),
            };
          }

          log(
            t("assistant.orderItemsFound", {
              count: orderItems.length,
              defaultValue: "Found {{count}} product suggestions.",
            }),
          );

          return {
            orderItemsContext: JSON.stringify(
              orderItems.map((item) => orderItemToContext(item)),
            ),
            orderItems: JSON.stringify(orderItems),
            count: orderItems.length,
          };
        } catch (error) {
          console.error("[suggestProducts] Error:", error);
          return {
            error: t("assistant.productSuggestionError", {
              defaultValue: "Failed to suggest products. Please try again.",
            }),
            details: error instanceof Error ? error.message : String(error),
          };
        }
      },
    }),

    // ===== ORDER & CUSTOMER TOOLS =====

    getOrderById: tool({
      description: "Get detailed information about a specific order by its ID.",
      inputSchema: z.object({
        orderId: z.string().describe("The order ID to look up."),
      }),
      execute: async ({ orderId }) => {
        log(
          t("assistant.fetchingOrder", {
            orderId,
            defaultValue: "Fetching order {{orderId}}...",
          }),
        );

        try {
          const channelOrdersRef = firestore.collection(
            `channels/${channelId}/orders`,
          );
          const directDoc = await channelOrdersRef.doc(orderId).get();

          if (directDoc.exists) {
            const order = directDoc.data() as Order;
            if (!isVisibleTenantDocument(order, tenantId)) {
              return {
                error: t("assistant.orderNotFound", {
                  defaultValue: "Order not found.",
                }),
              };
            }
            return { order: orderToContext(order, t) };
          }

          const snapshot = await channelOrdersRef
            .where("id", "==", orderId)
            .limit(1)
            .get();

          if (snapshot.empty) {
            return {
              error: t("assistant.orderNotFound", {
                defaultValue: "Order not found.",
              }),
            };
          }

          const order = snapshot.docs[0].data() as Order;
          if (!isVisibleTenantDocument(order, tenantId)) {
            return {
              error: t("assistant.orderNotFound", {
                defaultValue: "Order not found.",
              }),
            };
          }
          return { order: orderToContext(order, t) };
        } catch (error) {
          console.error("[getOrderById] Error:", error);
          return { error: "Failed to fetch order." };
        }
      },
    }),

    searchCustomers: tool({
      description: "Search for customers by name, email, or phone number.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Search query - can be name, email, or phone number."),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of results to return."),
      }),
      execute: async ({ query, limit }) => {
        log(
          t("assistant.searchingCustomers", {
            query,
            defaultValue: 'Searching customers for "{{query}}"...',
          }),
        );

        try {
          const customersRef = firestore.collection("customers");
          const queryLower = query.toLowerCase();

          // Try Meilisearch first for full-text search
          const meilisearchIds = await searchCustomersIndex(
            query,
            0,
            Math.max(limit, 30),
            undefined,
            tenantId,
          ).catch(() => [] as string[]);

          let customers: Customer[] = [];

          if (meilisearchIds.length > 0) {
            // Fetch matched docs from Firestore by ID in batches of 30
            const chunks: string[][] = [];
            for (let i = 0; i < meilisearchIds.length; i += 30) {
              chunks.push(meilisearchIds.slice(i, i + 30));
            }
            const snapshots = await Promise.all(
              chunks.map((chunk) => {
                let customerQuery = customersRef.where("id", "in", chunk);
                if (tenantId) {
                  customerQuery = customerQuery.where(
                    "tenantId",
                    "==",
                    tenantId,
                  );
                }

                return customerQuery.limit(limit).get();
              }),
            );
            customers = snapshots
              .flatMap((snap) => snap.docs.map((doc) => doc.data() as Customer))
              .slice(0, limit);
          }

          // Fall back to exact email or nameSearch if Meilisearch returned nothing
          if (customers.length === 0) {
            let emailQuery = customersRef.where("email", "==", query);
            if (tenantId) {
              emailQuery = emailQuery.where("tenantId", "==", tenantId);
            }

            let snapshot = await emailQuery.limit(limit).get();

            if (snapshot.empty) {
              let nameQuery = customersRef.where(
                "nameSearch",
                "array-contains",
                queryLower,
              );
              if (tenantId) {
                nameQuery = nameQuery.where("tenantId", "==", tenantId);
              }

              snapshot = await nameQuery.limit(limit).get();
            }

            customers = snapshot.docs.map((doc) => doc.data() as Customer);
          }

          if (customers.length === 0) {
            return {
              message: t("assistant.noCustomersFound", {
                defaultValue: "No customers found matching the query.",
              }),
              customers: [],
            };
          }

          const result = customers.map((c) => customerToContext(c));
          log(
            t("assistant.customersFound", {
              count: result.length,
              defaultValue: "Found {{count}} customers.",
            }),
          );

          return { customers: result, count: result.length };
        } catch (error) {
          console.error("[searchCustomers] Error:", error);
          return { error: "Failed to search customers." };
        }
      },
    }),

    getCustomerById: tool({
      description:
        "Get detailed information about a specific customer by their ID.",
      inputSchema: z.object({
        customerId: z.string().describe("The customer ID to look up."),
      }),
      execute: async ({ customerId }) => {
        log(
          t("assistant.fetchingCustomer", {
            customerId,
            defaultValue: "Fetching customer {{customerId}}...",
          }),
        );

        try {
          const customerRef = firestore.doc(`customers/${customerId}`);
          const doc = await customerRef.get();

          if (!doc.exists) {
            return {
              error: t("assistant.customerNotFound", {
                defaultValue: "Customer not found.",
              }),
            };
          }

          const customer = doc.data() as Customer;
          if (!isVisibleTenantDocument(customer, tenantId)) {
            return {
              error: t("assistant.customerNotFound", {
                defaultValue: "Customer not found.",
              }),
            };
          }

          return { customer: customerToContext(customer) };
        } catch (error) {
          console.error("[getCustomerById] Error:", error);
          return { error: "Failed to fetch customer." };
        }
      },
    }),

    getCustomerOrders: tool({
      description: "Get orders for a specific customer.",
      inputSchema: z.object({
        customerId: z.string().describe("The customer ID to get orders for."),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe("Maximum number of orders to return."),
      }),
      execute: async ({ customerId, limit }) => {
        log(
          t("assistant.fetchingCustomerOrders", {
            customerId,
            defaultValue: "Fetching orders for customer {{customerId}}...",
          }),
        );

        try {
          const fetchLimit = Math.min(Math.max(limit * 5, 50), 200);
          const ordersRef = firestore.collection(
            `channels/${channelId}/orders`,
          );
          let ordersQuery = ordersRef
            .where("customerId", "==", customerId)
            .where("active", "==", true);

          if (tenantId) {
            ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
          }

          const snapshot = await ordersQuery.limit(fetchLimit).get();

          const orders = snapshot.docs
            .map((doc) => doc.data() as Order)
            .sort(
              (a, b) =>
                toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt),
            )
            .slice(0, limit)
            .map((order) => orderToContext(order, t));

          if (orders.length === 0) {
            return {
              message: t("assistant.noOrdersForCustomer", {
                defaultValue: "No orders found for this customer.",
              }),
              orders: [],
            };
          }

          return { orders, count: orders.length };
        } catch (error) {
          console.error("[getCustomerOrders] Error:", error);
          return { error: "Failed to fetch customer orders." };
        }
      },
    }),

    // ===== TEAM MEMBER TOOLS =====

    searchTeamMembers: tool({
      description:
        "Search for team members (staff/employees) by name. Use this when the user mentions a person's name in the context of who created, handled, or is responsible for an order — not as a customer.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Name or partial name of the team member to search for."),
      }),
      execute: async ({ query }) => {
        log(
          t("assistant.searchingTeamMembers", {
            query,
            defaultValue: 'Searching team members for "{{query}}"...',
          }),
        );

        try {
          const membersRef = firestore.collection("members");
          let membersQuery = membersRef.where("active", "==", true);

          if (tenantId) {
            membersQuery = membersQuery.where("tenantId", "==", tenantId);
          }

          const snapshot = await membersQuery.limit(50).get();

          const lowerQuery = query.toLowerCase();
          const members = snapshot.docs
            .map(
              (doc) =>
                doc.data() as {
                  id: string;
                  name: string;
                  email?: string;
                  phone?: string;
                },
            )
            .filter(
              (m) =>
                m.name?.toLowerCase().includes(lowerQuery) ||
                m.email?.toLowerCase().includes(lowerQuery),
            )
            .map((m) => ({ id: m.id, name: m.name, email: m.email }));

          if (members.length === 0) {
            return {
              message: t("assistant.noTeamMembersFound", {
                defaultValue: "No team members found matching the query.",
              }),
              members: [],
            };
          }

          log(
            t("assistant.teamMembersFound", {
              count: members.length,
              defaultValue: "Found {{count}} team member(s).",
            }),
          );
          return { members, count: members.length };
        } catch (error) {
          console.error("[searchTeamMembers] Error:", error);
          return { error: "Failed to search team members." };
        }
      },
    }),

    getOrdersByMember: tool({
      description:
        "Get orders created by a specific team member. Use this after finding the member's ID with searchTeamMembers.",
      inputSchema: z.object({
        memberId: z
          .string()
          .describe("The team member's ID (from searchTeamMembers)."),
        limit: z
          .number()
          .optional()
          .default(20)
          .describe("Maximum number of orders to return."),
      }),
      execute: async ({ memberId, limit }) => {
        log(
          t("assistant.fetchingMemberOrders", {
            memberId,
            defaultValue: "Fetching orders created by member {{memberId}}...",
          }),
        );

        try {
          const fetchLimit = Math.min(Math.max(limit * 3, 30), 150);
          const ordersRef = firestore.collection(
            `channels/${channelId}/orders`,
          );
          let ordersQuery = ordersRef
            .where("createdBy.id", "==", memberId)
            .where("active", "==", true);

          if (tenantId) {
            ordersQuery = ordersQuery.where("tenantId", "==", tenantId);
          }

          const snapshot = await ordersQuery.limit(fetchLimit).get();

          const orders = snapshot.docs
            .map((doc) => doc.data() as Order)
            .sort(
              (a, b) =>
                toTimestampMillis(b.createdAt) - toTimestampMillis(a.createdAt),
            )
            .slice(0, limit)
            .map((order) => orderToContext(order, t));

          if (orders.length === 0) {
            return {
              message: t("assistant.noOrdersForMember", {
                defaultValue: "No orders found for this team member.",
              }),
              orders: [],
            };
          }

          log(
            t("assistant.memberOrdersFound", {
              count: orders.length,
              defaultValue: "Found {{count}} order(s) for this member.",
            }),
          );
          return { orders, count: orders.length };
        } catch (error) {
          console.error("[getOrdersByMember] Error:", error);
          return { error: "Failed to fetch orders for this team member." };
        }
      },
    }),

    // ===== FAKTUROWNIA (INVOICING) TOOLS =====

    searchFakturowniaInvoices: tool({
      description:
        "Search invoices in Fakturownia (Polish invoicing system). Can filter by date range, client, invoice type, or invoice number.",
      inputSchema: z.object({
        dateFrom: z
          .string()
          .optional()
          .describe("Start date in YYYY-MM-DD format."),
        dateTo: z
          .string()
          .optional()
          .describe("End date in YYYY-MM-DD format."),
        clientId: z
          .number()
          .optional()
          .describe("Fakturownia client ID to filter by."),
        kind: z
          .enum([
            "vat",
            "proforma",
            "receipt",
            "advance",
            "final",
            "correction",
          ])
          .optional()
          .describe("Invoice type."),
        number: z.string().optional().describe("Invoice number to search for."),
        page: z
          .number()
          .optional()
          .default(1)
          .describe("Page number for pagination."),
      }),
      execute: async ({ dateFrom, dateTo, clientId, kind, number, page }) => {
        log(
          t("assistant.searchingInvoices", {
            defaultValue: "Searching Fakturownia invoices...",
          }),
        );

        try {
          const invoices = await getInvoices({
            dateFrom,
            dateTo,
            clientId,
            kind: kind as
              | "vat"
              | "proforma"
              | "receipt"
              | "advance"
              | "final"
              | "correction"
              | undefined,
            number,
            page,
            perPage: 25,
            includePositions: true,
          });

          if (isEmpty(invoices)) {
            return {
              message: t("assistant.noInvoicesFound", {
                defaultValue: "No invoices found matching the criteria.",
              }),
              invoices: [],
            };
          }

          // Return simplified invoice data for context
          const simplifiedInvoices = invoices.map(
            (inv: Record<string, unknown>) => ({
              id: inv.id,
              number: inv.number,
              kind: inv.kind,
              status: inv.status,
              issueDate: inv.issueDate ?? inv.issue_date,
              sellDate: inv.sellDate ?? inv.sell_date,
              buyerName: inv.buyerName ?? inv.buyer_name,
              priceNet: inv.priceNet ?? inv.price_net,
              priceGross: inv.priceGross ?? inv.price_gross,
              currency: inv.currency,
              paid: inv.paid,
              paymentTo: inv.paymentTo ?? inv.payment_to,
            }),
          );

          log(
            t("assistant.invoicesFound", {
              count: simplifiedInvoices.length,
              defaultValue: "Found {{count}} invoices.",
            }),
          );
          return {
            invoices: simplifiedInvoices,
            count: simplifiedInvoices.length,
          };
        } catch (error) {
          console.error("[searchFakturowniaInvoices] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to search invoices. Make sure Fakturownia is configured.",
          };
        }
      },
    }),

    getFakturowniaInvoiceById: tool({
      description:
        "Get detailed information about a specific Fakturownia invoice by its ID.",
      inputSchema: z.object({
        invoiceId: z.string().describe("The Fakturownia invoice ID."),
      }),
      execute: async ({ invoiceId }) => {
        log(
          t("assistant.fetchingInvoice", {
            invoiceId,
            defaultValue: "Fetching invoice {{invoiceId}}...",
          }),
        );

        try {
          const invoice = await getInvoiceById(invoiceId);

          if (!invoice) {
            return {
              error: t("assistant.invoiceNotFound", {
                defaultValue: "Invoice not found.",
              }),
            };
          }

          return { invoice };
        } catch (error) {
          console.error("[getFakturowniaInvoiceById] Error:", error);
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            error: message,
            hint: "Do not retry this request. Inform the user that the invoice could not be retrieved and suggest they check the invoice ID or Fakturownia configuration.",
          };
        }
      },
    }),

    searchFakturowniaClients: tool({
      description:
        "Search clients/customers in Fakturownia by name, email, or tax number (NIP).",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Search query - can be name, email, or NIP."),
      }),
      execute: async ({ query }) => {
        log(
          t("assistant.searchingFakturowniaClients", {
            query,
            defaultValue: 'Searching Fakturownia clients for "{{query}}"...',
          }),
        );

        try {
          const clients = await getClients({ query });

          if (!clients || isEmpty(clients)) {
            return {
              message: t("assistant.noFakturowniaClientsFound", {
                defaultValue: "No clients found matching the query.",
              }),
              clients: [],
            };
          }

          // Return simplified client data
          const simplifiedClients = clients.map((client) => ({
            id: client.id,
            name: client.name,
            firstName: client.firstName,
            lastName: client.lastName,
            email: client.email,
            taxNo: client.taxNo,
            city: client.city,
            street: client.street,
            postCode: client.postCode,
            country: client.country,
            phone: client.phone,
          }));

          log(
            t("assistant.fakturowniaClientsFound", {
              count: simplifiedClients.length,
              defaultValue: "Found {{count}} Fakturownia clients.",
            }),
          );
          return {
            clients: simplifiedClients,
            count: simplifiedClients.length,
          };
        } catch (error) {
          console.error("[searchFakturowniaClients] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to search Fakturownia clients.",
          };
        }
      },
    }),

    getFakturowniaClientById: tool({
      description:
        "Get detailed information about a specific Fakturownia client by their ID.",
      inputSchema: z.object({
        clientId: z.string().describe("The Fakturownia client ID."),
      }),
      execute: async ({ clientId }) => {
        log(
          t("assistant.fetchingFakturowniaClient", {
            clientId,
            defaultValue: "Fetching Fakturownia client {{clientId}}...",
          }),
        );

        try {
          const client = await getClientById(clientId);

          if (!client) {
            return {
              error: t("assistant.fakturowniaClientNotFound", {
                defaultValue: "Client not found.",
              }),
            };
          }

          return { client };
        } catch (error) {
          console.error("[getFakturowniaClientById] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to fetch Fakturownia client.",
          };
        }
      },
    }),

    checkOverdueInvoices: tool({
      description:
        "Check if a Fakturownia client has any overdue (unpaid) invoices.",
      inputSchema: z.object({
        clientId: z.string().describe("The Fakturownia client ID to check."),
      }),
      execute: async ({ clientId }) => {
        log(
          t("assistant.checkingOverdueInvoices", {
            clientId,
            defaultValue:
              "Checking overdue invoices for client {{clientId}}...",
          }),
        );

        try {
          const result = await getOverdueInvoicesForClient(clientId);

          if (result.hasOverdueInvoices) {
            return {
              hasOverdueInvoices: true,
              count: result.overdueInvoices.length,
              overdueInvoices: result.overdueInvoices,
              message: t("assistant.overdueInvoicesFound", {
                count: result.overdueInvoices.length,
                defaultValue: "Client has {{count}} overdue invoice(s).",
              }),
            };
          }

          return {
            hasOverdueInvoices: false,
            message: t("assistant.noOverdueInvoices", {
              defaultValue: "Client has no overdue invoices.",
            }),
          };
        } catch (error) {
          console.error("[checkOverdueInvoices] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to check overdue invoices.",
          };
        }
      },
    }),

    listFakturowniaDepartments: tool({
      description:
        "List all departments (company branches/divisions) configured in Fakturownia.",
      inputSchema: z.object({}),
      execute: async () => {
        log(
          t("assistant.listingDepartments", {
            defaultValue: "Listing Fakturownia departments...",
          }),
        );

        try {
          const departments = await listFakturowniaDepartments();

          if (isEmpty(departments)) {
            return {
              message: t("assistant.noDepartmentsFound", {
                defaultValue: "No departments found.",
              }),
              departments: [],
            };
          }

          // Return simplified department data
          const simplifiedDepartments = departments.map((dept) => ({
            id: dept.id,
            name: dept.name,
            shortcut: dept.shortcut,
            city: dept.city,
            street: dept.street,
            taxNo: dept.taxNo,
            bankAccount: dept.bankAccount,
          }));

          return {
            departments: simplifiedDepartments,
            count: simplifiedDepartments.length,
          };
        } catch (error) {
          console.error("[listFakturowniaDepartments] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to list departments.",
          };
        }
      },
    }),

    searchFakturowniaMaterialCosts: tool({
      description:
        'Search approved Fakturownia supplier material costs by natural-language query, for example Polish questions like "Ile kosztuje nas folia bąbelkowa?". Returns latest and average approved net costs with invoice evidence. This is read-only and does not recommend product prices.',
      inputSchema: z.object({
        dateFrom: z
          .string()
          .optional()
          .describe("Optional invoice issue date lower bound, YYYY-MM-DD."),
        dateTo: z
          .string()
          .optional()
          .describe("Optional invoice issue date upper bound, YYYY-MM-DD."),
        limit: z
          .number()
          .optional()
          .describe("Maximum number of approved cost evidence matches."),
        productId: z
          .string()
          .optional()
          .describe("Optional Konfi product id to narrow the cost search."),
        query: z
          .string()
          .describe("Natural-language material or supplier cost query."),
      }),
      execute: async ({ dateFrom, dateTo, limit, productId, query }) => {
        log(
          t("assistant.searchingFakturowniaMaterialCosts", {
            query,
            defaultValue:
              'Searching approved Fakturownia material costs for "{{query}}"...',
          }),
        );

        try {
          const runtime = createInternalToolRuntime(
            createInternalToolAuthContext({
              channelId,
              createdBy,
              scopes: ["costs:read"],
              source: "admin-assistant",
              ...(tenantId ? { tenantId } : {}),
            }),
          );

          return await searchMaterialCostsByQuery(runtime, {
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
            ...(limit ? { limit } : {}),
            ...(productId ? { productId } : {}),
            query,
          });
        } catch (error) {
          console.error("[searchFakturowniaMaterialCosts] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to search approved Fakturownia material costs.",
          };
        }
      },
    }),

    searchFakturowniaProducts: tool({
      description: "Search products/services in Fakturownia catalog.",
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe("Search query - product name or code."),
        page: z
          .number()
          .optional()
          .default(1)
          .describe("Page number for pagination."),
      }),
      execute: async ({ query, page }) => {
        log(
          t("assistant.searchingFakturowniaProducts", {
            defaultValue: "Searching Fakturownia products...",
          }),
        );

        try {
          const { getProductsPage } =
            await import("../../app/actions/fakturownia");
          const products = await getProductsPage({ query, page });

          if (isEmpty(products)) {
            return {
              message: t("assistant.noFakturowniaProductsFound", {
                defaultValue: "No products found.",
              }),
              products: [],
            };
          }

          // Return simplified product data
          const simplifiedProducts = products.map((prod) => ({
            id: prod.id,
            name: prod.name,
            code: prod.code,
            priceNet: prod.priceNet,
            priceGross: prod.priceGross,
            tax: prod.tax,
            quantityUnit: prod.quantityUnit,
            description: prod.description,
          }));

          return {
            products: simplifiedProducts,
            count: simplifiedProducts.length,
          };
        } catch (error) {
          console.error("[searchFakturowniaProducts] Error:", error);
          return {
            error:
              error instanceof Error
                ? error.message
                : "Failed to search Fakturownia products.",
          };
        }
      },
    }),

    startDurableAgent: tool({
      description: `Start a durable AI agent to create a quote, order, or product. Use this tool when the user explicitly asks to create a quote/order for a customer or to create a catalog product from scratch. Product agents inspect existing categories, product types, attributes and options, choose the price type, prepare reusable product-form data, and stop with [blocked] items if required setup is missing. Examples: "Create a quote for Example Corp for 500 business cards", "Make an order for customer Example Customer: 100 flyers A4", "Stwórz produkt: Flagi reklamowe".`,
      inputSchema: z.object({
        taskType: z
          .enum(["quote", "order", "product"])
          .describe(
            "Type of durable task: 'quote' for price proposals, 'order' for confirmed orders, or 'product' for catalog product creation drafts.",
          ),
        prompt: z
          .string()
          .describe(
            "The full user request. For products include the full source text/table, price notes, attributes, options, quantities/volumes, and any special requirements.",
          ),
      }),
      execute: async ({ taskType, prompt }) => {
        log(
          t("assistant.startingDurableAgent", {
            defaultValue: "Starting durable agent to {{taskType}}...",
            taskType,
          }),
        );

        try {
          const { start } = await import("workflow/api");
          const { getWorkflow, isTaskTypeSupported } =
            await import("@/lib/ai/durable-agents/registry");
          const { FieldValue } = await import("firebase-admin/firestore");

          if (!isTaskTypeSupported(taskType)) {
            return {
              success: false,
              error: t("assistant.durableAgentUnsupported", {
                defaultValue: `Task type "{{taskType}}" is not supported.`,
                taskType,
              }),
            };
          }

          const workflow = await getWorkflow(taskType);

          const member: NestedMember = createdBy ?? {
            id: "system",
            name: "AI Assistant",
          };

          const run = await start(workflow, [
            {
              prompt,
              createdBy: member,
              channelId,
              ...(tenantId ? { tenantId } : {}),
            },
            {
              channelId,
              attributes: attributes || [],
              ...(tenantId ? { tenantId } : {}),
            },
          ]);

          // Persist run so it appears in the agents list
          const adminFirestore = getAdminDb();
          await adminFirestore
            .collection("agents")
            .doc(run.runId)
            .set(
              {
                runId: run.runId,
                taskType,
                prompt,
                channelId,
                ...(tenantId ? { tenantId } : {}),
                createdBy: member,
                status: "processing",
                attributes: attributes || [],
                messages: [{ role: "user", content: prompt }],
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true },
            );

          return {
            success: true,
            message: t("assistant.durableAgentStarted", {
              defaultValue:
                "I've started a background agent to create the {{taskType}}. You can track its progress in the Tasks panel. It will prepare reusable review data and stop with clear [blocked] items if something must be added first.",
              taskType,
            }),
            runId: run.runId,
            taskType,
          };
        } catch (error) {
          console.error("[startDurableAgent] Error:", error);
          return {
            success: false,
            error: t("assistant.durableAgentError", {
              defaultValue:
                "Failed to start the background agent. Please try again or create the {{taskType}} manually.",
              taskType,
            }),
          };
        }
      },
    }),
  };
}
