"use client";

import AdminLoadingSkeleton from "@/components/layout/AdminLoadingSkeleton";
import { useT } from "@/i18n/client";
import { firestore } from "@/lib/firebase/clientApp";
import { Button, HStack, Separator, Text } from "@chakra-ui/react";
import {
  CustomHeading,
  DataTable,
  Empty,
  MaterialSymbol,
  Status,
  Tooltip,
} from "@konfi/components";
import { getB2BInquiries } from "@konfi/firebase";
import { B2BInquiry, B2BInquiryStatus } from "@konfi/types";
import { createColumnHelper } from "@tanstack/react-table";
import { isEmpty, isUndefined } from "es-toolkit/compat";
import { useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";
import B2BWorkflowDrawer from "./b2b-workflow-drawer";

function resolveInquiryStatus(inquiry: B2BInquiry) {
  if (inquiry.status) return inquiry.status;
  return inquiry.accepted ? B2BInquiryStatus.ACCEPTED : B2BInquiryStatus.NEW;
}

function getStatusValue(status: B2BInquiryStatus) {
  if (status === B2BInquiryStatus.ACCEPTED) return "success";
  if (status === B2BInquiryStatus.REJECTED) return "error";
  if (status === B2BInquiryStatus.UNDER_REVIEW) return "warning";
  return "info";
}

export default function B2BPage() {
  const { t, i18n } = useT();
  const [selectedInquiry, setSelectedInquiry] = useState<B2BInquiry | null>(
    null,
  );
  const { data, isValidating, mutate } = useSWRImmutable("b2bInquiries", () =>
    getB2BInquiries(firestore),
  );
  const columnHelper = createColumnHelper<B2BInquiry>();
  const columns = useMemo<readonly unknown[]>(
    () => [
      columnHelper.accessor("billing.companyName", {
        cell: (info) =>
          info.getValue() || info.row.original.billing.name || "-",
        header: t("b2b.inquiries.companyName", {
          defaultValue: "Company",
        }),
        meta: { minWidth: 180 },
      }),
      columnHelper.accessor("billing.nip", {
        cell: (info) => info.getValue() || "-",
        header: t("b2b.inquiries.nip", { defaultValue: "Tax ID" }),
        meta: { minWidth: 120 },
      }),
      columnHelper.accessor("businessDescription", {
        cell: (info) => (
          <Tooltip content={info.getValue()}>
            <Text lineClamp={2} maxW="280px">
              {info.getValue()}
            </Text>
          </Tooltip>
        ),
        header: t("b2b.inquiries.businessDescription", {
          defaultValue: "Business Description",
        }),
        meta: { minWidth: 240 },
      }),
      columnHelper.display({
        id: "status",
        cell: (info) => {
          const status = resolveInquiryStatus(info.row.original);
          return (
            <Status value={getStatusValue(status)}>
              {t(`b2b.statuses.${status}`, { defaultValue: status })}
            </Status>
          );
        },
        header: t("b2b.inquiries.status", { defaultValue: "Status" }),
        meta: { minWidth: 150 },
      }),
      columnHelper.accessor("contactOwner.name", {
        cell: (info) =>
          info.getValue() ||
          t("b2b.inquiries.unassigned", { defaultValue: "Unassigned" }),
        header: t("b2b.inquiries.owner", { defaultValue: "Owner" }),
        meta: { minWidth: 140 },
      }),
      columnHelper.accessor("createdAt", {
        cell: (info) =>
          new Intl.DateTimeFormat(i18n.resolvedLanguage).format(
            info.getValue().toDate(),
          ),
        header: t("b2b.inquiries.dateAdded", { defaultValue: "Date Added" }),
        meta: { minWidth: 120 },
      }),
      columnHelper.display({
        id: "actions",
        cell: (info) => (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setSelectedInquiry(info.row.original)}
          >
            <MaterialSymbol>edit</MaterialSymbol>
            {t("b2b.inquiries.review", { defaultValue: "Review" })}
          </Button>
        ),
        header: t("table.actions", { defaultValue: "Actions" }),
        meta: { minWidth: 120 },
      }),
    ],
    [columnHelper, i18n.resolvedLanguage, t],
  );

  if (isValidating) {
    return <AdminLoadingSkeleton variant="table" rows={6} />;
  }

  if (isUndefined(data) || isEmpty(data)) {
    return (
      <Empty
        title={t("b2b.inquiries.emptyTitle", { defaultValue: "No inquiries" })}
        description={t("b2b.inquiries.emptyDescription", {
          defaultValue: "There are no B2B inquiries",
        })}
        icon="domain"
      />
    );
  }

  return (
    <>
      <HStack justifyContent="space-between" alignItems="flex-start" gap="4">
        <CustomHeading
          heading={t("b2b.inquiries.title", { defaultValue: "B2B Inquiries" })}
          mb={0}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Text color="fg.muted" maxW="560px" textAlign="end">
          {t("b2b.inquiries.helper", {
            defaultValue:
              "Review requests, convert customers, set payment options, assign owners, and manage B2B product access.",
          })}
        </Text>
      </HStack>
      <Separator my="6" />
      <DataTable
        columns={columns}
        data={data}
        paginationType="uncontrolled"
        densityStorageKey="admin:b2b-inquiries"
        t={t}
        i18n={i18n}
      />
      <B2BWorkflowDrawer
        inquiry={selectedInquiry}
        open={Boolean(selectedInquiry)}
        setOpen={(open) => {
          if (!open) setSelectedInquiry(null);
        }}
        onSaved={() => {
          setSelectedInquiry(null);
          void mutate();
        }}
      />
    </>
  );
}
