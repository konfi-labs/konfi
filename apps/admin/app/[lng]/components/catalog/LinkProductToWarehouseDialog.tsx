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
import { useCatalog } from "context/catalog";
import { useConfiguration } from "context/configuration";
import { useEffect, useMemo, useState } from "react";

export default function LinkProductToWarehouseDialog({
  productId,
  isOpen,
  onClose,
}: {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const { linkProductToWarehouse } = useCatalog();
  const { warehousesAsOptions } = useConfiguration();
  const options = useMemo(() => {
    return warehousesAsOptions?.map((warehouse) => ({
      value: warehouse.value,
      label: warehouse.label,
    }));
  }, [warehousesAsOptions]);
  const collection = useMemo(
    () => createListCollection({ items: options ?? [] }),
    [options],
  );
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string[]>(
    () => {
      const initialValue = options?.[0]?.value;
      return initialValue ? [initialValue] : [];
    },
  );

  useEffect(() => {
    if (!options || options.length === 0) {
      setSelectedWarehouseId([]);
      return;
    }
    setSelectedWarehouseId((current) => {
      if (
        current.length === 0 ||
        !options.some((option) => option.value === current[0])
      ) {
        return [options[0].value];
      }
      return current;
    });
  }, [options]);
  const [loading, setLoading] = useState(false);

  const handleLinkProductToWarehouse = async () => {
    setLoading(true);
    const targetWarehouseId = selectedWarehouseId[0];
    if (!targetWarehouseId) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noWarehouseSelected", {
          defaultValue: "No warehouse selected",
        }),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    if (!productId) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noProductOrWarehouseSelected", {
          defaultValue: "No product or warehouse selected",
        }),
        duration: 5000,
      });
      setLoading(false);
      return;
    }

    try {
      await linkProductToWarehouse(productId, targetWarehouseId);
      toaster.success({
        title: t("common.success"),
        description: t("admin.productLinkedToWarehouseSuccess", {
          defaultValue: "Product linked to warehouse successfully",
        }),
        duration: 5000,
      });
      onClose();
    } catch (error) {
      console.error("handleLinkProductToWarehouse error:", error);
      toaster.error({
        title: t("common.error"),
        description: t("admin.linkProductToWarehouseFailed", {
          defaultValue: "Failed to link product to warehouse",
        }),
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!options || options.length === 0) return null;

  return (
    <Dialog.Root open={isOpen}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              {t("admin.linkProductToWarehouseDialogTitle", {
                defaultValue: "Link Product to Warehouse",
              })}
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <SelectRoot
                collection={collection}
                value={selectedWarehouseId}
                onValueChange={(details) =>
                  setSelectedWarehouseId(details.value)
                }
                disabled={loading || collection.items.length === 0}
                positioning={{ strategy: "fixed", hideWhenDetached: true }}
              >
                <SelectTrigger>
                  <SelectValueText
                    placeholder={
                      t("admin.selectWarehousePlaceholder", {
                        defaultValue: "Select warehouse...",
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
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                colorPalette={"primary"}
                mr={3}
                onClick={() => handleLinkProductToWarehouse()}
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
