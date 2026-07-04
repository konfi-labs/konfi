"use client";

import {
  Checkbox,
  Field,
  Input,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  createListCollection,
} from "@chakra-ui/react";
import { B2BInquiry, B2BInquiryStatus } from "@konfi/types";
import { TFunction } from "i18next";
import { Dispatch, SetStateAction } from "react";
import { B2BWorkflowForm } from "./b2b-workflow-model";

type OptionItem = {
  label: string;
  value: string;
};

type WorkflowFieldProps = {
  form: B2BWorkflowForm;
  setForm: Dispatch<SetStateAction<B2BWorkflowForm | null>>;
  t: TFunction;
};

export function StatusOwnerFields({
  form,
  setForm,
  statusCollection,
  membersCollection,
  t,
}: WorkflowFieldProps & {
  statusCollection: ReturnType<typeof createListCollection<OptionItem>>;
  membersCollection: ReturnType<typeof createListCollection<OptionItem>>;
}) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
      <Field.Root required>
        <Field.Label>{t("b2b.workflow.status")}</Field.Label>
        <Select.Root
          collection={statusCollection}
          value={[form.status]}
          onValueChange={(event) =>
            setForm({ ...form, status: event.value[0] as B2BInquiryStatus })
          }
          name="b2bStatus"
        >
          <Select.HiddenSelect />
          <Select.Control>
            <Select.Trigger>
              <Select.ValueText />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Select.Positioner>
            <Select.Content>
              {statusCollection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("b2b.workflow.owner")}</Field.Label>
        <Select.Root
          collection={membersCollection}
          value={form.ownerId ? [form.ownerId] : []}
          onValueChange={(event) =>
            setForm({ ...form, ownerId: event.value[0] ?? "" })
          }
          name="b2bOwner"
        >
          <Select.HiddenSelect />
          <Select.Control>
            <Select.Trigger>
              <Select.ValueText
                placeholder={t("b2b.workflow.ownerPlaceholder", {
                  defaultValue: "Select owner",
                })}
              />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Select.Positioner>
            <Select.Content>
              {membersCollection.items.map((item) => (
                <Select.Item item={item} key={item.value}>
                  {item.label}
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Positioner>
        </Select.Root>
      </Field.Root>
    </SimpleGrid>
  );
}

export function CustomerFields({ form, setForm, t }: WorkflowFieldProps) {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
      <Field.Root required>
        <Field.Label>{t("forms.labels.name")}</Field.Label>
        <Input
          name="b2bCustomerName"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>{t("forms.labels.person")}</Field.Label>
        <Input
          name="b2bPersonName"
          value={form.personName}
          onChange={(event) =>
            setForm({ ...form, personName: event.target.value })
          }
        />
      </Field.Root>
      <Field.Root required={form.status === B2BInquiryStatus.ACCEPTED}>
        <Field.Label>{t("forms.labels.email")}</Field.Label>
        <Input
          name="b2bCustomerEmail"
          type="email"
          autoComplete="email"
          spellCheck={false}
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>{t("forms.labels.nip")}</Field.Label>
        <Input
          name="b2bNip"
          value={form.nip}
          onChange={(event) => setForm({ ...form, nip: event.target.value })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>{t("forms.labels.discount")}</Field.Label>
        <Input
          name="b2bDiscount"
          type="number"
          min={0}
          max={100}
          inputMode="decimal"
          value={form.discount}
          onChange={(event) =>
            setForm({ ...form, discount: event.target.value })
          }
        />
      </Field.Root>
    </SimpleGrid>
  );
}

export function PaymentFields({
  form,
  inquiry,
  setForm,
  t,
}: WorkflowFieldProps & { inquiry: B2BInquiry | null }) {
  return (
    <Stack gap="3">
      <Checkbox.Root
        checked={form.allowedBankPayments}
        onCheckedChange={(event) =>
          setForm({ ...form, allowedBankPayments: !!event.checked })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>{t("forms.helperTexts.allowBankPayments")}</Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={form.allowedOnPickupPayments}
        onCheckedChange={(event) =>
          setForm({ ...form, allowedOnPickupPayments: !!event.checked })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>
          {t("forms.helperTexts.allowOnPickupPayments")}
        </Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={form.allowedDefferedPayments}
        onCheckedChange={(event) =>
          setForm({ ...form, allowedDefferedPayments: !!event.checked })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>
          {t("forms.helperTexts.allowDeferredPayments")}
        </Checkbox.Label>
      </Checkbox.Root>
      <Checkbox.Root
        checked={form.sendAcceptanceEmail}
        disabled={Boolean(inquiry?.acceptanceEmailSentAt)}
        onCheckedChange={(event) =>
          setForm({ ...form, sendAcceptanceEmail: !!event.checked })
        }
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>
          {t("b2b.workflow.sendAcceptanceEmail", {
            defaultValue: "Send acceptance email on approval",
          })}
        </Checkbox.Label>
      </Checkbox.Root>
    </Stack>
  );
}

export function ProductAndReasonFields({
  form,
  setForm,
  t,
}: WorkflowFieldProps) {
  return (
    <>
      <Field.Root>
        <Field.Label>{t("b2b.workflow.linkedProducts")}</Field.Label>
        <Textarea
          name="b2bLinkedProducts"
          value={form.linkedProductsIds}
          minH="140px"
          onChange={(event) =>
            setForm({ ...form, linkedProductsIds: event.target.value })
          }
        />
        <Field.HelperText>
          {t("b2b.workflow.linkedProductsHelper", {
            defaultValue: "Enter one product ID per line.",
          })}
        </Field.HelperText>
      </Field.Root>

      {form.status === B2BInquiryStatus.REJECTED ? (
        <Field.Root>
          <Field.Label>{t("b2b.workflow.rejectionReason")}</Field.Label>
          <Textarea
            name="b2bRejectionReason"
            value={form.rejectionReason}
            onChange={(event) =>
              setForm({ ...form, rejectionReason: event.target.value })
            }
          />
        </Field.Root>
      ) : null}
    </>
  );
}
