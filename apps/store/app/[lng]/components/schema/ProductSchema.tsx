import type { Product, WithContext } from "schema-dts";
import { JsonLdScript } from "./JsonLdScript";

export function ProductSchema({ jsonLd }: { jsonLd: WithContext<Product> }) {
  return <JsonLdScript id="product-json-ld" jsonLd={jsonLd} />;
}
