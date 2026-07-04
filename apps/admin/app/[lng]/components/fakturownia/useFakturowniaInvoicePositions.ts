import {
  getClientById,
  getFakturowniaPriceListById,
  getProductById,
  listFakturowniaPriceLists,
  searchFakturowniaProductsAction,
  type FakturowniaPriceListPosition,
} from "@/actions/fakturownia";
import type { Product as FakturowniaClientProduct } from "@konfi/fakturownia/client/models";
import type { Product } from "@konfi/fakturownia/out/client/models";
import { CurrencyEnum, Unit } from "@konfi/types";
import { multiplyCurrency, roundTotal, roundUnitPrice } from "@konfi/utils";
import { toaster } from "@konfi/components";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { Control, UseFormGetValues, UseFormSetValue } from "react-hook-form";
import { useFieldArray } from "react-hook-form";
import { useT } from "@/i18n/client";
import {
  buildProductSnapshot,
  createPriceListPositionMap,
  normalizeCurrencyNumber,
  toTaxDisplayValue,
  toTaxNumeric,
  toTaxString,
  type FakturowniaProductSnapshot,
} from "./invoice-helpers";
import {
  areCurrencyEqual,
  formatCurrencyValue,
} from "./invoice-form-position-builder";
import { formatFakturowniaIntegrationActionError } from "./FakturowniaErrors";
import type {
  InvoiceFormValues,
  InvoicePositionFormValue,
  PriceListOptionItem,
  PriceListWithMap,
  ProductOptionItem,
} from "./invoice-form-types";

interface UseFakturowniaInvoicePositionsArgs {
  control: Control<InvoiceFormValues>;
  getValues: UseFormGetValues<InvoiceFormValues>;
  setValue: UseFormSetValue<InvoiceFormValues>;
  positions?: InvoicePositionFormValue[];
  priceListIdValue?: string;
  primaryInvoiceCurrency?: string;
  isMountedRef: MutableRefObject<boolean>;
}

