"use client";

import { useT } from "@/i18n/client";
import { AsyncSelect, Field } from "@konfi/components";
import { NestedProductType } from "@konfi/types";
import { isMatrixLikePriceType } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { useEffect, useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

type ProductTypeOption = {
  label: string;
  value: string;
  object: NestedProductType;
};

function toProductTypeOption(
  productType: NestedProductType | null | undefined,
): ProductTypeOption | null {
  if (!productType?.id) {
    return null;
  }

  return {
    label: productType.name,
    value: productType.id,
    object: productType,
  };
}

export const ProductType = () => {
  const { t } = useT();
  const {
    setValue,
    formState: { errors },
  } = useFormContext();
  const { productTypes, productTypesSearchResults, searchProductTypes } =
    useConfiguration();
  const [productType, setProductType] = useState<NestedProductType | null>(
    null,
  );
  const [watchPriceType, watchProductType, watchProductTypeId] = useWatch({
    name: ["priceType", "productType", "productType.id"],
  });

  useEffect(() => {
    if (watchProductTypeId !== productType?.id && productType !== null)
      setValue("attributes", []);
  }, [productType, setValue, watchProductTypeId]);

  useEffect(() => {
    if (!watchProductTypeId) {
      setProductType(null);
      return;
    }

    setProductType(watchProductType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchProductTypeId]);

  const options = useMemo<ProductTypeOption[] | undefined>(() => {
    const optionMap = new Map<string, ProductTypeOption>();
    const allProductTypes = [
      watchProductType,
      ...(productTypesSearchResults ?? []),
      ...(productTypes ?? []),
    ];

    for (const item of allProductTypes) {
      const option = toProductTypeOption(item);

      if (!option || optionMap.has(option.value)) {
        continue;
      }

      optionMap.set(option.value, option);
    }

    const values = [...optionMap.values()];

    return values.length > 0 ? values : undefined;
  }, [productTypes, productTypesSearchResults, watchProductType]);

  if (!isMatrixLikePriceType(watchPriceType)) return null;

  return (
    <Field
      mt={4}
      pb={"2"}
      label={t("admin.productType", { defaultValue: "Product type" })}
      invalid={!!errors["productType"]}
      errorText={`${errors["productType"]?.message}`}
    >
      <AsyncSelect
        fieldData={{
          name: "productType",
          placeholder: t("admin.selectProductTypePlaceholder", {
            defaultValue: "Select product type...",
          }),
          searchFor: "productTypes",
          searchResult: "object",
        }}
        disabled={false}
        searchOptions={options}
        searchFn={{ productTypes: searchProductTypes }}
        t={t}
      />
    </Field>
  );
};
