import { SearchResult, SearchSelectOption } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import { FieldValues, UseFormSetValue } from "react-hook-form";

export function handleSelectAsyncOption(
  option: SearchSelectOption<{ id: string }> | null,
  fieldName: string,
  searchResult: SearchResult | undefined,
  setFieldValue:
    | UseFormSetValue<FieldValues>
    | ((
        field: string,
        value: unknown,
        shouldValidate?: boolean | undefined,
      ) => void),
) {
  if (isNull(option)) throw "Option is undefined";
  if (isUndefined(searchResult)) throw "SearchResult is undefined";

  if (searchResult === "id") setFieldValue(fieldName, option.object.id);
  else if (searchResult === "array")
    setFieldValue(fieldName, [option.object.id]);
  else if (option["__isNew__"]) setFieldValue(fieldName, option.value);
  else setFieldValue(fieldName, option.object);
}
