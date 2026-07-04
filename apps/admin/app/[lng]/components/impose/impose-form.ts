import { ImposeSchema } from "@konfi/utils";
import type { UseFormReturn } from "react-hook-form";
import type { InferType } from "yup";

export type ImposeFormValues = InferType<typeof ImposeSchema>;
export type ImposeFormMethods = UseFormReturn<ImposeFormValues>;

export function setImposeFormValue<TField extends keyof ImposeFormValues>(
  methods: ImposeFormMethods,
  field: TField,
  value: ImposeFormValues[TField],
) {
  methods.setValue(field as never, value as never, {
    shouldDirty: true,
    shouldValidate: true,
  });
}
