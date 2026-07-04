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
import { useChannels } from "context/channels";
import { useEffect, useMemo, useState } from "react";

export default function LinkProductToChannelDialog({
  productId,
  isOpen,
  onClose,
}: {
  productId: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const { linkProductToChannel } = useCatalog();
  const { channels, getChannelById, channel } = useChannels();
  const options = useMemo(() => {
    return channels
      ?.filter((_channel) => _channel.id !== channel?.id)
      .map((_channel) => ({
        value: _channel.id,
        label: _channel.name,
      }));
  }, [channels, channel]);
  const collection = useMemo(
    () => createListCollection({ items: options ?? [] }),
    [options],
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string[]>(() => {
    const initialValue = options?.[0]?.value;
    return initialValue ? [initialValue] : [];
  });

  useEffect(() => {
    if (!options || options.length === 0) {
      setSelectedChannelId([]);
      return;
    }
    setSelectedChannelId((current) => {
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

  const handleLinkProductToChannel = async () => {
    setLoading(true);
    const targetChannelId = selectedChannelId[0];
    if (!targetChannelId || getChannelById(targetChannelId) === undefined) {
      toaster.error({
        title: t("common.error"),
        description: t("admin.noChannelSelected"),
        duration: 5000,
      });
      setLoading(false);
      return;
    } else {
      if (productId && targetChannelId) {
        await linkProductToChannel(productId, targetChannelId);
        toaster.success({
          title: t("common.success"),
          description: t("admin.productLinkedToChannelSuccess"),
          duration: 5000,
        });
        onClose();
      } else {
        toaster.error({
          title: t("common.error"),
          description: t("admin.noProductOrChannelSelected"),
          duration: 5000,
        });
      }
      setLoading(false);
    }
    setLoading(false);
  };

  if (!options || options.length === 0) return null;

  return (
    <Dialog.Root open={isOpen}>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              {t("admin.linkProductToChannelDialogTitle")}
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <Dialog.Body>
              <SelectRoot
                collection={collection}
                value={selectedChannelId}
                onValueChange={(details) => setSelectedChannelId(details.value)}
                disabled={loading || collection.items.length === 0}
                positioning={{ strategy: "fixed", hideWhenDetached: true }}
              >
                <SelectTrigger>
                  <SelectValueText
                    placeholder={t("admin.selectChannelPlaceholder") ?? ""}
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
                onClick={() => handleLinkProductToChannel()}
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
