import type {
  CreateStoreOrderRequest,
  CreateStoreOrderResult,
} from "../orders/types";

export async function createOrder(
  data: CreateStoreOrderRequest,
  idToken: string,
): Promise<CreateStoreOrderResult> {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    const payload = (await response.json()) as Partial<CreateStoreOrderResult>;

    if (!response.ok) {
      return {
        id: "",
        message: payload.message ?? "ORDER_CREATION_FAILED",
        url: "",
        error: payload.error ?? "ORDER_CREATION_FAILED",
      };
    }

    return {
      id: payload.id ?? "",
      message: payload.message ?? "ORDER_CREATED_SUCCESFULLY",
      url: payload.url ?? "",
      error: payload.error,
    };
  } catch (error) {
    console.error(error);
    return {
      id: "",
      message: "ORDER_CREATION_FAILED",
      url: "",
      error: `${error}`,
    };
  }
}
