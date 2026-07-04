import { getGoogleAuthClient } from "./auth";

export async function registerDeveloperWithMerchantApi(developerEmail: string) {
  if (!process.env.MERCHANT_ID) {
    throw new Error("Missing MERCHANT_ID env variable");
  }
  if (!developerEmail) {
    throw new Error("Missing developerEmail");
  }
  const client = await getGoogleAuthClient();
  const response = await client.request({
    url: `https://merchantapi.googleapis.com/accounts/v1/accounts/${process.env.MERCHANT_ID}/developerRegistration:registerGcp`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      developerEmail,
    },
  });
}
