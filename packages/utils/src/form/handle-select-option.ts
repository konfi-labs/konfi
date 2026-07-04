import { isNull } from "es-toolkit";
import { SelectOption } from "@konfi/types";
import { UseFormSetValue, FieldValues } from "react-hook-form";

export function handleSelectOption(
  fieldName: string,
  option: SelectOption | null,
  setFieldValue:
    | UseFormSetValue<FieldValues>
    | ((
        field: string,
        value: unknown,
        shouldValidate?: boolean | undefined,
      ) => void),
) {
  if (isNull(option)) throw "Option is null";
  if (option.object) setFieldValue(fieldName, option.object);
  else setFieldValue(fieldName, option.value);
}
