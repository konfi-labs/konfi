import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
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
import { linkSupplierToAttributeOption } from "@konfi/firebase";
import { NestedMember, SearchSelectOption } from "@konfi/types";
import { useSuppliers } from "context/suppliers";
import { useAsyncSearchSelect } from "hooks/useAsyncSearchSelect";
import { useEffect, useMemo, useState } from "react";

export default function LinkSupplierToAttributeOptionDialog({
  attributeId,
  optionValue,
  optionLabel,
  isOpen,
  onClose,
  onSuccess,
  currentUser,
}: {
  attributeId: string | null;
  optionValue: string | null;
  optionLabel: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: NestedMember;
}) {
  const { t } = useT();
  const { searchSuppliersInput } = useSuppliers();
  const [selectedSupplierValue, setSelectedSupplierValue] = useState<string[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const searchers = useMemo(
    () => ({ suppliers: searchSuppliersInput }),
    [searchSuppliersInput],
  );

  const {
    collection,
    handleSearch,
    loading: optionsLoading,
    reset,
  } = useAsyncSearchSelect({
    isOpen,
    resourceKey: "suppliers",
    searchers,
  });

  const selectedSupplierId = selectedSupplierValue[0] ?? null;

  useEffect(() => {
    if (!isOpen) {
      setSelectedSupplierValue([]);
      setSearchTerm("");
      reset();
    }
  }, [isOpen, reset]);

  const handleLinkSupplierToOption = async () => {
    if (!selectedSupplierId || !attributeId || !optionValue) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noSupplierSelected"),
        duration: 5000,
      });
      return;
    }

    setLoading(true);
    try {
      await linkSupplierToAttributeOption(
        firestore,
        attributeId,
        optionValue,
        selectedSupplierId,
        currentUser,
      );
      toaster.success({
        title: t("common.success"),
        description: t("admin.supplierLinkedToOptionSuccess"),
        duration: 5000,
      });
      onSuccess();
      onClose();
    } catch (error) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.supplierLinkToOptionError"),
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
          <Dialog.Content>
            <Dialog.Header>
              {t("admin.linkSupplierToOptionDialogTitle")} "{optionLabel}"
            </Dialog.Header>
            <Dialog.Body>
              <SelectRoot
                collection={collection}
                value={selectedSupplierValue}
                onValueChange={(details) =>
                  setSelectedSupplierValue(details.value)
                }
                disabled={loading || optionsLoading}
                positioning={{ strategy: "fixed", hideWhenDetached: true }}
              >
                <SelectTrigger clearable>
                  <SelectValueText
                    placeholder={t("admin.selectSupplierPlaceholder") ?? ""}
                  />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <Box p="2">
                    <Input
                      size="sm"
                      value={searchTerm}
                      placeholder={t("admin.searchSupplierPlaceholder", {
                        defaultValue: "Search suppliers",
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
              <Button variant="outline" mr={3} onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                onClick={handleLinkSupplierToOption}
                loading={loading}
                colorPalette="primary"
              >
                {t("admin.link")}
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
