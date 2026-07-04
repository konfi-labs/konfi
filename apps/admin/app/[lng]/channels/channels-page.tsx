"use client";

import { createStorefrontEditorLaunchUrlAction } from "@/actions/storefront-editor";
import { ChannelForm } from "@/components/channels/ChannelForm";
import { useT } from "@/i18n/client";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import {
  Button,
  Flex,
  Separator,
  Skeleton,
  Spacer,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  ButtonLink,
  CustomHeading,
  DataTable,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
  toaster,
} from "@konfi/components";
import { Channel } from "@konfi/types";
import { ADMIN_DESKTOP_SETTINGS_CHANNELS } from "@konfi/utils";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useChannels } from "context/channels";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const ChannelsPage = () => {
  const { t, i18n } = useT();
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const { channels, refreshChannels, removeChannel } = useChannels();
  const searchParams = useSearchParams();
  const editChannelId = searchParams.get("edit");
  const isCreateNewQuery =
    searchParams.get("type") === "create-new" || searchParams.has("create-new");
  const data = useMemo<Channel[] | undefined>(
    () =>
      channels
        ? filterLocalFuseItems(channels, searchKey ?? "", {
            keys: ["name"],
            threshold: 0.34,
          })
        : undefined,
    [channels, searchKey],
  );
  const columHelper = createColumnHelper<Channel>();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null);
  const [openingStorefrontChannelId, setOpeningStorefrontChannelId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (isCreateNewQuery) {
      setShowCreateDialog(true);
    }
  }, [isCreateNewQuery]);

  useEffect(() => {
    if (!editChannelId || !channels) return;

    const channelToEdit = channels.find(
      (channel) => channel.id === editChannelId,
    );
    if (!channelToEdit) return;

    setCurrentChannel(channelToEdit);
    setShowUpdateDialog(true);
  }, [channels, editChannelId]);

  function handleCreate() {
    startTransition(() => {
      setShowCreateDialog(true);
    });
  }

  function handleUpdate(channel: Channel) {
    startTransition(() => {
      setCurrentChannel(channel);
      setShowUpdateDialog(true);
    });
  }

  function handleDuplicate(channel: Channel) {
    startTransition(() => {
      setCurrentChannel(channel);
      setShowDuplicateDialog(true);
    });
  }

  function handleRemove(channel: Channel) {
    startTransition(() => {
      setCurrentChannel(channel);
      setShowRemoveDialog(true);
    });
  }

  async function handleOpenStorefrontEditor(channel: Channel) {
    setOpeningStorefrontChannelId(channel.id);

    try {
      const result = await createStorefrontEditorLaunchUrlAction({
        channelId: channel.id,
        locale: i18n.resolvedLanguage,
      });

      window.open(result.url, "_blank", "noopener,noreferrer")?.focus();
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("channels.storefrontEditor.openFailedTitle", {
          defaultValue: "Could not open storefront editor",
        }),
        description:
          error instanceof Error
            ? error.message
            : t("errors.somethingWentWrong", {
                defaultValue: "Something went wrong",
              }),
        duration: 3000,
      });
    } finally {
      setOpeningStorefrontChannelId(null);
    }
  }

  const columns = useMemo<ColumnDef<Channel, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("channels.name", { defaultValue: "Name" }),
      }),
      columHelper.accessor("currency", {
        cell: (info) => info.getValue(),
        header: t("channels.currency", { defaultValue: "Currency" }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("channels.dateAdded", { defaultValue: "Date Added" }),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Menu
            icon={<MaterialSymbol>menu_open</MaterialSymbol>}
            ariaLabel={t("table.actions", { defaultValue: "Actions" })}
          >
            <MenuItem
              value={"edit-modal"}
              onClick={() => handleUpdate(props.row.original)}
            >
              <MaterialSymbol>edit</MaterialSymbol>
              {t("channels.editChannel", { defaultValue: "Edit Channel" })}
            </MenuItem>
            <MenuItem
              value={"duplicate-modal"}
              onClick={() => handleDuplicate(props.row.original)}
            >
              <MaterialSymbol>content_copy</MaterialSymbol>
              {t("channels.duplicateChannel", {
                defaultValue: "Duplicate Channel",
              })}
            </MenuItem>
            <MenuItem
              value={"storefront-editor"}
              disabled={openingStorefrontChannelId === props.row.original.id}
              onClick={() =>
                void handleOpenStorefrontEditor(props.row.original)
              }
            >
              <MaterialSymbol>storefront</MaterialSymbol>
              {openingStorefrontChannelId === props.row.original.id
                ? t("channels.storefrontEditor.opening", {
                    defaultValue: "Opening Storefront Editor",
                  })
                : t("channels.storefrontEditor.open", {
                    defaultValue: "Customize Storefront",
                  })}
            </MenuItem>
            <MenuItem
              value={"deactivate-modal"}
              onClick={() => handleRemove(props.row.original)}
              color="fg.error"
              _hover={{ bg: "bg.error", color: "fg.error" }}
            >
              <MaterialSymbol>delete</MaterialSymbol>
              {t("channels.removeChannel", { defaultValue: "Remove Channel" })}
            </MenuItem>
          </Menu>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [data, i18n.resolvedLanguage, openingStorefrontChannelId, t],
  );

  return (
    <>
      <CustomHeading
        heading={t("channels.title", { defaultValue: "Channels" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex>
        <SearchInput
          placeholder={t("channels.searchChannelByName", {
            defaultValue: "Search channel by name...",
          })}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />{" "}
        <RefreshButton
          label={t("channels.refreshChannels", {
            defaultValue: "Refresh Channels",
          })}
          refreshFunction={refreshChannels}
        />{" "}
        <ButtonLink
          ml={"2"}
          href={ADMIN_DESKTOP_SETTINGS_CHANNELS}
          colorPalette="primary"
          variant="outline"
          ariaLabel={t("settings.orderFolders", {
            defaultValue: "Order Folders",
          })}
        >
          <MaterialSymbol>folder_open</MaterialSymbol>
          {t("settings.orderFolders", { defaultValue: "Order Folders" })}
        </ButtonLink>
        <Button
          ml={"2"}
          colorPalette={"primary"}
          variant={"solid"}
          onClick={() => handleCreate()}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("channels.addChannel", { defaultValue: "Add Channel" })}
        </Button>
      </Flex>
      <Separator my={"6"} />
      {data && data.length > 0 && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"uncontrolled"}
          t={t}
          i18n={i18n}
        />
      )}
      <ChannelForm
        type={"CREATE"}
        open={showCreateDialog}
        setOpen={setShowCreateDialog}
      />
      <ChannelForm
        channel={currentChannel!}
        type={"UPDATE"}
        open={showUpdateDialog}
        setOpen={setShowUpdateDialog}
      />
      <ChannelForm
        channel={currentChannel!}
        type={"DUPLICATE"}
        open={showDuplicateDialog}
        setOpen={setShowDuplicateDialog}
      />
      <AlertDialog
        header={t("channels.confirmRemoveChannel", {
          defaultValue: "Are you sure you want to remove the channel?",
        })}
        handle={() => removeChannel(currentChannel!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>
          {t("channels.deactivateChannelDescription", {
            defaultValue:
              "After deactivation, the channel will only be visible under the filter - inactive.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
};

export default ChannelsPage;
