import { loadFakturowniaInvoiceReferenceDataAction } from "@/actions/fakturownia";
import { useT } from "@/i18n/client";
import { toaster } from "@konfi/components";
import type {
  Department,
  Issuer,
  Warehouse as FakturowniaWarehouse,
} from "@konfi/fakturownia/out/client/models";
import type { Warehouse } from "@konfi/types";
import { useCallback, useEffect, useState } from "react";
import type { MutableRefObject } from "react";
import type { UseFormGetValues, UseFormSetValue } from "react-hook-form";
import {
  findMatchingDepartmentForWarehouseText,
  findMatchingWarehouseForDepartment,
  resolveDepartmentChannelId,
} from "./department-channel-matching";
import { formatFakturowniaIntegrationActionError } from "./FakturowniaErrors";
import type { InvoiceFormValues } from "./invoice-form-types";

interface ChannelLookup {
  id: string;
  name: string;
  warehouses?: string[];
}

interface UseFakturowniaInvoiceDictionariesArgs {
  getValues: UseFormGetValues<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  departmentIdValue?: string;
  warehouses: Warehouse[] | null;
  channels: ChannelLookup[] | null;
  currentChannelId?: string;
  resolvedOrderChannelId?: string;
  isMountedRef: MutableRefObject<boolean>;
}

export function useFakturowniaInvoiceDictionaries({
  getValues,
  setValue,
  departmentIdValue,
  warehouses,
  channels,
  currentChannelId,
  resolvedOrderChannelId,
  isMountedRef,
}: UseFakturowniaInvoiceDictionariesArgs) {
  const { t } = useT(["fakturownia", "translation"]);
  const [fakturowniaWarehouses, setFakturowniaWarehouses] = useState<
    FakturowniaWarehouse[] | null
  >(null);
  const [fakturowniaDepartments, setFakturowniaDepartments] = useState<
    Department[] | null
  >(null);
  const [fakturowniaIssuers, setFakturowniaIssuers] = useState<Issuer[] | null>(
    null,
  );
  const [isDictionariesLoading, setIsDictionariesLoading] = useState(true);

  const getDepartmentChannelId = useCallback(
    (departmentId: string | undefined): string | undefined => {
      if (
        !departmentId ||
        !fakturowniaDepartments ||
        !warehouses ||
        !channels
      ) {
        return undefined;
      }

      return resolveDepartmentChannelId({
        channels,
        departmentId,
        departments: fakturowniaDepartments,
        preferredChannelId: resolvedOrderChannelId ?? currentChannelId,
        warehouses,
      });
    },
    [
      channels,
      currentChannelId,
      fakturowniaDepartments,
      resolvedOrderChannelId,
      warehouses,
    ],
  );

  const loadDictionaries = useCallback(async () => {
    setIsDictionariesLoading(true);
    try {
      const referenceData = await loadFakturowniaInvoiceReferenceDataAction();
      if (!isMountedRef.current) {
        return;
      }

      const warehouseList = referenceData.warehouses ?? [];
      const departmentList = referenceData.departments ?? [];
      const issuerList = referenceData.issuers ?? [];
      setFakturowniaWarehouses(warehouseList);
      setFakturowniaDepartments(departmentList);
      setFakturowniaIssuers(issuerList);

      const firstError =
        referenceData.errors.departments ??
        referenceData.errors.warehouses ??
        referenceData.errors.issuers;
      if (firstError) {
        toaster.error({
          title: t("fakturownia.invoiceCreate.dictionariesError", {
            defaultValue: "Failed to load supporting data",
          }),
          description: formatFakturowniaIntegrationActionError(firstError, t),
        });
      }

      const currentDepartmentId = getValues("departmentId");
      if (!currentDepartmentId && warehouses && channels) {
        const preferredChannelId = resolvedOrderChannelId ?? currentChannelId;
        const preferredChannel = channels.find(
          (item) => item.id === preferredChannelId,
        );
        const matchedDepartment = (preferredChannel?.warehouses ?? [])
          .map((warehouseId) =>
            warehouses.find((warehouse) => warehouse.id === warehouseId),
          )
          .filter((warehouse): warehouse is Warehouse => Boolean(warehouse))
          .map((warehouse) =>
            findMatchingDepartmentForWarehouseText(
              [
                warehouse.name,
                warehouse.address?.city,
                ...(warehouse.keywords ?? []),
              ]
                .filter((value): value is string => Boolean(value))
                .join(" "),
              departmentList,
            ),
          )
          .find((department) => department?.id);

        if (matchedDepartment?.id) {
          setValue("departmentId", String(matchedDepartment.id), {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }
      }
    } catch (error) {
      console.error("Error loading Fakturownia dictionaries", error);
      toaster.error({
        title: t("fakturownia.invoiceCreate.dictionariesError", {
          defaultValue: "Failed to load supporting data",
        }),
        description: t("common.tryAgain", {
          defaultValue: "Try again.",
        }),
      });
    } finally {
      if (isMountedRef.current) {
        setIsDictionariesLoading(false);
      }
    }
  }, [
    channels,
    currentChannelId,
    getValues,
    isMountedRef,
    resolvedOrderChannelId,
    setValue,
    t,
    warehouses,
  ]);

  useEffect(() => {
    void loadDictionaries();
  }, [loadDictionaries]);

  useEffect(() => {
    if (
      !departmentIdValue ||
      !fakturowniaDepartments ||
      !warehouses ||
      !channels
    ) {
      return;
    }

    const selectedDepartment = fakturowniaDepartments.find(
      (dept) => dept.id?.toString() === departmentIdValue,
    );
    if (!selectedDepartment) {
      return;
    }

    const matchingAppWarehouse = findMatchingWarehouseForDepartment(
      selectedDepartment,
      warehouses,
    );
    if (matchingAppWarehouse?.address?.city) {
      setValue("place", matchingAppWarehouse.address.city, {
        shouldDirty: true,
      });
    }

    if (selectedDepartment.taxNo && fakturowniaIssuers) {
      const matchedIssuer = fakturowniaIssuers.find(
        (issuer) => issuer.taxNo === selectedDepartment.taxNo,
      );
      if (matchedIssuer?.id) {
        const sellerCity = (getValues("sellerCity") ?? "")
          .toString()
          .trim()
          .toLowerCase();
        const departmentShortcut = (selectedDepartment.shortcut ?? "")
          .toString()
          .trim()
          .toLowerCase();
        const sameLocation =
          sellerCity !== "" &&
          departmentShortcut !== "" &&
          sellerCity === departmentShortcut;
        setValue("issuerId", sameLocation ? undefined : matchedIssuer.id, {
          shouldDirty: true,
        });
      } else {
        setValue("issuerId", undefined, { shouldDirty: true });
      }
    } else {
      setValue("issuerId", undefined, { shouldDirty: true });
    }
  }, [
    channels,
    departmentIdValue,
    fakturowniaDepartments,
    fakturowniaIssuers,
    getValues,
    setValue,
    warehouses,
  ]);

  const hasDepartmentsLoaded = fakturowniaDepartments !== null;
  const isDepartmentMissing = hasDepartmentsLoaded && !departmentIdValue;
  const shouldBlockSubmit = !hasDepartmentsLoaded || isDepartmentMissing;
  const shouldShowDepartmentAlert = shouldBlockSubmit && !isDictionariesLoading;

  return {
    fakturowniaWarehouses,
    fakturowniaDepartments,
    fakturowniaIssuers,
    isDictionariesLoading,
    shouldBlockSubmit,
    shouldShowDepartmentAlert,
    getDepartmentChannelId,
    handleRefreshDictionaries: loadDictionaries,
  };
}
