"use client";

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
  CustomHeading,
  DataTable,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { Warehouse } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useConfiguration } from "context/configuration";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { startTransition, useEffect, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

const WarehouseForm = dynamic(
  () => import("@/components/configuration/WarehouseForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const WarehousesPage = () => {
  const { t, i18n } = useT();
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const { warehouses, removeWarehouse, refreshWarehouses } = useConfiguration();
  const columHelper = createColumnHelper<Warehouse>();
  const searchParams = useSearchParams();
  const editWarehouseId = searchParams.get("edit");
  const isCreateNewQuery =
    searchParams.get("type") === "create-new" || searchParams.has("create-new");
  const data = useMemo<Warehouse[] | undefined>(
    () =>
      warehouses
        ? filterLocalFuseItems(warehouses, searchKey ?? "", {
            keys: ["name"],
            threshold: 0.34,
          })
        : undefined,
    [warehouses, searchKey],
  );
  const [showCreateForm, setShowCreateForm] = useState(isCreateNewQuery);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [currentWarehouse, setCurrentWarehouse] = useState<Warehouse | null>(
    null,
  );
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);

  useEffect(() => {
    if (isCreateNewQuery) {
      setShowCreateForm(true);
    }
  }, [isCreateNewQuery]);

  useEffect(() => {
    if (!editWarehouseId || !warehouses) return;

    const warehouseToEdit = warehouses.find(
      (warehouse) => warehouse.id === editWarehouseId,
    );
    if (!warehouseToEdit) return;

    setCurrentWarehouse(warehouseToEdit);
    setShowUpdateForm(true);
  }, [editWarehouseId, warehouses]);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(warehouse: Warehouse) {
    startTransition(() => {
      setCurrentWarehouse(warehouse);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(warehouse: Warehouse) {
    startTransition(() => {
      setCurrentWarehouse(warehouse);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(warehouse: Warehouse) {
    startTransition(() => {
      setCurrentWarehouse(warehouse);
      setShowRemoveDialog(true);
    });
  }

  const columns = useMemo<ColumnDef<Warehouse, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("warehouses.name"),
      }),
      columHelper.accessor("createdAt", {
        cell: (info) =>
          info.getValue().toDate().toLocaleDateString(i18n.resolvedLanguage),
        header: t("warehouses.dateAdded"),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"} gap={"1"} onClick={(e) => e.stopPropagation()}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/configuration/warehouses/${props.row.original.id}/fulfillment-requests`}
              icon={"assignment_add"}
              ariaLabel={t("admin.fulfillmentRequests")}
              tooltipLabel={t("admin.manageFulfillmentRequests")}
              prefetch={false}
            />
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/configuration/warehouses/${props.row.original.id}/stock`}
              icon={"inventory_2"}
              ariaLabel={t("admin.productStock")}
              tooltipLabel={t("admin.manageProductStock")}
              prefetch={false}
            />
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/configuration/warehouses/${props.row.original.id}/attribute-stock`}
              icon={"category"}
              ariaLabel={t("admin.materialStock")}
              tooltipLabel={t("admin.manageMaterialStock")}
              prefetch={false}
            />
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value={"update-form"}
                onClick={() => handleUpdateFormOpen(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("admin.editWarehouse")}
              </MenuItem>
              <MenuItem
                value={"duplicate-form"}
                onClick={() => handleDuplicateFormOpen(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("admin.copyWarehouse")}
              </MenuItem>
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleRemove(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeWarehouse")}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  );

  return (
    <>
      <CustomHeading
        heading={t("admin.warehouse")}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex>
        <SearchInput
          placeholder={t("admin.searchWarehouseByName")}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("common.refresh") + " " + t("admin.warehouses")}
          refreshFunction={refreshWarehouses}
        />
        <Button
          onClick={() => handleCreateFormOpen()}
          ml={"2"}
          variant={"solid"}
          colorPalette={"primary"}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("common.add")} {t("admin.warehouse")}
        </Button>
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={"uncontrolled"}
          t={t}
          i18n={i18n}
        />
      )}
      <WarehouseForm
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <WarehouseForm
        warehouse={currentWarehouse!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <WarehouseForm
        warehouse={currentWarehouse!}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("admin.confirmRemoveWarehouse")}
        handle={() => removeWarehouse(currentWarehouse!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>{t("admin.removeWarehouseDescription")}</Text>
      </AlertDialog>
    </>
  );
};

export default WarehousesPage;
