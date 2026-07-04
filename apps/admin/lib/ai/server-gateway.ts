import "server-only";

type GatewayFactory = typeof import("ai")["createGateway"];
type GatewayClient = ReturnType<GatewayFactory>;

let cachedGatewayClient: GatewayClient | null = null;

export async function getGatewayClient(): Promise<GatewayClient> {
  if (cachedGatewayClient) {
    return cachedGatewayClient;
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing AI_GATEWAY_API_KEY for AI Gateway image generation.",
    );
  }

  const { createGateway } = await import("ai");

  cachedGatewayClient = createGateway({ apiKey });

  return cachedGatewayClient;
}
