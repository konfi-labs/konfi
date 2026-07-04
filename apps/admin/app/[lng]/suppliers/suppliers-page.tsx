"use client";

import NoteForm from "@/components/notes/NoteForm";
import { useT } from "@/i18n/client";
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
  Empty,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { NoteEntityType, Supplier } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useSuppliers } from "context/suppliers";
import { isEmpty } from "es-toolkit/compat";
import dynamic from "next/dynamic";
import { startTransition, useCallback, useMemo, useState } from "react";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const SupplierForm = dynamic(
  () => import("@/components/suppliers/SupplierForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const SuppliersPage = () => {
  const { t, i18n } = useT();
  const {
    loadingSuppliers,
    setPageIndex,
    suppliers,
    suppliersCount,
    showSuppliers,
    searchSuppliers,
    suppliersSearchResults,
    deactivateSupplier,
    cleanSuppliersSearchResults,
    refreshSuppliers,
  } = useSuppliers();
  const data = useMemo<Supplier[] | undefined>(
    () =>
      suppliersSearchResults
        ? suppliersSearchResults?.map((supplier) => supplier)
        : suppliers?.map((supplier) => supplier),
    [suppliers, suppliersSearchResults],
  );

  const [searchValue, setSearchValue] = useState("");
  const [supplierForm, setSupplierForm] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>("");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier>();
  const [supplierFormType, setSupplierFormType] = useState<
    "CREATE" | "UPDATE" | "DUPLICATE"
  >("CREATE");
  const [isAlertDialogOpen, setIsAlertDialogOpen] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string>("");
  const [noteForm, setNoteForm] = useState(false);

  const openSupplierFormUpdate = useCallback(
    (id: string) => {
      setSelectedSupplierId(id);
      setSelectedSupplier(data?.find((supplier) => supplier.id === id));
      setSupplierFormType("UPDATE");
      setSupplierForm(true);
    },
    [data],
  );

  const openSupplierFormDuplicate = useCallback(
    (id: string) => {
      setSelectedSupplierId(id);
      setSelectedSupplier(data?.find((supplier) => supplier.id === id));
      setSupplierFormType("DUPLICATE");
      setSupplierForm(true);
    },
    [data],
  );

  const openSupplierFormCreate = useCallback(() => {
    setSelectedSupplierId("");
    setSelectedSupplier(undefined);
    setSupplierFormType("CREATE");
    setSupplierForm(true);
  }, []);

  const handleDeleteSupplier = useCallback((id: string) => {
    setSelectedSupplierId(id);
    setIsAlertDialogOpen(true);
  }, []);

  const handleSearch = (value: string) => {
    setSearchValue(value);
    if (value === "") {
      cleanSuppliersSearchResults();
    } else {
      startTransition(() => {
        searchSuppliers(value);
      });
    }
  };

  const handleNoteForm = (supplierId: string) => {
    setSelectedNote(supplierId);
    setNoteForm(true);
  };

  const columnHelper = createColumnHelper<Supplier>();

  const columns = useMemo<ColumnDef<Supplier, any>[]>(() => {
    return [
      columnHelper.accessor("companyName", {
        header: t("suppliers.companyName", { defaultValue: "Company Name" }),
        cell: (info) => info.getValue(),
      }),
      columnHelper.accessor("contactPerson", {
        header: t("suppliers.contactPerson", {
          defaultValue: "Contact Person",
        }),
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.accessor("email", {
        header: t("suppliers.email", { defaultValue: "Email" }),
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.accessor("phone", {
        header: t("suppliers.phone", { defaultValue: "Phone" }),
        cell: (info) => info.getValue() || "-",
      }),
      columnHelper.accessor("isPreferred", {
        header: t("suppliers.preferred", { defaultValue: "Preferred" }),
        cell: (info) => (
          <MaterialSymbol
            fontSize={20}
            color={
              info.getValue()
                ? { base: "success.500", _dark: "success.400" }
                : { base: "gray.400", _dark: "gray.600" }
            }
          >
            {info.getValue() ? "star" : "star_border"}
          </MaterialSymbol>
        ),
      }),
      columnHelper.accessor("rating", {
        header: t("suppliers.rating", { defaultValue: "Rating" }),
        cell: (info) => {
          const rating = info.getValue();
          if (!rating) return "-";
          return (
            <Flex alignItems="center" gap={1}>
              <Text>{rating}</Text>
              <MaterialSymbol
                fontSize={16}
                color={{ base: "yellow.500", _dark: "yellow.300" }}
              >
                star
              </MaterialSymbol>
            </Flex>
          );
        },
      }),
      {
        id: "actions",
        header: t("suppliers.actions.preview", { defaultValue: "Actions" }),
        cell: ({ row }: { row: { original: Supplier } }) => (
          <Menu
            icon={<MaterialSymbol>menu_open</MaterialSymbol>}
            ariaLabel={t("table.actions", { defaultValue: "Actions" })}
          >
            <MenuItem
              value="edit"
              onClick={() => openSupplierFormUpdate(row.original.id)}
            >
              <MaterialSymbol m={0} fontSize={24}>
                edit
              </MaterialSymbol>
              {t("suppliers.actions.edit", { defaultValue: "Edit" })}
            </MenuItem>
            <MenuItem
              value="duplicate"
              onClick={() => openSupplierFormDuplicate(row.original.id)}
            >
              <MaterialSymbol m={0} fontSize={24}>
                content_copy
              </MaterialSymbol>
              {t("suppliers.actions.duplicate", { defaultValue: "Duplicate" })}
            </MenuItem>
            <MenuItem
              value="note"
              onClick={() => handleNoteForm(row.original.id)}
            >
              <MaterialSymbol m={0} fontSize={24}>
                note_add
              </MaterialSymbol>
              {t("suppliers.actions.addNote", { defaultValue: "Add Note" })}
            </MenuItem>
            <Separator />
            <MenuItem
              value="delete"
              onClick={() => handleDeleteSupplier(row.original.id)}
              colorPalette="red"
            >
              <MaterialSymbol m={0} fontSize={24}>
                delete
              </MaterialSymbol>
              {t("suppliers.actions.delete", { defaultValue: "Delete" })}
            </MenuItem>
          </Menu>
        ),
      },
    ];
  }, [
    t,
    openSupplierFormUpdate,
    openSupplierFormDuplicate,
    handleDeleteSupplier,
  ]);

  return (
    <>
      <CustomHeading
        heading={t("suppliers.title", { defaultValue: "Suppliers" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={2}>
        <SearchInput
          searchFn={handleSearch}
          placeholder={t("common.searchSuppliers", {
            defaultValue: "Search suppliers...",
          })}
          t={t}
        />
        <Spacer />
        <>
          <RefreshButton
            label={t("common.refresh", { defaultValue: "Refresh" })}
            refreshFunction={refreshSuppliers}
          />
          <Button
            variant="solid"
            colorPalette="primary"
            onClick={openSupplierFormCreate}
          >
            <MaterialSymbol>create</MaterialSymbol>
            {t("common.add", { defaultValue: "Add" })}
          </Button>
        </>
      </Flex>
      <Separator mt={"6"} />
      {!isEmpty(data) && !loadingSuppliers ? (
        <DataTable<Supplier>
          data={data || []}
          columns={columns}
          loading={loadingSuppliers}
          paginationType="controlled"
          setPageIndex={setPageIndex}
          itemsCount={suppliersCount}
          show={(type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST", limit: number) =>
            showSuppliers(type, limit)
          }
          enablePageSizeSelection
          t={t}
          i18n={i18n}
        />
      ) : (
        <Empty
          title={t("suppliers.noSuppliers", { defaultValue: "No suppliers" })}
          description={t("suppliers.noSuppliersDescription", {
            defaultValue: "No suppliers found matching your search criteria.",
          })}
          icon={"orders"}
        />
      )}

      <SupplierForm
        supplier={selectedSupplier}
        type={supplierFormType}
        open={supplierForm}
        setOpen={setSupplierForm}
        onSuccess={() => {
          setSupplierForm(false);
          refreshSuppliers();
        }}
      />

      <NoteForm
        type="CREATE"
        asDrawer={true}
        entityId={selectedNote}
        entityType={NoteEntityType.SUPPLIER}
        open={noteForm}
        setOpen={setNoteForm}
      />

      <AlertDialog
        open={isAlertDialogOpen}
        setOpen={setIsAlertDialogOpen}
        header={t("common.deleteSupplier", { defaultValue: "Delete Supplier" })}
        handle={() => {
          deactivateSupplier(selectedSupplierId);
          setIsAlertDialogOpen(false);
        }}
        t={t}
      >
        {t("common.deleteSupplierConfirmation", {
          defaultValue:
            "Are you sure you want to delete this supplier? This action cannot be undone.",
        })}
      </AlertDialog>
    </>
  );
};

export default SuppliersPage;
