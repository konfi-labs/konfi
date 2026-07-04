import { SearchSelectOption } from "@konfi/types";
import { handleSelectAsyncOption } from "../../form/async-handle-select-option";

describe("handleSelectAsyncOption", () => {
  it("should throw an error when the option is null", () => {
    const setFieldValue = vi.fn();
    expect(() => {
      handleSelectAsyncOption(null, "fieldName", "id", setFieldValue);
    }).toThrow("Option is undefined");
  });

  it("should throw an error when searchResult is undefined", () => {
    const setFieldValue = vi.fn();
    const option: SearchSelectOption<{ id: string }> = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id" },
    };

    expect(() => {
      handleSelectAsyncOption(option, "fieldName", undefined, setFieldValue);
    }).toThrow("SearchResult is undefined");
  });

  it('should set field value to object.id when searchResult is "id"', () => {
    const setFieldValue = vi.fn();
    const option: SearchSelectOption<{ id: string }> = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id" },
    };

    handleSelectAsyncOption(option, "fieldName", "id", setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", "obj-id");
  });

  it('should set field value to [object.id] when searchResult is "array"', () => {
    const setFieldValue = vi.fn();
    const option: SearchSelectOption<{ id: string }> = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id" },
    };

    handleSelectAsyncOption(option, "fieldName", "array", setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", ["obj-id"]);
  });

  it("should set field value to option.value when option.__isNew__ is true", () => {
    const setFieldValue = vi.fn();
    const option: SearchSelectOption<{ id: string }> = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id" },
      __isNew__: true,
    };

    handleSelectAsyncOption(option, "fieldName", "object", setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", "option-value");
  });

  it("should set field value to option.object by default", () => {
    const setFieldValue = vi.fn();
    const option: SearchSelectOption<{ id: string }> = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id" },
    };

    handleSelectAsyncOption(option, "fieldName", "object", setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", option.object);
  });
});