export function useFakturowniaInvoicePositions({
  control,
  getValues,
  setValue,
  positions,
  priceListIdValue,
  primaryInvoiceCurrency,
  isMountedRef,
}: UseFakturowniaInvoicePositionsArgs) {
  const { t } = useT(["fakturownia", "translation"]);
  const [hasRoundingAdjustments, setHasRoundingAdjustments] = useState(false);
  const [productSuggestionsByPosition, setProductSuggestionsByPosition] =
    useState<Record<string, ProductOptionItem[]>>({});
  const [
    isProductComboboxLoadingByPosition,
    setIsProductComboboxLoadingByPosition,
  ] = useState<Record<string, boolean>>({});
  const [priceLists, setPriceLists] = useState<PriceListWithMap[]>([]);
  const [isPriceListLoading, setIsPriceListLoading] = useState(false);
  const [priceListError, setPriceListError] = useState<string | null>(null);
  const [priceListInputValue, setPriceListInputValue] = useState("");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [productPickerTargetIndex, setProductPickerTargetIndex] = useState<
    number | null
  >(null);
  const productSearchTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const priceListsById = useMemo(() => {
    const map: Record<string, PriceListWithMap> = {};
    for (const priceList of priceLists) {
      map[priceList.id] = priceList;
    }
    return map;
  }, [priceLists]);
  const priceListOptions = useMemo<PriceListOptionItem[]>(
    () =>
      priceLists.map((priceList) => {
        const fallbackLabel = `${t("fakturownia.invoiceCreate.priceListFallback", { defaultValue: "Price list" })} #${priceList.id}`;
        const label =
          priceList.name?.trim() && priceList.name.trim() !== ""
            ? priceList.name.trim()
            : fallbackLabel;
        const parts: string[] = [];
        if (priceList.currency) {
          parts.push(priceList.currency);
        }
        if (priceList.description) {
          parts.push(priceList.description);
        }
        parts.push(
          t("fakturownia.invoiceCreate.priceListItemsCount", {
            defaultValue: "{{count}} items",
            count: priceList.positions.length,
          }),
        );
        return {
          value: priceList.id,
          label,
          secondaryLabel: parts.filter(Boolean).join(" • "),
          priceListId: priceList.id,
        };
      }),
    [priceLists, t],
  );
  useEffect(() => {
    let cancelled = false;
    setIsPriceListLoading(true);
    void (async () => {
      try {
        const lists = await listFakturowniaPriceLists();
        if (cancelled) {
          return;
        }
        const enhancedLists = lists.map((priceList) => ({
          ...priceList,
          positionMap: createPriceListPositionMap(priceList),
        }));
        setPriceLists(enhancedLists);
        setPriceListError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.error("Error fetching Fakturownia price lists", error);
        setPriceListError(
          error instanceof Error
            ? error.message
            : t("fakturownia.invoiceCreate.priceListLoadError", {
                defaultValue: "Failed to load price lists",
              }),
        );
        toaster.error({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("fakturownia.invoiceCreate.priceListLoadError", {
            defaultValue: "Failed to load price lists",
          }),
        });
      } finally {
        if (!cancelled) {
          setIsPriceListLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);
  const {
    fields: positionFields,
    append: appendPosition,
    remove: removePosition,
  } = useFieldArray({
    control,
    name: "positions",
  });

  const createEmptyPosition = useCallback(
    () => ({
      name: "",
      description: "",
      quantity: 1,
      unit: Unit.PCS,
      priceNet: 0,
      priceGross: 0,
      tax: "23",
      productId: undefined,
      code: undefined,
      discountPercent: 0,
    }),
    [],
  );

  const ensurePositionSlot = useCallback(() => {
    const currentPositions = getValues("positions");
    const nextIndex = Array.isArray(currentPositions)
      ? currentPositions.length
      : 0;
    appendPosition(createEmptyPosition());
    return nextIndex;
  }, [appendPosition, createEmptyPosition, getValues]);

  const selectedPriceList = priceListIdValue
    ? priceListsById[priceListIdValue]
    : undefined;
  const hasAnyPositionWithDiscount = useMemo(() => {
    if (!Array.isArray(positions)) {
      return false;
    }
    return positions.some((position) => {
      const raw = position?.discountPercent;
      const numeric = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(numeric) && numeric > 0;
    });
  }, [positions]);

  const recalculatePositionValues = useCallback(
    (
      positionIndex: number,
      overrides?: {
        quantity?: number;
        priceNet?: number;
        priceGross?: number;
        totalNet?: number;
        totalGross?: number;
        tax?: string;
        discountPercent?: number;
        changedField?:
          | "priceNet"
          | "priceGross"
          | "totalNet"
          | "totalGross"
          | "quantity"
          | "tax"
          | "discountPercent";
      },
    ) => {
      const current = getValues(`positions.${positionIndex}`);
      if (!current) {
        return;
      }

      const quantity = overrides?.quantity ?? current.quantity ?? 0;
      const taxSource = overrides?.tax ?? current.tax;
      const discountSource =
        overrides?.discountPercent ?? current.discountPercent ?? 0;

      const quantityNumber = Number.isFinite(quantity)
        ? Number(quantity)
        : Number(quantity) || 0;
      const taxNumeric = toTaxNumeric(taxSource);
      const taxRate = typeof taxNumeric === "number" ? taxNumeric : 0;

      const normalizedDiscount = (() => {
        if (!Number.isFinite(discountSource)) {
          return 0;
        }
        if (discountSource <= 0) {
          return 0;
        }
        if (discountSource >= 100) {
          return 100;
        }
        return roundTotal(discountSource);
      })();

      let priceNet: number;
      let priceGross: number;
      let totalNet: number;
      let totalGross: number;

      // Determine which field changed and recalculate others accordingly
      switch (overrides?.changedField) {
        case "priceGross": {
          // User changed priceGross -> calculate priceNet, then totals from unit prices
          const priceGrossInput =
            overrides.priceGross ?? current.priceGross ?? 0;
          priceGross = Number.isFinite(priceGrossInput)
            ? roundUnitPrice(Number(priceGrossInput))
            : 0;
          priceNet =
            taxRate > 0
              ? roundUnitPrice(priceGross / (1 + taxRate / 100))
              : priceGross;
          // Totals stored in the form are always PRE-DISCOUNT values.
          // Use multiplyCurrency to avoid floating-point precision issues
          totalNet = multiplyCurrency(priceNet, quantityNumber);
          totalGross = multiplyCurrency(priceGross, quantityNumber);
          break;
        }
        case "totalNet": {
          // User changed totalNet (pre-discount total) -> derive unit prices, then snap totals to compatible values
          const totalNetInput = overrides.totalNet ?? current.totalNet ?? 0;
          const totalNetSource = Number.isFinite(totalNetInput)
            ? Number(totalNetInput)
            : 0;
          const safeQuantity = quantityNumber > 0 ? quantityNumber : 1;
          priceNet =
            safeQuantity > 0
              ? roundUnitPrice(totalNetSource / safeQuantity)
              : 0;
          priceGross = roundUnitPrice(priceNet * (1 + taxRate / 100));
          // Use multiplyCurrency to avoid floating-point precision issues
          totalNet = multiplyCurrency(priceNet, quantityNumber);
          totalGross = multiplyCurrency(priceGross, quantityNumber);

          const hasAdjustment = !areCurrencyEqual(totalNetSource, totalNet);
          setHasRoundingAdjustments(hasAdjustment);
          break;
        }
        case "totalGross": {
          // User changed totalGross (pre-discount total) -> derive unit prices, then snap totals to compatible values
          const totalGrossInput =
            overrides.totalGross ?? current.totalGross ?? 0;
          const totalGrossSource = Number.isFinite(totalGrossInput)
            ? Number(totalGrossInput)
            : 0;
          const safeQuantity = quantityNumber > 0 ? quantityNumber : 1;
          priceGross =
            safeQuantity > 0
              ? roundUnitPrice(totalGrossSource / safeQuantity)
              : 0;
          priceNet =
            taxRate > 0
              ? roundUnitPrice(priceGross / (1 + taxRate / 100))
              : priceGross;
          // Use multiplyCurrency to avoid floating-point precision issues
          totalNet = multiplyCurrency(priceNet, quantityNumber);
          totalGross = multiplyCurrency(priceGross, quantityNumber);

          const hasAdjustment = !areCurrencyEqual(totalGrossSource, totalGross);
          setHasRoundingAdjustments(hasAdjustment);
          break;
        }
        default: {
          // Default case: changed priceNet, quantity, tax, or discount -> calculate from priceNet
          const priceNetInput = overrides?.priceNet ?? current.priceNet ?? 0;
          priceNet = Number.isFinite(priceNetInput)
            ? roundUnitPrice(Number(priceNetInput))
            : 0;
          priceGross = roundUnitPrice(priceNet * (1 + taxRate / 100));
          // Totals stored in the form are always PRE-DISCOUNT values.
          // Use multiplyCurrency to avoid floating-point precision issues
          totalNet = multiplyCurrency(priceNet, quantityNumber);
          totalGross = multiplyCurrency(priceGross, quantityNumber);
        }
      }

      // Update fields that changed
      if (!areCurrencyEqual(current.priceNet, priceNet)) {
        setValue(`positions.${positionIndex}.priceNet`, priceNet, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      if (!areCurrencyEqual(current.priceGross, priceGross)) {
        setValue(`positions.${positionIndex}.priceGross`, priceGross, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      if (!areCurrencyEqual(current.totalNet, totalNet)) {
        setValue(`positions.${positionIndex}.totalNet`, totalNet, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      if (!areCurrencyEqual(current.totalGross, totalGross)) {
        setValue(`positions.${positionIndex}.totalGross`, totalGross, {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        });
      }
      if (
        overrides?.discountPercent !== undefined &&
        normalizedDiscount !== discountSource
      ) {
        setValue(
          `positions.${positionIndex}.discountPercent`,
          normalizedDiscount,
          { shouldDirty: true, shouldTouch: true, shouldValidate: true },
        );
      }
    },
    [getValues, setValue, setHasRoundingAdjustments],
  );

  const clearProductSearchTimeout = useCallback((positionId: string) => {
    const timeoutId = productSearchTimeoutsRef.current[positionId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete productSearchTimeoutsRef.current[positionId];
    }
  }, []);

  const updateProductOptionsForPosition = useCallback(
    (positionId: string, options: ProductOptionItem[]) => {
      setProductSuggestionsByPosition((previous) => {
        if (options.length === 0) {
          if (!(positionId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[positionId];
          return next;
        }
        return { ...previous, [positionId]: options };
      });
    },
    [],
  );

  const updateProductLoadingForPosition = useCallback(
    (positionId: string, loading: boolean) => {
      setIsProductComboboxLoadingByPosition((previous) => {
        if (!loading) {
          if (!(positionId in previous)) {
            return previous;
          }
          const next = { ...previous };
          delete next[positionId];
          return next;
        }
        if (previous[positionId]) {
          return previous;
        }
        return { ...previous, [positionId]: true };
      });
    },
    [],
  );

  const clearProductStateForPosition = useCallback(
    (positionId: string) => {
      updateProductOptionsForPosition(positionId, []);
      updateProductLoadingForPosition(positionId, false);
      clearProductSearchTimeout(positionId);
    },
    [
      clearProductSearchTimeout,
      updateProductLoadingForPosition,
      updateProductOptionsForPosition,
    ],
  );

  const applyPriceListEntryToPosition = useCallback(
    (positionIndex: number, entry: FakturowniaPriceListPosition) => {
      const current = getValues(`positions.${positionIndex}`);
      if (!current) {
        return;
      }

      let nextPriceNet = entry.priceNet;
      let nextPriceGross = entry.priceGross;
      const targetTax = entry.tax;

      if (
        entry.usePercentage &&
        entry.percentage !== undefined &&
        current.priceNet !== undefined
      ) {
        const basePrice = current.priceNet;
        const adjustmentFactor = 1 + entry.percentage / 100;
        nextPriceNet = normalizeCurrencyNumber(basePrice * adjustmentFactor);
        if (targetTax && nextPriceNet !== undefined) {
          const taxNumeric = toTaxNumeric(targetTax);
          if (typeof taxNumeric === "number") {
            nextPriceGross = normalizeCurrencyNumber(
              nextPriceNet * (1 + taxNumeric / 100),
            );
          }
        }
      }

      const overrides: {
        priceNet?: number;
        priceGross?: number;
        tax?: string;
        changedField?: "priceNet" | "priceGross" | "tax";
      } = {};

      if (targetTax && targetTax !== current.tax) {
        setValue(`positions.${positionIndex}.tax`, targetTax, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        overrides.tax = targetTax;
        overrides.changedField = overrides.changedField ?? "tax";
      }

      if (
        nextPriceNet !== undefined &&
        !areCurrencyEqual(current.priceNet, nextPriceNet)
      ) {
        setValue(`positions.${positionIndex}.priceNet`, nextPriceNet, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        overrides.priceNet = nextPriceNet;
        overrides.changedField = "priceNet";
      }

      if (
        nextPriceGross !== undefined &&
        !areCurrencyEqual(current.priceGross, nextPriceGross)
      ) {
        setValue(`positions.${positionIndex}.priceGross`, nextPriceGross, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
        if (overrides.changedField !== "priceNet") {
          overrides.changedField = overrides.changedField ?? "priceGross";
        }
        overrides.priceGross = nextPriceGross;
      }

      if (overrides.changedField) {
        recalculatePositionValues(positionIndex, overrides);
      }
    },
    [getValues, recalculatePositionValues, setValue],
  );

  const applyPriceListToExistingPositions = useCallback(
    (priceList: PriceListWithMap) => {
      const currentPositions = getValues("positions");
      if (!Array.isArray(currentPositions)) {
        return;
      }
      currentPositions.forEach((position, index) => {
        const productId = position?.productId;
        if (!productId) {
          return;
        }
        const entry = priceList.positionMap[productId];
        if (!entry) {
          return;
        }
        applyPriceListEntryToPosition(index, entry);
      });
    },
    [applyPriceListEntryToPosition, getValues],
  );
  useEffect(() => {
    if (!selectedPriceList) {
      return;
    }
    applyPriceListToExistingPositions(selectedPriceList);
  }, [applyPriceListToExistingPositions, selectedPriceList]);

  const applyPriceListEntryForProduct = useCallback(
    (
      priceList: PriceListWithMap,
      positionIndex: number,
      productId?: string,
    ) => {
      if (!productId) {
        return;
      }
      const entry = priceList.positionMap[productId];
      if (!entry) {
        return;
      }
      applyPriceListEntryToPosition(positionIndex, entry);
    },
    [applyPriceListEntryToPosition],
  );

  const resetPositionPricesToProductDefaults = useCallback(async () => {
    const currentPositions = getValues("positions");
    if (!Array.isArray(currentPositions)) {
      return;
    }

    for (let index = 0; index < currentPositions.length; index++) {
      const position = currentPositions[index];
      const productId = position?.productId;

      if (!productId) {
        continue;
      }

      try {
        const detailedProduct = await getProductById(productId);
        if (!detailedProduct) {
          continue;
        }

        const snapshot = buildProductSnapshot(detailedProduct);
        const taxString = snapshot.taxString ?? toTaxString(snapshot.taxNumber);
        const taxNumber =
          snapshot.taxNumber ?? toTaxNumeric(snapshot.taxString);

        let priceNet = snapshot.priceNet;
        let priceGross = snapshot.priceGross;

        if (
          priceNet !== undefined &&
          priceGross === undefined &&
          taxNumber !== undefined
        ) {
          priceGross = normalizeCurrencyNumber(
            priceNet * (1 + taxNumber / 100),
          );
        }
        if (
          priceGross !== undefined &&
          priceNet === undefined &&
          taxNumber !== undefined
        ) {
          const divisor = 1 + taxNumber / 100;
          if (divisor !== 0) {
            priceNet = normalizeCurrencyNumber(priceGross / divisor);
          }
        }

        // Always update tax if we have it
        if (taxString) {
          setValue(`positions.${index}.tax`, taxString, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }

        // Always update prices
        if (priceNet !== undefined) {
          setValue(`positions.${index}.priceNet`, priceNet, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }
        if (priceGross !== undefined) {
          setValue(`positions.${index}.priceGross`, priceGross, {
            shouldDirty: true,
            shouldTouch: true,
            shouldValidate: true,
          });
        }

        // Recalculate totals with the updated prices
        recalculatePositionValues(index, {
          priceNet,
          priceGross,
          tax: taxString,
          changedField: "priceNet",
        });
      } catch (error) {
        console.error(`Error resetting prices for product ${productId}`, error);
      }
    }
  }, [getValues, setValue, recalculatePositionValues]);

  useEffect(() => {
    if (!priceListIdValue || !isMountedRef.current) {
      return;
    }

    const fetchAndApplyPriceList = async () => {
      try {
        setIsPriceListLoading(true);
        setPriceListError(null);

        const fullPriceList =
          await getFakturowniaPriceListById(priceListIdValue);

        if (!isMountedRef.current || !fullPriceList) {
          return;
        }

        const priceListWithMap: PriceListWithMap = {
          ...fullPriceList,
          positionMap: createPriceListPositionMap(fullPriceList),
        };

        setPriceLists((prev) => {
          const existingIndex = prev.findIndex(
            (pl) => pl.id === fullPriceList.id,
          );
          if (existingIndex >= 0) {
            const updated = [...prev];
            updated[existingIndex] = priceListWithMap;
            return updated;
          }
          return [...prev, priceListWithMap];
        });

        applyPriceListToExistingPositions(priceListWithMap);
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        setPriceListError(
          error instanceof Error ? error.message : "Failed to fetch price list",
        );
      } finally {
        if (isMountedRef.current) {
          setIsPriceListLoading(false);
        }
      }
    };

    fetchAndApplyPriceList();
  }, [priceListIdValue, applyPriceListToExistingPositions, getValues]);

  // Auto-select price list on initialization if clientId exists but priceListId doesn't
  useEffect(() => {
    const currentClientId = getValues("clientId");
    const currentPriceListId = getValues("priceListId");

    // Only proceed if we have a clientId but no priceListId yet
    if (!currentClientId || currentPriceListId) {
      return;
    }

    let cancelled = false;

    const loadClientAndSetPriceList = async () => {
      try {
        const client = await getClientById(currentClientId);
        if (cancelled || !isMountedRef.current) {
          return;
        }

        if (client?.priceListId) {
          setValue("priceListId", String(client.priceListId), {
            shouldDirty: false,
            shouldTouch: false,
            shouldValidate: true,
          });
        }
      } catch (error) {
        // Silently fail - client lookup is optional enhancement
        console.error(
          "Failed to load client for price list auto-select:",
          error,
        );
      }
    };

    void loadClientAndSetPriceList();

    return () => {
      cancelled = true;
    };
  }, [getValues, setValue]);

  const createProductOptionItem = useCallback(
    (product: Product): ProductOptionItem => {
      const snapshot = buildProductSnapshot(product);
      const formCurrency =
        getValues("currency") ||
        primaryInvoiceCurrency ||
        CurrencyEnum.PLN;
      const baseLabel = snapshot.name ?? snapshot.code;
      const label =
        baseLabel && baseLabel.trim() !== ""
          ? baseLabel.trim()
          : t("fakturownia.invoiceCreate.unnamedProduct", {
              defaultValue: "Unnamed product",
            });
      const priceCandidate = snapshot.priceNet ?? snapshot.priceGross;
      const currencyLabel = snapshot.currency ?? formCurrency;
      const priceLabel =
        priceCandidate !== undefined
          ? `${formatCurrencyValue(priceCandidate)} ${currencyLabel}`
          : undefined;
      const taxLabel = toTaxDisplayValue(
        snapshot.taxString ?? snapshot.taxNumber,
      );
      const codeLabel = snapshot.code;
      const secondaryParts = [codeLabel, priceLabel, taxLabel].filter(
        Boolean,
      ) as string[];
      const fallbackValueSource =
        label.toLowerCase().replace(/\s+/g, "-") || "product";
      const value = snapshot.id ?? `product-${fallbackValueSource}`;
      return {
        value,
        label,
        secondaryLabel:
          secondaryParts.length > 0 ? secondaryParts.join(" • ") : undefined,
        snapshot: { ...snapshot, currency: snapshot.currency ?? currencyLabel },
      };
    },
    [getValues, primaryInvoiceCurrency, t],
  );

  const scheduleProductSearch = useCallback(
    (positionId: string, term: string) => {
      const normalized = term.trim();
      clearProductSearchTimeout(positionId);
      if (normalized.length < 2) {
        updateProductOptionsForPosition(positionId, []);
        updateProductLoadingForPosition(positionId, false);
        return;
      }
      updateProductLoadingForPosition(positionId, true);
      productSearchTimeoutsRef.current[positionId] = setTimeout(() => {
        void (async () => {
          try {
            const results = await searchFakturowniaProductsAction(normalized);
            if (!isMountedRef.current) {
              return;
            }
            if (!results.ok) {
              toaster.error({
                title: t("common.error", { defaultValue: "Error" }),
                description: formatFakturowniaIntegrationActionError(
                  results.error,
                  t,
                ),
              });
              updateProductOptionsForPosition(positionId, []);
              return;
            }
            const options = results.data.map((product) =>
              createProductOptionItem(product),
            );
            updateProductOptionsForPosition(positionId, options);
          } catch (error) {
            console.error("Error searching Fakturownia products", error);
            if (isMountedRef.current) {
              toaster.error({
                title: t("common.error", { defaultValue: "Error" }),
                description: t("fakturownia.invoiceCreate.productSearchError", {
                  defaultValue: "Unable to search products",
                }),
              });
            }
          } finally {
            if (isMountedRef.current) {
              updateProductLoadingForPosition(positionId, false);
            }
            clearProductSearchTimeout(positionId);
          }
        })();
      }, 300);
    },
    [
      clearProductSearchTimeout,
      createProductOptionItem,
      t,
      updateProductLoadingForPosition,
      updateProductOptionsForPosition,
    ],
  );
  const applyProductSelection = useCallback(
    async (positionIndex: number, snapshot: FakturowniaProductSnapshot) => {
      // Fetch full product details if we have a product ID
      let fullSnapshot = snapshot;
      if (snapshot.id && typeof snapshot.id === "string") {
        const productId = snapshot.id;
        if (productId) {
          try {
            const detailedProduct = await getProductById(productId);
            if (detailedProduct) {
              fullSnapshot = buildProductSnapshot(detailedProduct);
            }
          } catch (error) {
            console.error(`Error fetching product ${productId} details`, error);
            // Continue with original snapshot if fetch fails
          }
        }
      }

      const productId = fullSnapshot.id;
      if (productId) {
        setValue(`positions.${positionIndex}.productId`, productId, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      } else {
        setValue(`positions.${positionIndex}.productId`, undefined, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      const productCode = fullSnapshot.code?.trim();
      if (productCode) {
        setValue(`positions.${positionIndex}.code`, productCode, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      } else {
        setValue(`positions.${positionIndex}.code`, undefined, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: false,
        });
      }
      const productName = fullSnapshot.name?.trim();
      const resolvedName =
        productName ||
        fullSnapshot.code?.trim() ||
        t("fakturownia.invoiceCreate.unnamedProduct", {
          defaultValue: "Unnamed product",
        });
      setValue(`positions.${positionIndex}.name`, resolvedName, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      const productDescription = fullSnapshot.description?.trim();
      if (productDescription) {
        setValue(`positions.${positionIndex}.description`, productDescription, {
          shouldDirty: true,
        });
      }
      const taxString =
        fullSnapshot.taxString ?? toTaxString(fullSnapshot.taxNumber);
      if (taxString) {
        setValue(`positions.${positionIndex}.tax`, taxString, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      const taxNumber =
        fullSnapshot.taxNumber ?? toTaxNumeric(fullSnapshot.taxString);
      let priceNet = fullSnapshot.priceNet;
      let priceGross = fullSnapshot.priceGross;
      if (
        priceNet !== undefined &&
        priceGross === undefined &&
        taxNumber !== undefined
      ) {
        priceGross = normalizeCurrencyNumber(priceNet * (1 + taxNumber / 100));
      }
      if (
        priceGross !== undefined &&
        priceNet === undefined &&
        taxNumber !== undefined
      ) {
        const divisor = 1 + taxNumber / 100;
        if (divisor !== 0) {
          priceNet = normalizeCurrencyNumber(priceGross / divisor);
        }
      }
      if (priceNet !== undefined) {
        setValue(`positions.${positionIndex}.priceNet`, priceNet, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      if (priceGross !== undefined) {
        setValue(`positions.${positionIndex}.priceGross`, priceGross, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      const unitValue = fullSnapshot.quantityUnit;
      if (unitValue && Object.values(Unit).includes(unitValue as Unit)) {
        setValue(`positions.${positionIndex}.unit`, unitValue as Unit, {
          shouldDirty: true,
          shouldTouch: true,
          shouldValidate: true,
        });
      }
      // Pass the priceNet explicitly to trigger recalculation with the product prices
      recalculatePositionValues(positionIndex, {
        priceNet,
        priceGross,
        tax: taxString,
        changedField: "priceNet",
      });
      if (selectedPriceList) {
        applyPriceListEntryForProduct(
          selectedPriceList,
          positionIndex,
          fullSnapshot.id,
        );
      }
    },
    [
      applyPriceListEntryForProduct,
      recalculatePositionValues,
      selectedPriceList,
      setValue,
      t,
    ],
  );

  const handleOpenProductPicker = useCallback(() => {
    setProductPickerTargetIndex(null);
    setIsProductPickerOpen(true);
  }, [setIsProductPickerOpen, setProductPickerTargetIndex]);

  const handleProductPickerSelect = useCallback(
    (product: FakturowniaClientProduct) => {
      const targetIndex = productPickerTargetIndex ?? ensurePositionSlot();
      void (async () => {
        try {
          await applyProductSelection(
            targetIndex,
            buildProductSnapshot(product as Product),
          );
        } catch (error) {
          toaster.create({
            title: t("fakturownia.invoiceCreate.productPickerError", {
              defaultValue: "Failed to add product to invoice",
            }),
            type: "error",
            meta: { closable: true },
          });
        } finally {
          setIsProductPickerOpen(false);
          setProductPickerTargetIndex(null);
        }
      })();
    },
    [applyProductSelection, ensurePositionSlot, productPickerTargetIndex],
  );

  const handleRemovePosition = useCallback(
    (positionIndex: number, positionId: string) => {
      clearProductStateForPosition(positionId);
      removePosition(positionIndex);
    },
    [clearProductStateForPosition, removePosition],
  );

  useEffect(
    () => () => {
      Object.values(productSearchTimeoutsRef.current).forEach((timeoutId) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });
      productSearchTimeoutsRef.current = {};
    },
    [],
  );

  return {
    hasRoundingAdjustments,
    productSuggestionsByPosition,
    isProductComboboxLoadingByPosition,
    priceListOptions,
    priceListInputValue,
    setPriceListInputValue,
    isPriceListLoading,
    priceListError,
    isProductPickerOpen,
    closeProductPicker: () => {
      setIsProductPickerOpen(false);
      setProductPickerTargetIndex(null);
    },
    positionFields,
    appendPosition,
    hasAnyPositionWithDiscount,
    recalculatePositionValues,
    resetPositionPricesToProductDefaults,
    scheduleProductSearch,
    applyProductSelection,
    handleOpenProductPicker,
    handleProductPickerSelect,
    handleRemovePosition,
  };
}
