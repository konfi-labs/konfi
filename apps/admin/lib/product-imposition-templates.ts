import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

export interface ProductImpositionTemplateLink {
  id: string;
  impositionWorkflowId: string;
  impositionWorkflowName: string;
  attributeOptions: string[];
  channelId: string;
  productId: string;
}

export type CreateProductImpositionTemplateLink = Omit<
  ProductImpositionTemplateLink,
  "id"
>;

export function getProductImpositionTemplatesPath(
  channelId: string,
  productId: string,
) {
  return `channels/${channelId}/products/${productId}/impositionTemplates`;
}

export function mapProductImpositionTemplateLinkDocument(
  document: QueryDocumentSnapshot<unknown, DocumentData>,
): ProductImpositionTemplateLink {
  const data = document.data() as Partial<ProductImpositionTemplateLink> &
    CreateProductImpositionTemplateLink;

  return {
    ...data,
    id: data.id || document.id,
  };
}
