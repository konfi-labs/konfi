"use client";

import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import {
  Button,
  createListCollection,
  Field,
  Select,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { CustomDialog, DatePickerInput, toaster } from "@konfi/components";
import { ShiftRequest, ShiftRequestStatus, ShiftType } from "@konfi/types";
import { useConfiguration } from "context/configuration";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { Dispatch, SetStateAction, useState } from "react";

interface ShiftRequestFormProps {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  onSuccess?: () => void;
}

export default function ShiftRequestForm({
  open,
  setOpen,
  onSuccess,
}: ShiftRequestFormProps) {
  const { t, i18n } = useT();
  const { members } = useConfiguration();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    requestType: "DAY_OFF" as
      | "SHIFT_SWAP"
      | "DAY_OFF"
      | "SHIFT_CHANGE"
      | "OTHER",
    originalDate: "",
    requestedDate: "",
    requestedShiftType: ShiftType.DAY,
    swapWithMemberId: "",
    reason: "",
  });

  const requestTypesCollection = createListCollection({
    items: [
      {
        label: t("scheduling.requests.requestTypes.DAY_OFF"),
        value: "DAY_OFF",
      },
      {
        label: t("scheduling.requests.requestTypes.SHIFT_SWAP"),
        value: "SHIFT_SWAP",
      },
      {
        label: t("scheduling.requests.requestTypes.SHIFT_CHANGE"),
        value: "SHIFT_CHANGE",
      },
      { label: t("scheduling.requests.requestTypes.OTHER"), value: "OTHER" },
    ],
  });

  const membersCollection = createListCollection({
    items: members?.map((m) => ({ label: m.name, value: m.id })) || [],
  });

  const shiftTypesCollection = createListCollection({
    items: Object.values(ShiftType).map((type) => ({
      label: t(`scheduling.shiftTypes.${type}`),
      value: type,
    })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // In a real implementation, get current member from auth context
      const currentMember = members?.[0];
      if (!currentMember) {
        toaster.error({
          title: t("scheduling.requests.error"),
          description: t("scheduling.requests.noMemberFound"),
        });
        return;
      }

      const request: Omit<ShiftRequest, "id"> = {
        name: `${currentMember.name} - ${formData.requestType}`,
        memberId: currentMember.id,
        memberName: currentMember.name,
        requestType: formData.requestType,
        originalDate: formData.originalDate || undefined,
        requestedDate: formData.requestedDate || undefined,
        requestedShiftType: formData.requestedShiftType,
        swapWithMemberId: formData.swapWithMemberId || undefined,
        swapWithMemberName: members?.find(
          (m) => m.id === formData.swapWithMemberId,
        )?.name,
        reason: formData.reason,
        status: ShiftRequestStatus.PENDING,
        active: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: { id: currentMember.id, name: currentMember.name },
        updatedBy: { id: currentMember.id, name: currentMember.name },
      };

      const requestsRef = collection(firestore, "shiftRequests");
      await addDoc(requestsRef, request);

      toaster.success({
        title: t("scheduling.requests.requestSent"),
        description: t("scheduling.requests.requestSentDesc"),
      });

      // Reset form
      setFormData({
        requestType: "DAY_OFF",
        originalDate: "",
        requestedDate: "",
        requestedShiftType: ShiftType.DAY,
        swapWithMemberId: "",
        reason: "",
      });

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Error submitting shift request:", error);
      toaster.error({
        title: t("errors.somethingWentWrong"),
        description: t("scheduling.requests.failedToSubmit"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <CustomDialog
      open={open}
      setOpen={setOpen}
      header={t("scheduling.requests.newRequest")}
      size={"md"}
    >
      <form onSubmit={handleSubmit}>
        <VStack gap={4} align={"stretch"}>
          <Field.Root>
            <Field.Label>{t("scheduling.requests.requestType")}</Field.Label>
            <Select.Root
              collection={requestTypesCollection}
              value={[formData.requestType]}
              onValueChange={(e) =>
                setFormData({
                  ...formData,
                  requestType: e.value[0] as ShiftRequest["requestType"],
                })
              }
              size="sm"
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
                  {requestTypesCollection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Select.Root>
          </Field.Root>

          {formData.requestType === "DAY_OFF" && (
            <Field.Root>
              <Field.Label>{t("scheduling.requests.dayOffDate")}</Field.Label>
              <DatePickerInput
                value={formData.requestedDate}
                onValueChange={(requestedDate) =>
                  setFormData({ ...formData, requestedDate })
                }
                locale={i18n.resolvedLanguage}
                triggerLabel={t("scheduling.requests.dayOffDate")}
                inputProps={{
                  required: true,
                  "aria-label": t("scheduling.requests.dayOffDate"),
                }}
              />
            </Field.Root>
          )}

          {formData.requestType === "SHIFT_SWAP" && (
            <>
              <Field.Root>
                <Field.Label>
                  {t("scheduling.requests.originalDate")}
                </Field.Label>
                <DatePickerInput
                  value={formData.originalDate}
                  onValueChange={(originalDate) =>
                    setFormData({ ...formData, originalDate })
                  }
                  locale={i18n.resolvedLanguage}
                  triggerLabel={t("scheduling.requests.originalDate")}
                  inputProps={{
                    required: true,
                    "aria-label": t("scheduling.requests.originalDate"),
                  }}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>{t("scheduling.requests.swapWith")}</Field.Label>
                <Select.Root
                  collection={membersCollection}
                  value={
                    formData.swapWithMemberId ? [formData.swapWithMemberId] : []
                  }
                  onValueChange={(e) =>
                    setFormData({
                      ...formData,
                      swapWithMemberId: e.value[0] || "",
                    })
                  }
                  size="sm"
                >
                  <Select.HiddenSelect />
                  <Select.Control>
                    <Select.Trigger>
                      <Select.ValueText
                        placeholder={t("scheduling.requests.selectMember")}
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
              <Field.Root>
                <Field.Label>{t("scheduling.requests.swapDate")}</Field.Label>
                <DatePickerInput
                  value={formData.requestedDate}
                  onValueChange={(requestedDate) =>
                    setFormData({ ...formData, requestedDate })
                  }
                  locale={i18n.resolvedLanguage}
                  triggerLabel={t("scheduling.requests.swapDate")}
                  inputProps={{
                    required: true,
                    "aria-label": t("scheduling.requests.swapDate"),
                  }}
                />
              </Field.Root>
            </>
          )}

          {formData.requestType === "SHIFT_CHANGE" && (
            <>
              <Field.Root>
                <Field.Label>{t("scheduling.requests.changeDate")}</Field.Label>
                <DatePickerInput
                  value={formData.originalDate}
                  onValueChange={(originalDate) =>
                    setFormData({ ...formData, originalDate })
                  }
                  locale={i18n.resolvedLanguage}
                  triggerLabel={t("scheduling.requests.changeDate")}
                  inputProps={{
                    required: true,
                    "aria-label": t("scheduling.requests.changeDate"),
                  }}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>
                  {t("scheduling.requests.newShiftType")}
                </Field.Label>
                <Select.Root
                  collection={shiftTypesCollection}
                  value={[formData.requestedShiftType]}
                  onValueChange={(e) =>
                    setFormData({
                      ...formData,
                      requestedShiftType: e.value[0] as ShiftType,
                    })
                  }
                  size="sm"
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
                      {shiftTypesCollection.items.map((item) => (
                        <Select.Item item={item} key={item.value}>
                          {item.label}
                          <Select.ItemIndicator />
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Positioner>
                </Select.Root>
              </Field.Root>
            </>
          )}

          <Field.Root>
            <Field.Label>{t("scheduling.requests.reason")}</Field.Label>
            <Textarea
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
              required
              rows={4}
            />
          </Field.Root>

          <Button type={"submit"} colorPalette={"primary"} loading={loading}>
            {t("scheduling.requests.submit")}
          </Button>
        </VStack>
      </form>
    </CustomDialog>
  );
}
