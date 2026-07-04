import { isUndefined } from "es-toolkit";
import { SearchSelectOption } from "@konfi/types";

export async function promiseOptions(
  inputValue: string,
  searchFor: string | undefined,
  searchFn:
    | {
        [x: string]: (searchKey: string) => Promise<any[] | undefined | void>;
      }
    | undefined,
): Promise<SearchSelectOption<{ id: string }>[]> {
  try {
    if (isUndefined(searchFor)) throw "Search for is not provided";
    if (isUndefined(searchFn)) throw "Search functions is not provided";
    const results = await searchFn[searchFor](inputValue);
    if (Array.isArray(results)) {
      return results.map((result) => ({
        label: result.name,
        value: result.id,
        object: result,
      }));
    } else throw "Search function did not return an array";
  } catch (error) {
    console.error(error);
    return [];
  }
}
