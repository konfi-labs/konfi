import type { Order } from "@konfi/types";

export type OrderPrintMode = "full" | "withCustomer";

export type OrderPrintHandler = (order: Order, mode: OrderPrintMode) => void;
