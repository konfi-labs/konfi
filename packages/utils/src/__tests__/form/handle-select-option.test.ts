import { SelectOption } from "@konfi/types";
import { handleSelectOption } from "../../form/handle-select-option";

describe("handleSelectOption", () => {
  it("should throw an error when the option is null", () => {
    const setFieldValue = vi.fn();
    expect(() => {
      handleSelectOption("fieldName", null, setFieldValue);
    }).toThrow("Option is null");
  });

  it("should set field value to option.object when object is present", () => {
    const setFieldValue = vi.fn();
    const option: SelectOption = {
      label: "Option Label",
      value: "option-value",
      object: { id: "obj-id", name: "Object Name" },
    };

    handleSelectOption("fieldName", option, setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", option.object);
  });

  it("should set field value to option.value when object is not present", () => {
    const setFieldValue = vi.fn();
    const option: SelectOption = {
      label: "Option Label",
      value: "option-value",
    };

    handleSelectOption("fieldName", option, setFieldValue);

    expect(setFieldValue).toHaveBeenCalledWith("fieldName", option.value);
  });
});
