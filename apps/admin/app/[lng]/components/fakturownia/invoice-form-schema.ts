import * as yup from "yup";
import type {
  InvoiceKind,
  Invoice_status,
} from "@konfi/fakturownia/out/client/models";
import { PAYMENT_TYPES } from "@/lib/fakturownia/payment-type";
import type {
  InvoiceFormValues,
  RecipientRoleOptionValue,
} from "./invoice-form-types";
import { RECIPIENT_ROLE_OPTIONS } from "./invoice-form-types";

export const optionalEmailSchema = () =>
  yup
    .string()
    .transform((value: string | undefined, originalValue: unknown) => {
      if (typeof originalValue !== "string") {
        return value;
      }

      const trimmedValue = originalValue.trim();
      return trimmedValue === "" ? undefined : trimmedValue;
    })
    .email()
    .optional();

export const invoiceSchema: yup.ObjectSchema<InvoiceFormValues> = yup
  .object({
    kind: yup.mixed<InvoiceKind>().required(),
    number: yup.string().optional(),
    issueDate: yup.string().required(),
    sellDate: yup.string().required(),
    paymentType: yup.string().required(),
    paymentTerm: yup.string().required(),
    paymentTo: yup.string().optional(),
    customPaymentType: yup
      .string()
      .optional()
      .when("paymentType", (paymentType, schema) => {
        if (typeof paymentType !== "string") {
          return schema.optional();
        }
        const option = PAYMENT_TYPES.find((item) => item.value === paymentType);
        if (!option?.requiresCustom) {
          return schema.optional();
        }
        if (option.presetCustomValue) {
          return schema.optional();
        }
        return schema.trim().required();
      }),
    status: yup.mixed<Invoice_status>().required(),
    paidAmount: yup.number().min(0).required(),
    currency: yup.string().required(),
    language: yup.string().required(),
    warehouseId: yup.string().optional(),
    departmentId: yup.string().optional(),
    priceListId: yup.string().optional(),
    clientId: yup.string().optional(),
    oid: yup.string().optional(),
    notes: yup.string().optional().default(""),
    splitPayment: yup.boolean().default(false),
    sendEmail: yup.boolean().default(false),
    buyerCompany: yup.boolean().default(true),
    buyerName: yup
      .string()
      .when(["kind", "buyerCompany"], ([kind, buyerCompany], schema) => {
        const kindValue = Array.isArray(kind) ? kind[0] : kind;
        const isBuyerCompanyValue =
          typeof buyerCompany === "boolean" ? buyerCompany : true;
        if (kindValue === "receipt") {
          return schema.optional();
        }
        if (isBuyerCompanyValue) {
          return schema.required();
        }
        return schema.optional();
      }),
    buyerFirstName: yup
      .string()
      .when(["kind", "buyerCompany"], ([kind, buyerCompany], schema) => {
        const kindValue = Array.isArray(kind) ? kind[0] : kind;
        const isBuyerCompanyValue =
          typeof buyerCompany === "boolean" ? buyerCompany : true;
        if (kindValue === "receipt") {
          return schema.optional();
        }
        if (!isBuyerCompanyValue) {
          return schema.optional();
        }
        return schema.optional();
      }),
    buyerLastName: yup
      .string()
      .when(["kind", "buyerCompany"], ([kind, buyerCompany], schema) => {
        const kindValue = Array.isArray(kind) ? kind[0] : kind;
        const isBuyerCompanyValue =
          typeof buyerCompany === "boolean" ? buyerCompany : true;
        if (kindValue === "receipt") {
          return schema.optional();
        }
        if (!isBuyerCompanyValue) {
          return schema.required();
        }
        return schema.optional();
      }),
    buyerTaxNo: yup.string().optional(),
    buyerEmail: yup.string().email().optional().trim(),
    buyerPhone: yup.string().optional(),
    buyerStreet: yup.string().optional(),
    buyerPostalCode: yup.string().optional(),
    buyerCity: yup.string().optional(),
    buyerCountry: yup.string().optional(),
    buyerPerson: yup.string().optional(),
    recipientId: yup.string().optional(),
    recipientEnabled: yup.boolean().default(false),
    recipientRole: yup
      .mixed<RecipientRoleOptionValue>()
      .oneOf(RECIPIENT_ROLE_OPTIONS.map((option) => option.value))
      .default("recipient")
      .required(),
    recipientRoleDescription: yup
      .string()
      .default("")
      .when(
        ["recipientEnabled", "recipientRole"],
        ([recipientEnabled, recipientRole], schema) => {
          const isRecipientEnabled =
            typeof recipientEnabled === "boolean" ? recipientEnabled : false;
          const roleValue = Array.isArray(recipientRole)
            ? recipientRole[0]
            : recipientRole;

          if (isRecipientEnabled && roleValue === "other") {
            return schema.trim().required();
          }

          return schema.optional();
        },
      ),
    recipientName: yup.string().optional(),
    recipientStreet: yup.string().optional(),
    recipientPostalCode: yup.string().optional(),
    recipientCity: yup.string().optional(),
    recipientCountry: yup.string().optional(),
    recipientTaxNo: yup.string().optional(),
    recipientEmail: optionalEmailSchema(),
    recipientPhone: yup.string().optional(),
    recipientNote: yup.string().optional(),
    sellerPerson: yup.string().optional(),
    sellerName: yup.string().optional(),
    sellerTaxNo: yup.string().optional(),
    sellerStreet: yup.string().optional(),
    sellerPostalCode: yup.string().optional(),
    sellerCity: yup.string().optional(),
    sellerCountry: yup.string().optional(),
    place: yup.string().optional(),
    issuerId: yup.number().optional(),
    positions: yup
      .array()
      .of(
        yup.object({
          name: yup.string().required(),
          description: yup.string().optional(),
          quantity: yup.number().moreThan(0).required(),
          unit: yup.string().required(),
          priceNet: yup.number().min(0).required(),
          priceGross: yup.number().min(0).required(),
          tax: yup.string().required(),
          totalNet: yup.number().optional(),
          totalGross: yup.number().optional(),
          productId: yup.string().optional(),
          discountPercent: yup.number().min(0).max(100).optional(),
        }),
      )
      .min(1)
      .required(),
  })
  .required() as yup.ObjectSchema<InvoiceFormValues>;
