import { searchWeb } from "@/lib/search";
import { getOrdersByDate } from "@konfi/firebase";
import { Attribute, FormattedOrderItem } from "@konfi/types";
import { getAttributes } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import type { FunctionCall } from "./ai-types";
import { Timestamp } from "firebase/firestore";
import { TFunction } from "i18next";
import { orderItemToContext, orderToContext } from "./to-context";

export interface FunctionHandlerContext {
  channel: any;
  firestore: any;
  functions: any;
  t: TFunction;
  updateProcessingLog: (message: string) => void;
  attributes?: Attribute[];
}

export interface FunctionHandlerResult {
  result: any;
  logMessage: string;
  error?: string;
  references?: Array<{
    url: string;
    title: string;
    content: string;
    thumbnail: string;
  }>;
  orderItems?: string; // JSON string of FormattedOrderItem[]
}

export type FunctionHandler = (
  call: FunctionCall,
  context: FunctionHandlerContext,
) => Promise<FunctionHandlerResult>;

export const functionHandlers: Record<string, FunctionHandler> = {
  getDate: async (call, { t }) => ({
    result: { date: new Date().toISOString().split("T")[0] },
    logMessage: t("assistant.gettingDate", {
      defaultValue: "Getting today's date",
    }),
  }),

  mathTool: async (call, { t, updateProcessingLog }) => {
    const { operation, values } = call.args as {
      operation: string;
      values: Array<number | string>;
    };

    updateProcessingLog(
      t("assistant.performingCalculation", {
        defaultValue: "Performing arithmetic calculation...",
      }),
    );

    if (!operation || !values || !Array.isArray(values) || values.length < 2) {
      return {
        result: {
          error: t("assistant.invalidCalculationInput", {
            defaultValue: "Provide at least two numbers and a valid operation.",
          }),
        },
        logMessage: t("assistant.invalidCalculationInput", {
          defaultValue: "Provide at least two numbers and a valid operation.",
        }),
        error: "INVALID_INPUT",
      };
    }

    const normalizedOperation = operation.toLowerCase();
    const allowedOperations = ["add", "subtract", "multiply", "divide"];

    if (!allowedOperations.includes(normalizedOperation)) {
      return {
        result: {
          error: t("assistant.unsupportedOperation", {
            operation,
            defaultValue: "Unsupported operation: {{operation}}.",
          }),
        },
        logMessage: t("assistant.unsupportedOperation", {
          operation,
          defaultValue: "Unsupported operation: {{operation}}.",
        }),
        error: "UNSUPPORTED_OPERATION",
      };
    }

    const parsedValues = values.map((value) => Number(value));

    if (
      parsedValues.some(
        (value) => Number.isNaN(value) || !Number.isFinite(value),
      )
    ) {
      return {
        result: {
          error: t("assistant.invalidNumbers", {
            defaultValue: "All inputs must be valid finite numbers.",
          }),
        },
        logMessage: t("assistant.invalidNumbers", {
          defaultValue: "All inputs must be valid finite numbers.",
        }),
        error: "INVALID_NUMBERS",
      };
    }

    let calculationResult: number;

    switch (normalizedOperation) {
      case "add":
        calculationResult = parsedValues.reduce((acc, value) => acc + value, 0);
        break;
      case "subtract":
        calculationResult = parsedValues
          .slice(1)
          .reduce((acc, value) => acc - value, parsedValues[0]);
        break;
      case "multiply":
        calculationResult = parsedValues.reduce((acc, value) => acc * value, 1);
        break;
      case "divide": {
        const divisorValues = parsedValues.slice(1);
        if (divisorValues.some((value) => value === 0)) {
          return {
            result: {
              error: t("assistant.divideByZero", {
                defaultValue: "Cannot divide by zero.",
              }),
            },
            logMessage: t("assistant.divideByZero", {
              defaultValue: "Cannot divide by zero.",
            }),
            error: "DIVIDE_BY_ZERO",
          };
        }
        calculationResult = divisorValues.reduce(
          (acc, value) => acc / value,
          parsedValues[0],
        );
        break;
      }
      default:
        return {
          result: {
            error: t("assistant.unsupportedOperation", {
              operation,
              defaultValue: "Unsupported operation: {{operation}}.",
            }),
          },
          logMessage: t("assistant.unsupportedOperation", {
            operation,
            defaultValue: "Unsupported operation: {{operation}}.",
          }),
          error: "UNSUPPORTED_OPERATION",
        };
    }

    const operatorSymbols: Record<string, string> = {
      add: "+",
      subtract: "-",
      multiply: "×",
      divide: "÷",
    };

    const expression = parsedValues
      .map((value) => value.toString())
      .join(` ${operatorSymbols[normalizedOperation]} `);

    return {
      result: {
        operation: normalizedOperation,
        inputs: parsedValues,
        expression,
        value: calculationResult,
      },
      logMessage: t("assistant.calculationSuccess", {
        defaultValue: "Calculation completed successfully.",
      }),
    };
  },

  fetchOrdersByDate: async (call, { channel, t, updateProcessingLog }) => {
    const { startDate, endDate } = call.args as {
      startDate: string;
      endDate: string;
    };

    updateProcessingLog(
      t("assistant.fetchingOrders", {
        startDate,
        endDate,
        defaultValue: "Fetching orders from {{startDate}} to {{endDate}}...",
      }),
    );

    if (!channel) {
      return {
        result: {
          error: t("assistant.channelNotFound", {
            defaultValue: "Channel not found.",
          }),
        },
        logMessage: t("assistant.channelNotFoundError", {
          defaultValue: "Channel not found.",
        }),
        error: "Channel not found",
      };
    }

    const startDateTimestamp = Timestamp.fromDate(new Date(startDate));
    const endDateObj = new Date(endDate);
    endDateObj.setHours(23, 59, 59, 999);
    const endDateTimestamp = Timestamp.fromDate(endDateObj);

    const orders = await getOrdersByDate(
      startDateTimestamp,
      endDateTimestamp,
      channel.id,
    );

    return {
      result: {
        orders: JSON.stringify(orders.map((order) => orderToContext(order, t))),
      },
      logMessage: orders.length
        ? t("assistant.ordersRetrieved", {
            count: orders.length,
            defaultValue: "Retrieved {{count}} orders",
          })
        : t("assistant.noOrdersFound", {
            defaultValue: "No orders found in the specified period",
          }),
    };
  },

  searchWeb: async (call, { t, updateProcessingLog }) => {
    const { query } = call.args as { query: string };

    updateProcessingLog(
      t("assistant.searchingWeb", {
        query,
        defaultValue: 'Searching the web for: "{{query}}"...',
      }),
    );

    const searchResult = await searchWeb(query);

    if (!searchResult) {
      return {
        result: {
          error: t("assistant.noSearchResults", {
            defaultValue: "No search results found.",
          }),
        },
        logMessage: t("assistant.noSearchResults", {
          defaultValue: "No search results found.",
        }),
        error: "No search results",
      };
    }

    // Process search results into references
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
      ...searchResult.corrections.map((correction) => ({
        url: correction.url,
        title: correction.title,
        content: "",
        thumbnail: "",
      })),
      ...searchResult.infoboxes.map((infobox) => ({
        url: "",
        title: infobox.img_src,
        content: infobox.content,
        thumbnail: infobox.img_src || "",
      })),
    ];

    return {
      result: { searchResult: JSON.stringify(searchResult) },
      logMessage: t("assistant.foundSearchResults", {
        count: references.length,
        defaultValue: "Found {{count}} search results",
      }),
      references,
    };
  },

  suggestProducts: async (
    call,
    { channel, functions, t, updateProcessingLog, attributes },
  ) => {
    if (!channel) {
      return {
        result: {
          error: t("assistant.channelNotFound", {
            defaultValue: "Channel not found.",
          }),
        },
        logMessage: t("assistant.channelNotFoundError", {
          defaultValue: "Channel not found.",
        }),
        error: "Channel not found",
      };
    }

    if (!attributes || isEmpty(attributes)) {
      return {
        result: {
          error: t("assistant.noAttributes", {
            defaultValue: "No attributes found for the channel.",
          }),
        },
        logMessage: t("assistant.noAttributesError", {
          defaultValue: "No attributes found for the channel.",
        }),
        error: "No attributes found",
      };
    }

    updateProcessingLog(
      t("assistant.suggestingProducts", {
        defaultValue: "Suggesting products...",
      }),
    );

    try {
      const httpsCallable = (await import("firebase/functions")).httpsCallable;
      const { question } = call.args as { question: string };

      // Import the getCategorizedCardProducts function
      const { getCategorizedCardProducts } =
        await import("../../app/[lng]/components/form/field-controllers/ProductGroupedIndexedSearch");

      const request = httpsCallable<
        {
          channelId: string;
          question: string;
          productNamesWithAttributes: {
            productId: string;
            productName: string;
            attributesWithOptions: {
              attributeName: string;
              options: string[];
            }[];
          }[];
        },
        FormattedOrderItem[]
      >(functions, "productsSuggestion");
      const categorizedCardProducts = await getCategorizedCardProducts(
        channel.id,
      );

      let products: {
        productId: string;
        productName: string;
        attributesWithOptions: {
          attributeName: string;
          options: string[];
        }[];
      }[] = [];
      if (
        categorizedCardProducts &&
        Object.keys(categorizedCardProducts).length > 0
      ) {
        for (const category in categorizedCardProducts) {
          for (const product of categorizedCardProducts[category]) {
            const productAttributes = getAttributes(
              attributes,
              product.attributes ?? [],
              product.attributeOptions ?? {},
            );
            if (!productAttributes) continue;
            products.push({
              productId: product.id,
              productName: product.name,
              attributesWithOptions: productAttributes.map((attribute) => ({
                attributeName: attribute.name,
                options: attribute.options.map((option) => option.label),
              })),
            });
          }
        }
      } else {
        console.warn(
          "No categorized card products found, passing an empty products array.",
        );
      }

      const orderItems = (
        await request({
          channelId: channel.id,
          question,
          productNamesWithAttributes: products,
        })
      ).data as FormattedOrderItem[];

      if (process.env.NODE_ENV === "development") {
        console.log("Order items fetched successfully:", orderItems);
        console.log(
          JSON.stringify(orderItems.map((item) => orderItemToContext(item))),
        );
      }

      if (isEmpty(orderItems)) {
        return {
          result: {
            error: t("assistant.noOrderItemsFound", {
              defaultValue: "No order items found.",
            }),
          },
          logMessage: t("assistant.noOrderItemsFoundError", {
            defaultValue: "No order items found.",
          }),
          error: "No order items found",
        };
      }

      return {
        result: {
          orderItemsContext: JSON.stringify(
            orderItems.map((item) => orderItemToContext(item)),
          ),
        },
        orderItems: JSON.stringify(orderItems),
        logMessage: t("assistant.orderItemsFound", {
          count: orderItems.length,
          defaultValue: "Found {{count}} order items.",
        }),
      };
    } catch (error: any) {
      return {
        result: { error: "Failed to suggest products" },
        logMessage: "Failed to suggest products",
        error: error.message,
      };
    }
  },
};
