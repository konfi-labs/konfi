"use client";

import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { filterLocalFuseItems } from "@/lib/local-fuse-search";
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
  CustomHeading,
  DataTable,
  Empty,
  MaterialSymbol,
  MenuItem,
  RefreshButton,
  SearchInput,
  toaster,
} from "@konfi/components";
import { db, get, tenant, update } from "@konfi/firebase";
import type { PriceList, TenantContext } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import type { ColumnDef } from "@tanstack/react-table";
import { createColumnHelper } from "@tanstack/react-table";
import { isUndefined } from "es-toolkit";
import { Timestamp } from "firebase/firestore";
import dynamic from "next/dynamic";
import { startTransition, useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import PriceListForm from "./price-list-form";

const Menu = dynamic(() => import("@/components/Menu"), {
  loading: () => <Skeleton />,
  ssr: false,
});

type PriceListColumnDef = ColumnDef<PriceList, unknown>;

function asPriceListColumnDef<TValue>(
  column: ColumnDef<PriceList, TValue>,
): PriceListColumnDef {
  return column as unknown as PriceListColumnDef;
}

async function fetchPriceLists(
  tenantContext: TenantContext,
): Promise<PriceList[]> {
  const result = await get(
    db.query<PriceList>(firestore, "priceLists", 999, undefined, [
      tenant.where(tenantContext),
    ]),
  );

  if (isUndefined(result)) {
    return [];
  }

  return result[0].toSorted((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return right.priority - left.priority;
  });
}

export default function PriceListsPage() {
  const { t, i18n } = useT();
  const tenantContext = useTenantContext();
  const { data, isLoading, mutate } = useSWR(
    ["/priceLists", tenantContext],
    ([, context]) => fetchPriceLists(context),
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
  const [currentPriceList, setCurrentPriceList] = useState<PriceList | null>(
    null,
  );
  const columnHelper = createColumnHelper<PriceList>();
  const priceLists = useMemo(() => data ?? [], [data]);
  const filteredPriceLists = useMemo(() => {
    return filterLocalFuseItems(priceLists, searchKey ?? "", {
      keys: [
        { name: "name", weight: 0.4 },
        { name: "description", weight: 0.2 },
        { name: "currency", weight: 0.1 },
        {
          getFn: (priceList) => priceList.channelIds ?? [],
          name: "channelIds",
          weight: 0.1,
        },
        {
          getFn: (priceList) => priceList.customerGroupIds ?? [],
          name: "customerGroupIds",
          weight: 0.1,
        },
        {
          getFn: (priceList) => priceList.customerIds ?? [],
          name: "customerIds",
          weight: 0.1,
        },
      ],
      threshold: 0.36,
    });
  }, [priceLists, searchKey]);

  const refreshPriceLists = useCallback(() => {
    void mutate();
  }, [mutate]);

  function openCreateForm() {
    startTransition(() => setShowCreateForm(true));
  }

  function openUpdateForm(priceList: PriceList) {
    startTransition(() => {
      setCurrentPriceList(priceList);
      setShowUpdateForm(true);
    });
  }

  function openDuplicateForm(priceList: PriceList) {
    startTransition(() => {
      setCurrentPriceList(priceList);
      setShowDuplicateForm(true);
    });
  }

  function openArchiveDialog(priceList: PriceList) {
    startTransition(() => {
      setCurrentPriceList(priceList);
      setShowArchiveDialog(true);
    });
  }

  async function archivePriceList() {
    if (!currentPriceList) {
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
          "/priceLists",
          currentPriceList.id,
        ),
        tenantContext,
      );
      setShowArchiveDialog(false);
      await mutate();
      toaster.success({
        title: t("priceLists.archived", {
          defaultValue: "Price list archived",
        }),
        description: t("priceLists.archivedDescription", {
          defaultValue: "{{name}} no longer applies to new checkout pricing.",
          name: currentPriceList.name,
        }),
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("errors.somethingWentWrong", {
          defaultValue: "Something went wrong",
        }),
        description: t("priceLists.notArchived", {
          defaultValue: "Price list could not be archived.",
        }),
      });
    }
  }

  const columns = useMemo<PriceListColumnDef[]>(
    () => [
      asPriceListColumnDef(
        columnHelper.accessor("name", {
          cell: (info) => info.getValue(),
          header: t("forms.labels.name", { defaultValue: "Name" }),
        }),
      ),
      asPriceListColumnDef(
        columnHelper.accessor("active", {
          cell: (info) => (
            <Badge colorPalette={info.getValue() ? "success" : "gray"}>
              {info.getValue()
                ? t("priceLists.active", { defaultValue: "Active" })
                : t("priceLists.archivedStatus", {
                    defaultValue: "Archived",
                  })}
            </Badge>
          ),
          header: t("common.status", { defaultValue: "Status" }),
        }),
      ),
      asPriceListColumnDef(
        columnHelper.accessor("currency", {
          cell: (info) => info.getValue(),
          header: t("priceLists.currency", { defaultValue: "Currency" }),
        }),
      ),
      asPriceListColumnDef(
        columnHelper.accessor("priority", {
          cell: (info) => info.getValue(),
          header: t("priceLists.priority", { defaultValue: "Priority" }),
        }),
      ),
      asPriceListColumnDef(
        columnHelper.accessor("entries", {
          cell: (info) => info.getValue().length,
          header: t("priceLists.entries", { defaultValue: "Entries" }),
        }),
      ),
      asPriceListColumnDef(
        columnHelper.accessor("channelIds", {
          cell: (info) => (
            <Text maxW="220px" truncate>
              {info.getValue()?.join(", ") || "-"}
            </Text>
          ),
          header: t("priceLists.channels", { defaultValue: "Channels" }),
        }),
      ),
      asPriceListColumnDef(
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
            <Menu
              icon={<MaterialSymbol>menu_open</MaterialSymbol>}
              ariaLabel={t("table.actions", { defaultValue: "Actions" })}
            >
              <MenuItem
                value="update-form"
                onClick={() => openUpdateForm(props.row.original)}
              >
                <MaterialSymbol>edit_square</MaterialSymbol>
                {t("priceLists.edit", { defaultValue: "Edit price list" })}
              </MenuItem>
              <MenuItem
                value="duplicate-form"
                onClick={() => openDuplicateForm(props.row.original)}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("priceLists.duplicate", {
                  defaultValue: "Duplicate price list",
                })}
              </MenuItem>
              <MenuItem
                value="archive-modal"
                onClick={() => openArchiveDialog(props.row.original)}
                color="fg.error"
                _hover={{ bg: "bg.error", color: "fg.error" }}
              >
                <MaterialSymbol>archive</MaterialSymbol>
                {t("priceLists.archive", {
                  defaultValue: "Archive price list",
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
        heading={t("priceLists.title", { defaultValue: "Price lists" })}
        mb="8"
        breadcrumb={true}
        goBack={true}
        t={t}
      />
      <Flex flexDir={{ base: "column", md: "row" }} gap={2}>
        <SearchInput
          placeholder={t("priceLists.search", {
            defaultValue: "Search price lists…",
          })}
          searchFn={undefined}
          searchKey={searchKey}
          setSearchKey={setSearchKey}
          t={t}
        />
        <Spacer />
        <RefreshButton
          label={t("priceLists.refresh", {
            defaultValue: "Refresh price lists",
          })}
          refreshFunction={refreshPriceLists}
        />
        <Button colorPalette="primary" onClick={openCreateForm}>
          <MaterialSymbol>add</MaterialSymbol>
          {t("priceLists.add", { defaultValue: "Add price list" })}
        </Button>
      </Flex>
      <Separator my="6" />
      {filteredPriceLists.length > 0 ? (
        <DataTable
          columns={columns}
          data={filteredPriceLists}
          paginationType="uncontrolled"
          loading={isLoading}
          t={t}
          i18n={i18n}
        />
      ) : (
        <Empty
          title={t("priceLists.emptyTitle", {
            defaultValue: "No price lists",
          })}
          description={t("priceLists.emptyDescription", {
            defaultValue:
              "Create customer, channel, or campaign price lists for checkout pricing.",
          })}
          icon="price_change"
        />
      )}
      <PriceListForm
        type="CREATE"
        open={showCreateForm}
        setOpen={setShowCreateForm}
        onSuccess={() => {
          setShowCreateForm(false);
          void mutate();
        }}
      />
      <PriceListForm
        priceList={currentPriceList ?? undefined}
        type="UPDATE"
        open={showUpdateForm}
        setOpen={setShowUpdateForm}
        onSuccess={() => {
          setShowUpdateForm(false);
          void mutate();
        }}
      />
      <PriceListForm
        priceList={currentPriceList ?? undefined}
        type="DUPLICATE"
        open={showDuplicateForm}
        setOpen={setShowDuplicateForm}
        onSuccess={() => {
          setShowDuplicateForm(false);
          void mutate();
        }}
      />
      <AlertDialog
        header={t("priceLists.confirmArchive", {
          defaultValue: "Archive price list?",
        })}
        handle={() => void archivePriceList()}
        open={showArchiveDialog}
        setOpen={setShowArchiveDialog}
        t={t}
      >
        <HStack align="start">
          <MaterialSymbol color="fg.error">warning</MaterialSymbol>
          <Text>
            {t("priceLists.archiveDescription", {
              defaultValue:
                "Archived price lists stop applying to new checkout pricing. Existing orders keep their snapshots.",
            })}
          </Text>
        </HStack>
      </AlertDialog>
    </>
  );
}
