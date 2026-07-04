"use client";

import type { ComponentProps } from "react";
import {
  FakturowniaInvoiceForm as FakturowniaInvoiceFormController,
  type FakturowniaInvoiceOrderDraft,
} from "./FakturowniaInvoiceFormController";

export type { FakturowniaInvoiceOrderDraft };

type FakturowniaInvoiceFormProps = ComponentProps<
  typeof FakturowniaInvoiceFormController
>;

export function FakturowniaInvoiceForm(props: FakturowniaInvoiceFormProps) {
  return <FakturowniaInvoiceFormController {...props} />;
}
