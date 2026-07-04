"use client";

import { useT } from "@/i18n/client";
import {
  Button,
  CloseButton,
  Dialog,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  toaster,
} from "@konfi/components";
import { useCustomers } from "context/customers";
import { useEffect, useMemo, useState } from "react";
import type { CustomerGroupOption } from "./customer-groups";

export default function LinkCustomerToGroupDialog({
  customerId,
  isOpen,
  onClose,
  customerGroupOptions,
  alreadyAssignedGroupIds,
  onSuccess,
}: {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  customerGroupOptions: CustomerGroupOption[] | undefined;
  alreadyAssignedGroupIds: string[];
  onSuccess?: () => void;
}) {
  const { t } = useT();
  const { linkCustomerToCustomerGroup } = useCustomers();

  const options = useMemo(() => {
    return (
      customerGroupOptions?.filter(
        (option) => !alreadyAssignedGroupIds.includes(option.value),
      ) ?? []
    );
  }, [customerGroupOptions, alreadyAssignedGroupIds]);

  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  const [selectedGroupId, setSelectedGroupId] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      const initialValue = options[0]?.value;
      setSelectedGroupId(initialValue ? [initialValue] : []);
    } else {
      setSelectedGroupId([]);
    }
  }, [isOpen, options]);

  const [loading, setLoading] = useState(false);

  const handleLinkCustomerToGroup = async () => {
    setLoading(true);
    const targetGroupId = selectedGroupId[0];
    if (!targetGroupId) {
      toaster.error({
        title: t("common.error"),
        description: t("customers.noGroupSelected", {
          defaultValue: "No customer group selected",
        }),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    if (!customerId) {
      toaster.error({
        title: t("common.error"),
        description: t("errors.somethingWentWrong"),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    try {
      await linkCustomerToCustomerGroup(customerId, targetGroupId);
      toaster.success({
        title: t("common.success"),
        description: t("customers.groupLinkedSuccess", {
          defaultValue: "Customer has been added to the group successfully.",
        }),
        duration: 5000,
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error"),
        description: t("customers.groupLinkFailed", {
          defaultValue: "Failed to add customer to the group.",
        }),
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(details) => !details.open && onClose()}
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              {t("customers.linkToGroupDialogTitle", {
                defaultValue: "Add Customer to Group",
              })}
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              {options.length === 0 ? (
                t("customers.allGroupsAssigned", {
                  defaultValue:
                    "This customer is already in all available groups.",
                })
              ) : (
                <SelectRoot
                  collection={collection}
                  value={selectedGroupId}
                  onValueChange={(details) => setSelectedGroupId(details.value)}
                  disabled={loading}
                  positioning={{ strategy: "fixed", hideWhenDetached: true }}
                >
                  <SelectTrigger>
                    <SelectValueText
                      placeholder={
                        t("customers.selectGroupPlaceholder", {
                          defaultValue: "Select customer group…",
                        }) ?? ""
                      }
                    />
                  </SelectTrigger>
                  <SelectContent portalled={false}>
                    {collection.items.map((option) => (
                      <SelectItem key={option.value} item={option}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              {options.length > 0 && (
                <Button
                  colorPalette={"primary"}
                  mr={3}
                  onClick={() => handleLinkCustomerToGroup()}
                  loading={loading}
                  disabled={loading}
                >
                  {t("common.add", { defaultValue: "Add" })}
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={onClose}
                loading={loading}
                disabled={loading}
              >
                {t("common.cancel")}
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
