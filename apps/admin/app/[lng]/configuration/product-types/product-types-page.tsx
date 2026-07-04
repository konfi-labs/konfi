"use client";

import { getProductTypeAgentDraftForCreate } from "@/actions/product-type-agent";
import { scheduleChangeLogAfterFormSubmit } from "@/actions/change-log";
import { useT } from "@/i18n/client";
import { createChangeSnapshot } from "@/lib/change-snapshot";
import {
  Badge,
  Button,
  Flex,
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
} from "@konfi/components";
import { EntityType, ProductType } from "@konfi/types";
import {
  createColumnHelper,
  Row,
  RowSelectionState,
  Table,
} from "@tanstack/react-table";
import { useAuth } from "context/auth";
import { useChannels } from "context/channels";
import { useConfiguration } from "context/configuration";
import { isUndefined } from "es-toolkit";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const ProductTypesForm = dynamic(
  () => import("@/components/configuration/ProductTypesForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const ProductTypesPage = () => {
  const { t, i18n } = useT();
  const { hasTenantPermission } = useAuth();
  const canCreateProductTypes = hasTenantPermission(
    "catalog.productTypes.create",
  );
  const canUpdateProductTypes = hasTenantPermission(
    "catalog.productTypes.update",
  );
  const searchParams = useSearchParams();
  const agentRunId = searchParams.get("agentRunId");
  const isCreateNewQuery =
    Boolean(agentRunId) ||
    searchParams.get("type") === "create-new" ||
    searchParams.has("create-new");
  const { data: agentProductTypeResult } = useSWRImmutable(
    agentRunId ? ["product-type-agent-draft", agentRunId] : null,
    ([, currentAgentRunId]) =>
      getProductTypeAgentDraftForCreate(currentAgentRunId),
  );
  const prefillProductType = useMemo(
    () =>
      agentProductTypeResult?.success && agentProductTypeResult.readyForCreate
        ? agentProductTypeResult.productType
        : undefined,
    [agentProductTypeResult],
  );
  const {
    loadingProductTypes,
    productTypesPageIndex,
    setProductTypesPageIndex,
    productTypes,
    showProductTypes,
    productTypesCount,
    searchProductTypes,
    productTypesSearchResults,
    cleanProductTypesResults,
    refreshProductTypes,
    removeProductType,
    canRemoveProductType,
    dirtyRefreshProductTypes,
  } = useConfiguration();
  const columHelper = createColumnHelper<ProductType>();
  const data = useMemo<ProductType[] | undefined>(
    () =>
      productTypesSearchResults
        ? productTypesSearchResults?.map((productType) => productType)
        : productTypes?.map((productType) => productType),
    [productTypes, productTypesSearchResults],
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const { channel } = useChannels();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showRemoveMultiDialog, setShowRemoveMultiDialog] = useState(false);
  const [currentProductType, setCurrentProductType] =
    useState<ProductType | null>(null);

  useEffect(() => {
    setRowSelection({});
  }, [channel]);

  useEffect(() => {
    if (isCreateNewQuery) {
      setShowCreateForm(true);
    }
  }, [isCreateNewQuery]);

  function scheduleProductTypeRemovalChangeLog(productType: ProductType) {
    const beforeSnapshot = createChangeSnapshot(productType);
    if (!beforeSnapshot) {
      console.error(
        "[ProductTypesPage] Failed to serialize removed product type",
        {
          productTypeId: productType.id,
        },
      );
      return;
    }

    void scheduleChangeLogAfterFormSubmit({
      entityType: EntityType.ProductType,
      entityId: productType.id,
      before: beforeSnapshot,
    }).catch((error) => {
      console.error("[ProductTypesPage] Failed to schedule change log", {
        error,
        productTypeId: productType.id,
      });
    });
  }

  async function handleRemoveProductType(id: string | undefined) {
    if (!id) {
      console.error(
        "[ProductTypesPage] Cannot remove product type: missing id",
      );
      return;
    }

    const productType = data?.find((item) => item.id === id);
    const removalCheck = await canRemoveProductType(id);
    if (removalCheck.result) {
      await removeProductType(id);
      if (productType) {
        scheduleProductTypeRemovalChangeLog(productType);
      }
    } else if (!removalCheck.result) {
      toaster.error({
        title: t("admin.cannotRemoveProductType"),
        description:
          t("admin.dependentOn") + ": " + removalCheck.dependencies.join(", "),
      });
    }
  }

  async function handleRemoveProductTypes() {
    const rowIds = Object.keys(rowSelection);
    if (isUndefined(data)) return;
    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      const productTypeId = data[Number(rowId)]?.id;
      await handleRemoveProductType(productTypeId);
      setRowSelection({});
    }
  }

  function handleUpdateFormOpen(productType: ProductType) {
    startTransition(() => {
      setCurrentProductType(productType);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(productType: ProductType) {
    startTransition(() => {
      setCurrentProductType(productType);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(productType: ProductType) {
    startTransition(() => {
      setCurrentProductType(productType);
      setShowRemoveDialog(true);
    });
  }

  function handleRemoveMulti() {
    startTransition(() => {
      setShowRemoveMultiDialog(true);
    });
  }

  const columns = useMemo(
    () => [
      {
        id: "select",
        header: ({ table }: { table: Table<ProductType> }) => (
          <Checkbox
            id={"select-all"}
            {...{
              checked: table.getIsAllRowsSelected(),
              onChange: table.getToggleAllRowsSelectedHandler(),
            }}
          />
        ),
        cell: ({ row }: { row: Row<ProductType> }) => (
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
        // meta: {
        //   isSortable: true,
        //   sortingFn: orderProductTypesBy
        // }
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("common.dateAdded"),
        // meta: {
        //   isSortable: true,
        //   sortingFn: orderProductTypesBy
        // }
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"}>
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              {canUpdateProductTypes && (
                <MenuItem
                  value={"update-form"}
                  onClick={() => handleUpdateFormOpen(props.row.original)}
                >
                  <MaterialSymbol>edit_square</MaterialSymbol>
                  {t("productTypes.actions.edit")}
                </MenuItem>
              )}
              {canCreateProductTypes && (
                <MenuItem
                  value={"duplicate-form"}
                  onClick={() => handleDuplicateFormOpen(props.row.original)}
                >
                  <MaterialSymbol>content_copy</MaterialSymbol>
                  {t("productTypes.actions.copy")}
                </MenuItem>
              )}
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleRemove(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("productTypes.actions.remove")}
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
      canCreateProductTypes,
      canUpdateProductTypes,
      channel,
      data,
      i18n.resolvedLanguage,
      t,
    ],
  );

  return (
    <>
      <CustomHeading
        heading={t("forms.headings.productTypes")}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex gap={"2"}>
        <SearchInput
          placeholder={t("admin.searchProductTypeByName")}
          searchFn={searchProductTypes}
          cleanFn={cleanProductTypesResults}
          searchResults={productTypesSearchResults}
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
                onClick={() => handleRemoveMulti()}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeProductTypes")}
              </MenuItem>
            </Menu>
          </Flex>
        )}
        <Spacer />
        <RefreshButton
          label={t("common.refresh") + " " + t("admin.productTypes")}
          refreshFunction={refreshProductTypes}
        />
        {canCreateProductTypes && (
          <Button
            colorPalette={"primary"}
            onClick={() => setShowCreateForm(true)}
            variant={"solid"}
          >
            <MaterialSymbol>edit</MaterialSymbol>
            {t("common.add")} {t("admin.productType")}
          </Button>
        )}
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={
            productTypesSearchResults ? "uncontrolled" : "controlled"
          }
          show={showProductTypes}
          itemsCount={
            productTypesSearchResults
              ? productTypesSearchResults.length
              : productTypesCount
          }
          loading={loadingProductTypes}
          refreshFlag={dirtyRefreshProductTypes}
          defaultPageIndex={productTypesPageIndex}
          setPageIndex={setProductTypesPageIndex}
          enablePageSizeSelection
          enableRowSelection={{ rowSelection, setRowSelection }}
          t={t}
          i18n={i18n}
        />
      )}
      <ProductTypesForm
        prefillProductType={prefillProductType}
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <ProductTypesForm
        productType={currentProductType!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <ProductTypesForm
        productType={currentProductType!}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("admin.confirmRemoveProductType")}
        handle={() => handleRemoveProductType(currentProductType?.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>{t("admin.removeProductTypeDescription")}</Text>
      </AlertDialog>
      <AlertDialog
        header={t("admin.confirmRemoveProductTypes")}
        handle={() => handleRemoveProductTypes()}
        open={showRemoveMultiDialog}
        setOpen={setShowRemoveMultiDialog}
        t={t}
      >
        <Text>{t("admin.removeProductTypesDescription")}</Text>
      </AlertDialog>
    </>
  );
};

export default ProductTypesPage;
