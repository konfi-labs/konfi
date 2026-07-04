import { bleedType, FormData, SelectOption, sourceSizing } from "@konfi/types";
import type { TFunction } from "i18next";
import { vi } from "vitest";
import {
  attributeForm,
  b2bForm,
  categoryForm,
  channelForm,
  checkoutForm,
  createCampaignForm,
  createPromotionForm,
  customerForm,
  heroForm,
  imposeForm,
  memberForm,
  orderForm,
  productForm,
  productTypeForm,
  quoteForm,
  storeSettingsForm,
  trackingForm,
  updateCampaignForm,
  updateOrderFormStore,
  updatePromotionForm,
  updateQuoteForm,
  warehouseForm,
} from "../forms";

describe("Forms", () => {
  const t: Mock<TFunction> = vi.fn((key: string) => key) as Mock<TFunction>;

  it("should generate heroForm correctly", () => {
    const formData: FormData = heroForm(t, "prefix");
    expect(formData).toBeDefined();
  });

  it("should generate storeSettingsForm correctly", () => {
    const formData: FormData = storeSettingsForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("buying.enabled");
  });

  it("should generate channelForm correctly", () => {
    const warehousesAsOptions: SelectOption[] = [
      { label: "Warehouse 1", value: "1" },
    ];
    const formData: FormData = channelForm(warehousesAsOptions, t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[2].options).toBe(warehousesAsOptions);
  });

  it("should generate attributeForm correctly", () => {
    const formData: FormData = attributeForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[1].fields[0].name).toBe("label");
  });

  it("should generate productTypeForm correctly", () => {
    const formData: FormData = productTypeForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("id");
  });

  it("should generate productForm correctly", () => {
    const formData: FormData = productForm(t, "prefix");
    expect(formData).toBeDefined();
  });

  it("should generate customerForm correctly", () => {
    const formData: FormData = customerForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
  });

  it("should generate categoryForm correctly", () => {
    const formData: FormData = categoryForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
    expect(formData.sections[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "parentId",
          searchFor: "categories",
          searchResult: "id",
          type: "search",
        }),
      ]),
    );
  });

  it("should generate orderForm correctly", () => {
    const carriedOutByOptions: SelectOption[] = [
      { label: "User 1", value: "1" },
    ];
    const formData: FormData = orderForm(carriedOutByOptions, [], [], t);
    expect(formData).toBeDefined();
    expect(formData.sections[15].fields[1].options).toBe(carriedOutByOptions);
  });

  it("should include mailLink field in orderForm", () => {
    const carriedOutByOptions: SelectOption[] = [
      { label: "User 1", value: "1" },
    ];
    const formData: FormData = orderForm(carriedOutByOptions, [], [], t);

    // Find the section with mailLink field (section with addresses and notes)
    const addressSection = formData.sections.find((section) =>
      section.fields.some((field) => field.name === "mailLink"),
    );
    expect(addressSection).toBeDefined();

    // Check that mailLink field exists and has correct properties
    const mailLinkField = addressSection?.fields.find(
      (field) => field.name === "mailLink",
    );
    expect(mailLinkField).toBeDefined();
    expect(mailLinkField?.isRequired).toBe(false);
    expect(mailLinkField?.placeholder).toBe("forms.placeholders.mailLink");
    expect(mailLinkField?.label).toBe("forms.labels.mailLink");
  });

  it("should include sendStatusChangeEmail field in orderForm contact section", () => {
    const formData: FormData = orderForm([], [], [], t);

    const contactSection = formData.sections.find((section) =>
      section.fields.some((field) => field.name === "contact.email"),
    );
    expect(contactSection).toBeDefined();

    const sendStatusChangeEmailField = contactSection?.fields.find(
      (field) => field.name === "sendStatusChangeEmail",
    );
    expect(sendStatusChangeEmailField).toBeDefined();
    expect(sendStatusChangeEmailField?.type).toBe("checkbox");
    expect(sendStatusChangeEmailField?.placeholder).toBe(
      "forms.placeholders.sendStatusChangeEmail",
    );
  });

  it("should generate updateOrderFormStore correctly", () => {
    const carriedOutByOptions: SelectOption[] = [
      { label: "User 1", value: "1" },
    ];
    const formData: FormData = updateOrderFormStore(carriedOutByOptions, t);
    expect(formData).toBeDefined();
    expect(formData.sections[11].fields[1].options).toBe(carriedOutByOptions);
  });

  it("should include mailLink field in updateOrderFormStore", () => {
    const carriedOutByOptions: SelectOption[] = [
      { label: "User 1", value: "1" },
    ];
    const formData: FormData = updateOrderFormStore(carriedOutByOptions, t);

    // Find the section with mailLink field
    const sectionWithMailLink = formData.sections.find((section) =>
      section.fields.some((field) => field.name === "mailLink"),
    );
    expect(sectionWithMailLink).toBeDefined();

    // Check that mailLink field exists and has correct properties
    const mailLinkField = sectionWithMailLink?.fields.find(
      (field) => field.name === "mailLink",
    );
    expect(mailLinkField).toBeDefined();
    expect(mailLinkField?.isRequired).toBe(false);
    expect(mailLinkField?.label).toBe("forms.labels.mailLink");
  });

  it("should generate trackingForm correctly", () => {
    const formData: FormData = trackingForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("number");
  });

  it("should generate quoteForm correctly", () => {
    const formData: FormData = quoteForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("customer");
  });

  it("should generate updateQuoteForm correctly", () => {
    const formData: FormData = updateQuoteForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("customer");
  });

  it("should generate memberForm correctly", () => {
    const formData: FormData = memberForm([], t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
  });

  it("should generate warehouseForm correctly", () => {
    const formData: FormData = warehouseForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
  });

  it("should generate checkoutForm correctly", () => {
    const formData: FormData = checkoutForm(t);
    expect(formData).toBeDefined();
    expect(formData.allowMultiple).toBe(true);
    expect(
      formData.sections.every((section) => section.isDefaultExpanded === true),
    ).toBe(true);
    expect(formData.sections[0].fields[0].name).toBe("contact.name");
    expect(
      formData.sections
        .flatMap((section) => section.fields)
        .some((field) => field.name === "invoiceNotes"),
    ).toBe(true);
  });

  it("should hide invoice checkout fields when invoice enablement is disabled", () => {
    const formData: FormData = checkoutForm(t, undefined, {
      invoiceEnabled: false,
    });
    const fields = formData.sections.flatMap((section) => section.fields);

    expect(fields.some((field) => field.name === "invoice")).toBe(false);
    expect(fields.some((field) => field.name === "invoiceNotes")).toBe(false);
    expect(
      formData.sections.some((section) => section.dependsOn === "invoice"),
    ).toBe(false);
    expect(fields.some((field) => field.name === "billing.companyName")).toBe(
      false,
    );
  });

  it("should not expose AI bleed as an impose form selection option", () => {
    const formData = imposeForm(t);
    const bleedTypeField = formData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "bleedType");

    expect(bleedTypeField?.options).toBeDefined();
    expect(
      bleedTypeField?.options?.some(
        (option) => option.value === bleedType.DIFFERENTIAL_DIFFUSION,
      ),
    ).toBe(false);
  });

  it("should expose source sizing options for non-generated bleed workflows", () => {
    const formData = imposeForm(t);
    const sourceSizingField = formData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "sourceSizing");

    expect(sourceSizingField?.options).toBeDefined();
    expect(sourceSizingField?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: sourceSizing.PRESERVE_ORIGINAL_SIZE,
        }),
        expect.objectContaining({
          value: sourceSizing.FIT_OUTPUT_BOX,
        }),
      ]),
    );
  });

  it("should opt manual street fields into Google address autocomplete", () => {
    const customerFormData = customerForm(t);
    const orderFormData = orderForm([], [], [], t);
    const checkoutFormData = checkoutForm(t);
    const b2bFormData = b2bForm(t);

    expect(
      customerFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "street")?.type,
    ).toBe("addressAutocomplete");

    expect(
      orderFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "billing.street")?.type,
    ).toBe("addressAutocomplete");

    expect(
      orderFormData.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.name === "shipping.street")
        .every((field) => field.type === "addressAutocomplete"),
    ).toBe(true);

    expect(
      checkoutFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "billing.street")?.type,
    ).toBe("addressAutocomplete");

    expect(
      checkoutFormData.sections
        .flatMap((section) => section.fields)
        .filter((field) => field.name === "shipping.street")
        .every((field) => field.type === "addressAutocomplete"),
    ).toBe(true);

    expect(
      b2bFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "billing.street")?.type,
    ).toBe("addressAutocomplete");
  });

  it("should expose invoice recipient fields on invoice billing address forms", () => {
    const customerFormData = customerForm(t);
    const orderFormData = orderForm([], [], [], t);
    const checkoutFormData = checkoutForm(t);

    const customerRecipientToggle = customerFormData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "invoiceRecipientEnabled");
    const orderRecipientToggle = orderFormData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "billing.invoiceRecipientEnabled");
    const checkoutRecipientToggle = checkoutFormData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "billing.invoiceRecipientEnabled");
    const orderRecipientRole = orderFormData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "billing.invoiceRecipientRole");
    const orderRecipientRoleDescription = orderFormData.sections
      .flatMap((section) => section.fields)
      .find(
        (field) => field.name === "billing.invoiceRecipientRoleDescription",
      );
    const orderRecipientNip = orderFormData.sections
      .flatMap((section) => section.fields)
      .find((field) => field.name === "billing.invoiceRecipientNip");

    expect(customerRecipientToggle?.type).toBe("checkbox");
    expect(customerRecipientToggle?.dependencies).toEqual([
      { name: "type", value: "BILLING", watchNested: true },
    ]);
    expect(orderRecipientToggle?.type).toBe("checkbox");
    expect(checkoutRecipientToggle?.type).toBe("checkbox");
    expect(orderRecipientRole?.type).toBe("select");
    expect(orderRecipientRole?.options?.map((option) => option.value)).toEqual([
      "recipient",
      "additionalBuyer",
      "payer",
      "jst",
      "vatGroupMember",
      "employee",
      "other",
    ]);
    expect(orderRecipientRoleDescription?.dependencies).toEqual([
      { name: "billing.invoiceRecipientEnabled", value: "true" },
      { name: "billing.invoiceRecipientRole", value: "other" },
    ]);
    expect(orderRecipientNip?.getCustomerDataModal).toBe(true);

    expect(
      orderFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "billing.invoiceRecipientName")
        ?.dependsOn,
    ).toBe("billing.invoiceRecipientEnabled");
    expect(
      checkoutFormData.sections
        .flatMap((section) => section.fields)
        .find((field) => field.name === "billing.invoiceRecipientName")
        ?.dependsOn,
    ).toBe("billing.invoiceRecipientEnabled");
  });

  it("should generate createPromotionForm correctly", () => {
    const productOptions: SelectOption[] = [{ label: "Product 1", value: "1" }];
    const categoryOptions: SelectOption[] = [
      { label: "Category 1", value: "1" },
    ];
    const campaignOptions: SelectOption[] = [
      { label: "Campaign 1", value: "1" },
    ];
    const formData: FormData = createPromotionForm(
      productOptions,
      categoryOptions,
      campaignOptions,
      t,
    );
    expect(formData).toBeDefined();
    expect(formData.sections[2].fields[4].options).toBe(productOptions);

    const oneTimeField = formData.sections[0].fields.find(
      (field) => field.name === "isOneTime",
    );
    expect(oneTimeField).toBeDefined();
    expect(oneTimeField?.type).toBe("checkbox");

    const minimumOrderValueField = formData.sections[0].fields.find(
      (field) => field.name === "minimumOrderValue",
    );
    expect(minimumOrderValueField).toBeDefined();
    expect(minimumOrderValueField?.type).toBe("number");
  });

  it("should generate updatePromotionForm correctly", () => {
    const productOptions: SelectOption[] = [{ label: "Product 1", value: "1" }];
    const categoryOptions: SelectOption[] = [
      { label: "Category 1", value: "1" },
    ];
    const campaignOptions: SelectOption[] = [
      { label: "Campaign 1", value: "1" },
    ];
    const formData: FormData = updatePromotionForm(
      productOptions,
      categoryOptions,
      campaignOptions,
      t,
    );
    expect(formData).toBeDefined();

    const oneTimeField = formData.sections[0].fields.find(
      (field) => field.name === "isOneTime",
    );
    expect(oneTimeField).toBeDefined();
    expect(oneTimeField?.type).toBe("checkbox");

    const minimumOrderValueField = formData.sections[0].fields.find(
      (field) => field.name === "minimumOrderValue",
    );
    expect(minimumOrderValueField).toBeDefined();
    expect(minimumOrderValueField?.type).toBe("number");
  });

  it("should generate createCampaignForm correctly", () => {
    const formData: FormData = createCampaignForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
  });

  it("should generate updateCampaignForm correctly", () => {
    const formData: FormData = updateCampaignForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("name");
  });

  it("should generate b2bForm correctly", () => {
    const formData: FormData = b2bForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("businessDescription");
  });

  it("should generate imposeForm correctly", () => {
    const formData: FormData = imposeForm(t);
    expect(formData).toBeDefined();
    expect(formData.sections[0].fields[0].name).toBe("files");
  });
});
