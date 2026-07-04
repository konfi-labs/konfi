import { headers } from "next/headers";
import Script from "next/script";

export async function JsonLdScript({
  id,
  jsonLd,
}: {
  id: string;
  jsonLd: object;
}) {
  const nonce = (await headers()).get("x-nonce") || "";

  return (
    <Script
      id={id}
      nonce={nonce}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
