import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  HStack,
  Input,
  Portal,
  Spinner,
  Text,
} from "@chakra-ui/react";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  toaster,
} from "@konfi/components";
import { SearchSelectOption } from "@konfi/types";
import { useCatalog } from "context/catalog";
import { useCustomers } from "context/customers";
import { useAsyncSearchSelect } from "hooks/useAsyncSearchSelect";
import { useEffect, useMemo, useState } from "react";

export default function LinkProductToCustomerDialog({
  productId,
  isOpen,
  onClose,
}: {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const { linkProductToCustomer } = useCatalog();
  const { searchCustomersInput } = useCustomers();
  const [selectedCustomerValue, setSelectedCustomerValue] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const searchers = useMemo(
    () => ({ customers: searchCustomersInput }),
    [searchCustomersInput],
  );

  const {
    collection,
    handleSearch,
    loading: optionsLoading,
    reset,
  } = useAsyncSearchSelect({
    isOpen,
    resourceKey: "customers",
    searchers,
  });

  const selectedCustomerId = selectedCustomerValue[0] ?? null;

  useEffect(() => {
    if (!isOpen) {
      setSelectedCustomerValue([]);
      setSearchTerm("");
      reset();
    }
  }, [isOpen, reset]);

  const handleLinkProductToCustomer = async () => {
    setLoading(true);
    if (!selectedCustomerId) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noCustomerSelected"),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    if (!productId) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noProductOrCustomerSelected"),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    try {
      await linkProductToCustomer(productId, selectedCustomerId);
      toaster.success({
        title: t("common.success"),
        description: t("admin.productLinkedToCustomerSuccess"),
        duration: 5000,
      });
      onClose();
    } catch (error) {
      console.error("handleLinkProductToCustomer error:", error);
      toaster.error({
        title: t("common.error"),
        description: t("admin.linkProductToCustomerFailed", {
          defaultValue: "Failed to link product to customer",
        }),
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  const noResults = !optionsLoading && collection.items.length === 0;

  return (
    <Dialog.Root open={isOpen}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Backdrop />
          <Dialog.Content>
            <Dialog.Header>
              {t("admin.linkProductToCustomerDialogTitle")}
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <SelectRoot
                collection={collection}
                value={selectedCustomerValue}
                onValueChange={(details) =>
                  setSelectedCustomerValue(details.value)
                }
                disabled={loading || optionsLoading}
                positioning={{ strategy: "fixed", hideWhenDetached: true }}
              >
                <SelectTrigger clearable>
                  <SelectValueText
                    placeholder={t("admin.selectCustomerPlaceholder") ?? ""}
                  />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <Box p="2">
                    <Input
                      size="sm"
                      value={searchTerm}
                      placeholder={t("admin.searchCustomerPlaceholder", {
                        defaultValue: "Search customers",
                      })}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSearchTerm(value);
                        handleSearch(value);
                      }}
                    />
                  </Box>
                  {optionsLoading ? (
                    <HStack
                      px="3"
                      py="2"
                      gap="2"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <Spinner size="xs" />
                      <Text fontSize="sm">
                        {t("common.loading", { defaultValue: "Loading" })}
                      </Text>
                    </HStack>
                  ) : noResults ? (
                    <Text
                      px="3"
                      py="2"
                      fontSize="sm"
                      color={{ base: "gray.600", _dark: "gray.300" }}
                    >
                      {t("common.noOptions", { defaultValue: "No options" })}
                    </Text>
                  ) : (
                    collection.items.map(
                      (option: SearchSelectOption<{ id: string }>) => (
                        <SelectItem key={option.value} item={option}>
                          {option.label}
                        </SelectItem>
                      ),
                    )
                  )}
                </SelectContent>
              </SelectRoot>
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                colorPalette={"primary"}
                mr={3}
                onClick={() => handleLinkProductToCustomer()}
                loading={loading}
                disabled={loading}
              >
                {t("admin.link")}
              </Button>
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
