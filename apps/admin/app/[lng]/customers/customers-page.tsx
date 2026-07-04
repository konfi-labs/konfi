"use client";

import NoteForm from "@/components/notes/NoteForm";
import { useTenantContext } from "@/context/tenant";
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
  ButtonLink,
  AlertDialog,
  CustomHeading,
  DataTable,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
  Tag,
} from "@konfi/components";
import { Customer, NoteEntityType } from "@konfi/types";
import { ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useCustomers } from "context/customers";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import useSWRImmutable from "swr/immutable";
import { fetchCustomerGroupOptions } from "../components/customers/customer-groups";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});
const CustomerForm = dynamic(
  () => import("@/components/customers/CustomerForm"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);
const LinkCustomerToGroupDialog = dynamic(
  () => import("@/components/customers/LinkCustomerToGroupDialog"),
  {
    loading: () => <Skeleton />,
    ssr: false,
  },
);

const CustomersPage = () => {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const {
    loadingCustomers,
    pageIndex,
    setPageIndex,
    customers,
    customersCount,
    showCustomers,
    searchCustomers,
    customersSearchResults,
    deactivateCustomer,
    cleanCustomersSearchResults,
    refreshCustomers,
    dirtyRefreshCustomers,
  } = useCustomers();
  const data = useMemo<Customer[] | undefined>(
    () =>
      customersSearchResults
        ? customersSearchResults?.map((customer) => customer)
        : customers?.map((customer) => customer),
    [customers, customersSearchResults],
  );
  const columHelper = createColumnHelper<Customer>();
  const searchParams = useSearchParams();
  const isCreateNewQuery =
    searchParams?.get("type") === "create-new" ||
    searchParams?.has("create-new") === true;
  const [showCreateForm, setShowCreateForm] = useState(isCreateNewQuery);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showLinkGroupDialog, setShowLinkGroupDialog] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [showNoteCreateForm, setShowNoteCreateForm] = useState(false);
  const [currentCustomer, setCurrentCustomer] = useState<Customer | null>(null);
  const { data: customerGroupOptions } = useSWRImmutable(
    ["/customerGroups/options", tenantContext],
    ([, context]) => fetchCustomerGroupOptions(context),
  );
  const customerGroupLabelById = useMemo(
    () =>
      new Map(
        (customerGroupOptions ?? []).map((customerGroup) => [
          customerGroup.value,
          customerGroup.label,
        ]),
      ),
    [customerGroupOptions],
  );

  useEffect(() => {
    if (isCreateNewQuery) {
      setShowCreateForm(true);
    }
  }, [isCreateNewQuery]);

  function handleUpdateFormOpen(customer: Customer) {
    startTransition(() => {
      setCurrentCustomer(customer);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(customer: Customer) {
    startTransition(() => {
      setCurrentCustomer(customer);
      setShowDuplicateForm(true);
    });
  }

  function handleRemove(customer: Customer) {
    startTransition(() => {
      setCurrentCustomer(customer);
      setShowRemoveDialog(true);
    });
  }

  const handleShowNoteCreateForm = useCallback((customer: Customer) => {
    startTransition(() => {
      setCurrentCustomer(customer);
      setShowNoteCreateForm(true);
    });
  }, []);

  const columns = useMemo<ColumnDef<Customer, any>[]>(
    () => [
      columHelper.accessor("name", {
        cell: (info) => info.getValue(),
        header: t("admin.company"),
      }),
      columHelper.accessor("personName", {
        cell: (info) => info.getValue(),
        header: t("admin.person"),
      }),
      columHelper.display({
        id: "customerGroups",
        cell: (props) => {
          const customerGroupIds = props.row.original.customerGroupIds ?? [];

          if (customerGroupIds.length === 0) {
            return (
              <Text color="fg.muted">
                {t("customers.noCustomerGroups", {
                  defaultValue: "No groups",
                })}
              </Text>
            );
          }

          return (
            <Flex gap={1} wrap="wrap">
              {customerGroupIds.map((customerGroupId) => (
                <Tag key={customerGroupId} size="sm">
                  {customerGroupLabelById.get(customerGroupId) ??
                    customerGroupId}
                </Tag>
              ))}
            </Flex>
          );
        },
        header: t("forms.labels.customerGroups", {
          defaultValue: "Customer groups",
        }),
      }),
      columHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify={"end"}>
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/customers/${props.row.original.id}`}
              icon={"open_in_new"}
              ariaLabel={t("admin.customerPreview")}
              tooltipLabel={t("admin.customerPreview")}
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
                {t("admin.editCustomer")}
              </MenuItem>
              <MenuItem
                value={"duplicate-form"}
                onClick={() => handleDuplicateFormOpen(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("admin.copyCustomer")}
              </MenuItem>{" "}
              <MenuItem
                value={"note-create-form"}
                onClick={() => handleShowNoteCreateForm(props.row.original)}
              >
                <MaterialSymbol>note_add</MaterialSymbol>
                {t("admin.createNote")}
              </MenuItem>
              <MenuItem
                value={"link-to-group"}
                onClick={() => {
                  setCurrentCustomer(props.row.original);
                  setShowLinkGroupDialog(true);
                }}
              >
                <MaterialSymbol>group_add</MaterialSymbol>
                {t("customers.addToGroup", { defaultValue: "Add to group" })}
              </MenuItem>
              <MenuItem
                value={"deactivate-modal"}
                onClick={() => handleRemove(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
                {t("admin.removeCustomer")}
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
        heading={t("forms.headings.customers")}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={["2", "0"]}>
        <SearchInput
          placeholder={t("admin.searchCustomersByName")}
          searchFn={searchCustomers}
          cleanFn={cleanCustomersSearchResults}
          searchResults={customersSearchResults}
          // enableVectorSearch
          loading={loadingCustomers}
          t={t}
        />
        <Spacer />
        <RefreshButton
          mr={2}
          w={["100%", "auto"]}
          label={t("common.refresh", { defaultValue: "Refresh Customers" })}
          refreshFunction={refreshCustomers}
        />
        <ButtonLink
          ariaLabel={t("customers.carts.title", {
            defaultValue: "Customer carts",
          })}
          href="/customers/carts"
          lng={i18n.resolvedLanguage}
          variant="outline"
          mr={2}
        >
          <MaterialSymbol>shopping_cart</MaterialSymbol>
          {t("customers.carts.shortTitle", {
            defaultValue: "Carts",
          })}
        </ButtonLink>
        <ButtonLink
          ariaLabel={t("customerGroups.title", {
            defaultValue: "Customer groups",
          })}
          href="/customers/groups"
          lng={i18n.resolvedLanguage}
          variant="outline"
          mr={2}
        >
          <MaterialSymbol>groups</MaterialSymbol>
          {t("customerGroups.shortTitle", {
            defaultValue: "Groups",
          })}
        </ButtonLink>
        <Button
          colorPalette={"primary"}
          onClick={() => setShowCreateForm(true)}
          variant={"solid"}
        >
          <MaterialSymbol>edit</MaterialSymbol>
          {t("admin.addCustomer")}
        </Button>
      </Flex>
      <Separator my={"6"} />
      {data && !(data.length <= 0) && (
        <DataTable
          columns={columns}
          data={data}
          paginationType={
            customersSearchResults ? "uncontrolled" : "controlled"
          }
          show={showCustomers}
          itemsCount={
            customersSearchResults
              ? customersSearchResults.length
              : customersCount
          }
          loading={loadingCustomers}
          refreshFlag={dirtyRefreshCustomers}
          defaultPageIndex={pageIndex}
          setPageIndex={setPageIndex}
          enablePageSizeSelection
          t={t}
          i18n={i18n}
        />
      )}
      <CustomerForm
        type={"CREATE"}
        open={showCreateForm}
        setOpen={setShowCreateForm}
      />
      <CustomerForm
        customer={currentCustomer!}
        type={"UPDATE"}
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
      />
      <CustomerForm
        customer={currentCustomer!}
        type={"DUPLICATE"}
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
      />
      <AlertDialog
        header={t("admin.confirmDeactivateCustomer")}
        handle={() => deactivateCustomer(currentCustomer!.id)}
        open={showRemoveDialog}
        setOpen={setShowRemoveDialog}
        t={t}
      >
        <Text>{t("admin.deactivateCustomerDescription")}</Text>
      </AlertDialog>
      <LinkCustomerToGroupDialog
        customerId={currentCustomer?.id ?? null}
        isOpen={showLinkGroupDialog}
        onClose={() => setShowLinkGroupDialog(false)}
        customerGroupOptions={customerGroupOptions}
        alreadyAssignedGroupIds={currentCustomer?.customerGroupIds ?? []}
        onSuccess={() => refreshCustomers()}
      />
      <NoteForm
        type={"CREATE"}
        asDrawer
        open={showNoteCreateForm}
        setOpen={setShowNoteCreateForm}
        entityId={currentCustomer?.id}
        entityType={NoteEntityType.CUSTOMER}
      />
    </>
  );
};

export default CustomersPage;
