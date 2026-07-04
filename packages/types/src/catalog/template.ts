import { Base } from "../base";

export interface ProductTemplate extends Omit<
  Base,
  "createdAt" | "updatedAt" | "createdBy" | "updatedBy"
> {
  fileName: string;
  filePath: string;
  downloadUrl?: string;
  attributeOptions: string[];
  channelId: string;
  productId: string;
}

export interface CreateProductTemplate extends Omit<ProductTemplate, "id"> {}

export interface UpdateProductTemplate extends ProductTemplate {}

export interface ProductTemplateCreateForm extends Omit<
  CreateProductTemplate,
  "active"
> {}

export interface ProductTemplateUpdateForm extends UpdateProductTemplate {}

export type NestedProductTemplate = Omit<ProductTemplate, "active">;
