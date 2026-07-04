// NOTE: This file is imported by client components (e.g. the admin chat UI) to build
// a system prompt that lists available tool names/descriptions. We intentionally avoid
// importing `firebase/ai` here to keep all AI-related SDK usage on the server.

type ToolSchema = {
  type: "object" | "string" | "array" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, ToolSchema>;
  items?: ToolSchema;
  required?: string[];
};

type ToolDeclaration = {
  name: string;
  description: string;
  parameters?: ToolSchema;
};

export const konfiTools: {
  functionDeclarations: ToolDeclaration[];
} = {
  functionDeclarations: [
    {
      name: "getDate",
      description:
        "Get the current date in YYYY-MM-DD format, do not ask for confirmation.",
    },
    {
      name: "fetchOrdersByDate",
      description:
        "Fetch orders from the database ONLY for a specific date range. Do not use this tool if no date is provided. Do not ask for confirmation.",
      parameters: {
        type: "object",
        properties: {
          startDate: {
            type: "string",
            description:
              "The start date for which to get the orders. Date must be in the" +
              " format: YYYY-MM-DD.",
          },
          endDate: {
            type: "string",
            description:
              "The end date for the date range (inclusive, considered as end of day 23:59:59). Date must be in the" +
              " format: YYYY-MM-DD.",
          },
        },
        required: ["startDate", "endDate"],
      },
    },
    {
      name: "searchWeb",
      description:
        "Search the web for a specific query, use this tool when you are unsure about the answer or user asks for search. There are also search plugins available for fast answers, for example you can query for 'avg 123 548 2.04 24.2', available commands are min, max, avg, sum, prod. Do not ask for confirmation.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The query to search for. The query must be in the format: 'search term'. Do not provide any personal information or sensitive data in the query.",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "suggestProducts",
      description:
        "Suggest products based on the user's query. Use this tool when the user asks for product recommendations or suggestions. Do not ask for confirmation.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "The query to search for. The query must be in the format: 'search term'. Do not provide any personal information or sensitive data in the query.",
          },
        },
        required: ["question"],
      },
    },
    {
      name: "mathTool",
      description:
        "Perform reliable arithmetic (addition, subtraction, multiplication, division) on numeric inputs. Do not ask for confirmation.",
      parameters: {
        type: "object",
        properties: {
          operation: {
            type: "string",
            description:
              "Arithmetic operation to perform. Allowed values: add, subtract, multiply, divide.",
          },
          values: {
            type: "array",
            description:
              "List of numeric inputs to apply the operation to. Provide at least two numbers.",
            items: {
              type: "number",
            },
          },
        },
        required: ["operation", "values"],
      },
    },
  ],
};
