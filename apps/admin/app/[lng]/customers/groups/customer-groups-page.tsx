"use client";

import CustomerGroupForm from "@/components/customers/CustomerGroupForm";
import { fetchCustomerGroups } from "@/components/customers/customer-groups";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
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
  Empty,
  IconButtonLink,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
} from "@konfi/components";
import { db, update } from "@konfi/firebase";
import type { CustomerGroup } from "@konfi/types";
import { ADMIN_CUSTOMERS, formatDate } from "@konfi/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import dynamic from "next/dynamic";
import { startTransition, useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { Timestamp } from "firebase/firestore";
import { toaster } from "@konfi/components";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

type CustomerGroupColumnDef = ColumnDef<CustomerGroup, unknown>;

function asCustomerGroupColumnDef<TValue>(
  column: ColumnDef<CustomerGroup, TValue>,
): CustomerGroupColumnDef {
  return column as unknown as CustomerGroupColumnDef;
}

export default function CustomerGroupsPage() {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data, isLoading, mutate } = useSWR(
    ["/customerGroups", tenantContext],
    ([, context]) => fetchCustomerGroups(context),
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateOnMount: true,
    },
  );
  const [searchKey, setSearchKey] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showDuplicateForm, setShowDuplicateForm] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [currentCustomerGroup, setCurrentCustomerGroup] =
    useState<CustomerGroup | null>(null);
  const columnHelper = createColumnHelper<CustomerGroup>();
  const customerGroups = useMemo(() => data ?? [], [data]);
  const filteredCustomerGroups = useMemo(() => {
    return filterLocalFuseItems(customerGroups, searchKey ?? "", {
      keys: [
        { name: "name", weight: 0.7 },
        { name: "description", weight: 0.3 },
      ],
      threshold: 0.36,
    });
  }, [customerGroups, searchKey]);

  const refreshCustomerGroups = useCallback(() => {
    void mutate();
  }, [mutate]);

  function handleCreateFormOpen() {
    startTransition(() => {
      setShowCreateForm(true);
    });
  }

  function handleUpdateFormOpen(customerGroup: CustomerGroup) {
    startTransition(() => {
      setCurrentCustomerGroup(customerGroup);
      setShowUpdateForm(true);
    });
  }

  function handleDuplicateFormOpen(customerGroup: CustomerGroup) {
    startTransition(() => {
      setCurrentCustomerGroup(customerGroup);
      setShowDuplicateForm(true);
    });
  }

  function handleArchive(customerGroup: CustomerGroup) {
    startTransition(() => {
      setCurrentCustomerGroup(customerGroup);
      setShowArchiveDialog(true);
    });
  }

  const archiveCustomerGroup = async () => {
    if (!currentCustomerGroup) {
      return;
    }

    try {
      const archivedAt = Timestamp.now();
      await update(
        {
          active: false,
          archivedAt,
          updatedAt: archivedAt,
        },
        db.doc<Record<string, unknown>>(
          firestore,
          "/customerGroups",
          currentCustomerGroup.id,
        ),
        tenantContext,
      );
      setShowArchiveDialog(false);
      await mutate();
      toaster.success({
        title: t("customerGroups.archived", {
          defaultValue: "Customer group archived",
        }),
        description: t("customerGroups.archivedDescription", {
          defaultValue: "{{name}} is no longer available for new assignments.",
          name: currentCustomerGroup.name,
        }),
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("errors.somethingWentWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("customerGroups.notArchived", {
          defaultValue: "Customer group could not be archived.",
        }),
      });
    }
  };

  const columns = useMemo<CustomerGroupColumnDef[]>(
    () => [
      asCustomerGroupColumnDef(
        columnHelper.accessor("name", {
          cell: (info) => info.getValue(),
          header: t("forms.labels.name", { defaultValue: "Name" }),
        }),
      ),
      asCustomerGroupColumnDef(
        columnHelper.accessor("description", {
          cell: (info) => info.getValue() || "-",
          header: t("forms.labels.description", {
            defaultValue: "Description",
          }),
        }),
      ),
      asCustomerGroupColumnDef(
        columnHelper.accessor("customerIds", {
          cell: (info) => info.getValue()?.length ?? 0,
          header: t("customerGroups.members", { defaultValue: "Members" }),
        }),
      ),
      asCustomerGroupColumnDef(
        columnHelper.accessor("createdAt", {
          cell: (info) =>
            formatDate(info.getValue(), i18n.resolvedLanguage, {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          header: t("customers.dateAdded", { defaultValue: "Date added" }),
        }),
      ),
      columnHelper.display({
        id: "actions",
        cell: (props) => (
          <Flex justify="end">
            <IconButtonLink
              lng={i18n.resolvedLanguage}
              href={`/customers/groups/${props.row.original.id}`}
              icon="open_in_new"
              ariaLabel={t("customerGroups.openDetails", {
                defaultValue: "Open customer group details",
              })}
              tooltipLabel={t("customerGroups.openDetails", {
                defaultValue: "Open customer group details",
              })}
            />
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value="update-form"
                onClick={() => handleUpdateFormOpen(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("customerGroups.edit", {
                  defaultValue: "Edit customer group",
                })}
              </MenuItem>
              <MenuItem
                value="duplicate-form"
                onClick={() => handleDuplicateFormOpen(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("customerGroups.duplicate", {
                  defaultValue: "Duplicate customer group",
                })}
              </MenuItem>
              <MenuItem
                value="archive-modal"
                onClick={() => handleArchive(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>archive</MaterialSymbol>
                {t("customerGroups.archive", {
                  defaultValue: "Archive customer group",
                })}
              </MenuItem>
            </Menu>
          </Flex>
        ),
        meta: {
          isNumeric: true,
        },
      }),
    ],
    [columnHelper, i18n.resolvedLanguage, t],
  );

  return (
    <>
      <CustomHeading
        heading={t("customerGroups.title", {
          defaultValue: "Customer groups",
        })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex flexDir={["column", "row"]} gap={2}>
        <SearchInput
          placeholder={t("customerGroups.search", {
            defaultValue: "Search customer groups…",
          })}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("customerGroups.refresh", {
            defaultValue: "Refresh customer groups",
          })}
          refreshFunction={refreshCustomerGroups}
        />
        <ButtonLink
          href={ADMIN_CUSTOMERS}
          lng={i18n.resolvedLanguage}
          variant="outline"
          ariaLabel={t("forms.headings.customers", {
            defaultValue: "Customers",
          })}
        >
          <MaterialSymbol>groups</MaterialSymbol>
          {t("forms.headings.customers", { defaultValue: "Customers" })}
        </ButtonLink>
        <Button
          colorPalette="primary"
          onClick={() => handleCreateFormOpen()}
          variant="solid"
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("customerGroups.add", { defaultValue: "Add group" })}
        </Button>
      </Flex>
      <Separator my="6" />
      {filteredCustomerGroups.length > 0 ? (
        <DataTable
          columns={columns}
          data={filteredCustomerGroups}
          paginationType="uncontrolled"
          loading={isLoading}
          t={t}
          i18n={i18n}
        />
      ) : (
        <Empty
          title={t("customerGroups.emptyTitle", {
            defaultValue: "No customer groups",
          })}
          description={t("customerGroups.emptyDescription", {
            defaultValue:
              "Create customer groups to reuse segmentation in promotions and future price lists.",
          })}
          icon="groups"
        />
      )}
      <CustomerGroupForm
        type="CREATE"
        open={showCreateForm}
        setOpen={setShowCreateForm}
        onSuccess={() => {
          setShowCreateForm(false);
          void mutate();
        }}
      />
      <CustomerGroupForm
        customerGroup={currentCustomerGroup ?? undefined}
        type="UPDATE"
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
        onSuccess={() => {
          setShowUpdateForm(false);
          void mutate();
        }}
      />
      <CustomerGroupForm
        customerGroup={currentCustomerGroup ?? undefined}
        type="DUPLICATE"
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
        onSuccess={() => {
          setShowDuplicateForm(false);
          void mutate();
        }}
      />
      <AlertDialog
        header={t("customerGroups.confirmArchive", {
          defaultValue: "Archive customer group?",
        })}
        handle={() => {
          void archiveCustomerGroup();
        }}
        open={showArchiveDialog}
        setOpen={setShowArchiveDialog}
        t={t}
      >
        <Text>
          {t("customerGroups.archiveDescription", {
            defaultValue:
              "Archived groups stay on existing customers but are hidden from new assignments and promotion targeting options.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
}
