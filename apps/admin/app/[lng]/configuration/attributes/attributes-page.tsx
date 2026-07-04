"use client";

import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import { firestore } from "@/lib/firebase/clientApp";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
import { ManagedTranslationStatusIndicator } from "@/components/translations/ManagedTranslationStatusIndicator";
import {
  Badge,
  Button,
  Flex,
  HStack,
  Separator,
  Skeleton,
  Spacer,
  Text,
} from "@chakra-ui/react";
import {
  AlertDialog,
  Checkbox,
  CustomHeading,
  DataTable,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
  toaster,
  Tooltip,
} from "@konfi/components";
import { create, db } from "@konfi/firebase";
import { Attribute, EntityType } from "@konfi/types";
import {
  ColumnDef,
  createColumnHelper,
  RowSelectionState,
} from "@tanstack/react-table";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const AttributesForm = dynamic(
  () => import("@/components/configuration/AttributesForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);
import type { AttributePrefillData } from "@/components/configuration/AttributesForm";
const AttributeDetailsDialog = dynamic(
  () => import("@/components/configuration/AttributeDetailsDialog"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const AttributesPage = () => {
  const { t, i18n } = useT();
  const { hasTenantPermission } = useAuth();
  const canCreateAttributes = hasTenantPermission("catalog.attributes.create");
  const canUpdateAttributes = hasTenantPermission("catalog.attributes.update");
  const searchParams = useSearchParams();
  const isCreateNewQuery =
    searchParams.get("type") === "create-new" || searchParams.has("create-new");
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const { attributes, removeAttribute, canRemoveAttribute, refreshAttributes } =
    useConfiguration();
  const columHelper = createColumnHelper<Attribute>();
  const data = useMemo<Attribute[] | undefined>(
    () =>
      attributes
        ? filterLocalFuseItems(attributes, searchKey ?? "", {
            keys: [
              { name: "name", weight: 0.7 },
              {
                getFn: (attribute) =>
                  attribute.options.map((option) => option.label),
                name: "options",
                weight: 0.3,
              },
            ],
            threshold: 0.36,
          })
        : undefined,
    [attributes, searchKey],
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { channel } = useChannels();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showDeactivateMultipleDialog, setShowDeactivateMultipleDialog] =
    useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [currentAttribute, setCurrentAttribute] = useState<Attribute | null>(
    null,
  );
  const [prefillData, setPrefillData] = useState<
    AttributePrefillData | undefined
  >(undefined);
  const tenantContext = useTenantContext();

  // Handle prefill query param - auto-open create form with prefilled data
  useEffect(() => {
    const prefillParam = searchParams.get("prefill");
    if (prefillParam) {
      try {
        const parsed = JSON.parse(
          decodeURIComponent(prefillParam),
        ) as AttributePrefillData;
        setPrefillData(parsed);
        setShowCreateForm(true);
      } catch (error) {
        console.error("Failed to parse prefill data:", error);
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (isCreateNewQuery) {
      setShowCreateForm(true);
    }
  }, [isCreateNewQuery]);

  useEffect(() => {
    setRowSelection({});
  }, [channel]);

  function scheduleAttributeRemovalChangeLog(attribute: Attribute) {
    const beforeSnapshot = createChangeSnapshot(attribute);
    if (!beforeSnapshot) {
      console.error("[AttributesPage] Failed to serialize removed attribute", {
        attributeId: attribute.id,
      });
      return;
    }

    void scheduleChangeLogAfterFormSubmit({
      entityType: EntityType.Attribute,
      entityId: attribute.id,
      before: beforeSnapshot,
    }).catch((error) => {
      console.error("[AttributesPage] Failed to schedule change log", {
        error,
        attributeId: attribute.id,
      });
    });
  }

  async function handleRemoveAttribute(id: string) {
    const attribute = data?.find((item) => item.id === id);
    const removalCheck = await canRemoveAttribute(id);
    if (removalCheck.result) {
      await removeAttribute(id);
      if (attribute) {
        scheduleAttributeRemovalChangeLog(attribute);
      }
    } else if (!removalCheck.result) {
      toaster.error({
        title: t("admin.cannotRemoveAttribute"),
        description:
          t("admin.dependentOn") + ": " + removalCheck.dependencies.join(", "),
      });
    }
  }

  async function handleRemoveAttributes() {
    const rowIds = Object.keys(rowSelection);
    if (isUndefined(data)) return;
    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      const attributeId = data[Number(rowId)]?.id;
      await handleRemoveAttribute(attributeId);
      setRowSelection({});
    }
  }

  async function handleDuplicateAttributes() {
    const rowIds = Object.keys(rowSelection);
    if (isUndefined(data)) return;
    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      const attribute = data[Number(rowId)];
      try {
        await create(
          firestore,
          attribute,
          db.doc(firestore, "/attributes", attribute.id),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
        setRowSelection({});
      } catch (error) {
        console.error(error);
        toaster.error({
          title: t("errors.somethingWentWrong"),
          description: `${error}`,
        });
        setRowSelection({});
      }
    }
  }

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(attribute: Attribute) {
    startTransition(() => {
      setCurrentAttribute(attribute);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(attribute: Attribute) {
    startTransition(() => {
      setCurrentAttribute(attribute);
      setShowDuplicateForm(true);
    });
  }

  function handleViewDetails(attribute: Attribute) {
    startTransition(() => {
      setCurrentAttribute(attribute);
      setShowDetailsDialog(true);
    });
  }

  function handleDeactivateOrderModalOpen(attribute: Attribute) {
    startTransition(() => {
      setCurrentAttribute(attribute);
      setShowDeactivateDialog(true);
    });
  }

  function handleDeactivateOrdersModalOpen() {
    startTransition(() => {
      setShowDeactivateMultipleDialog(true);
    });
  }

  const columns = useMemo<ColumnDef<Attribute, any>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            id={"select-all"}
            {...{
              checked: table.getIsAllRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler(),
            }}
          />
        ),
        cell: ({ row }) => (
          <div className="px-1">
            <Checkbox
              id={row.id}
              {...{
                checked: row.getIsSelected(),
                disabled: !row.getCanSelect(),
                onChange: row.getToggleSelectedHandler(),
              }}
            />
          </div>
        ),
      },
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("common.name"),
      }),
      columHelper.display({
        cell: (props) => (
          <Tooltip
            content={props.row.original.options
              .map((option) => option.label)
              .join(", ")}
          >
            <Text
              width={"150px"}
              overflow={"hidden"}
              whiteSpace={"nowrap"}
              textOverflow={"ellipsis"}
            >
              {props.row.original.options.map((option, index) =>
                index ? ", " + option.label : option.label,
              )}
            </Text>
          </Tooltip>
        ),
        header: t("attributes.options"),
      }),
      columHelper.display({
        cell: (props) => (
          <HStack>
            {props.row.original.calculated && (
              <Badge colorPalette={"orange"}>{t("admin.affectsPrice")}</Badge>
            )}
            {props.row.original.required && (
              <Badge colorPalette={"red"}>{t("admin.required")}</Badge>
            )}
            {props.row.original.format && (
              <Badge colorPalette={"primary"}>{t("admin.format")}</Badge>
            )}
            {props.row.original.pages && (
              <Badge colorPalette={"primary"}>{t("admin.pageCount")}</Badge>
            )}
          </HStack>
        ),
        header: t("attributes.properties"),
      }),
      columHelper.display({
        id: "translations",
        cell: (props) => (
          <ManagedTranslationStatusIndicator
            kind="attribute"
            source={props.row.original}
          />
        ),
        header: t("translations.managed.tableHeader", {
          defaultValue: "Translations",
        }),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("common.dateAdded"),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"}>
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"view-details"}
                onClick={() => handleViewDetails(props.row.original)}
              >
                <MaterialSymbol>visibility</MaterialSymbol>
                {t("admin.viewDetails")}
              </MenuItem>
              {canUpdateAttributes && (
                <MenuItem
                  value={"update-form"}
                  onClick={() => handleUpdateFormOpen(props.row.original)}
                >
                  <MaterialSymbol>edit_square</MaterialSymbol>
                  {t("admin.editAttribute")}
                </MenuItem>
              )}
              {canCreateAttributes && (
                <MenuItem
                  value={"duplicate-form"}
                  onClick={() => handleDuplicateFormOpen(props.row.original)}
                >
                  <MaterialSymbol>content_copy</MaterialSymbol>
                  {t("admin.copyAttribute")}
                </MenuItem>
              )}
              <MenuItem
                value={"deactivate-modal"}
                onClick={() =>
                  handleDeactivateOrderModalOpen(props.row.original)
                }
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeAttribute")}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [
      canCreateAttributes,
      canUpdateAttributes,
      channel,
      data,
      i18n.resolvedLanguage,
      t,
    ],
  );

  return (
    <>
      <CustomHeading
        heading={t("forms.headings.attributes")}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex gap={"2"}>
        <SearchInput
          placeholder={t("admin.searchAttributeByName")}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        {Object.keys(rowSelection).length > 0 && (
          <Flex pos={"relative"}>
            <Badge
              variant={"solid"}
              minW={"18px"}
              textAlign={"center"}
              colorPalette={"primary"}
              position={"absolute"}
              top={"-3px"}
              right={"-3px"}
              fontSize={"xs"}
              zIndex={"200"}
              px={"1.5"}
              py={"0"}
            >
              {Object.keys(rowSelection).length}
            </Badge>
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleDeactivateOrdersModalOpen()}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeAttributes")}
              </MenuItem>
            </Menu>
          </Flex>
        )}
        <Spacer />
        <RefreshButton
          label={t("admin.refreshAttributes")}
          refreshFunction={refreshAttributes}
        />
        {canCreateAttributes && (
          <Button
            colorPalette={"primary"}
            variant={"solid"}
            onClick={() => handleCreateFormOpen()}
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("common.add")}{" "}
            {t("ROUTES.attributes", { defaultValue: "Attribute" })}
          </Button>
        )}
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"uncontrolled"}
          enableRowSelection={{ rowSelection, setRowSelection }}
          t={t}
          i18n={i18n}
        />
      )}
      <AttributesForm
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
        prefillData={prefillData}
      />
      {currentAttribute && (
        <AttributesForm
          key={`update-${currentAttribute.id}`}
          attribute={currentAttribute}
          type={"UPDATE"}
          open={showUpdateForm}
          setOpen={setShowUpdateForm}
        />
      )}
      {currentAttribute && (
        <AttributesForm
          key={`duplicate-${currentAttribute.id}`}
          attribute={currentAttribute}
          type={"DUPLICATE"}
          open={showDuplicateForm}
          setOpen={setShowDuplicateForm}
        />
      )}
      <AlertDialog
        header={t("admin.confirmRemoveAttribute")}
        handle={() => handleRemoveAttribute(currentAttribute!.id)}
        open={showDeactivateDialog}
        setOpen={setShowDeactivateDialog}
        t={t}
      >
        <Text>{t("admin.removeAttributeDescription")}</Text>
      </AlertDialog>
      <AlertDialog
        header={t("admin.confirmRemoveAttributes")}
        handle={() => handleRemoveAttributes()}
        open={showDeactivateMultipleDialog}
        setOpen={setShowDeactivateMultipleDialog}
        t={t}
      >
        <Text>{t("admin.removeAttributesDescription")}</Text>
      </AlertDialog>
      <AttributeDetailsDialog
        attribute={currentAttribute}
        isOpen={showDetailsDialog}
        onClose={() => setShowDetailsDialog(false)}
      />
    </>
  );
};

export default AttributesPage;
