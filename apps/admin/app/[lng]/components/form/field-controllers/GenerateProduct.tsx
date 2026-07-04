import { useT } from "@/i18n/client";
import { retrieveAttributesAdmin, retrievePricesAdmin } from "@/actions/ai";
import { Box, Button, HStack, Text, Textarea } from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { themeGradients } from "@konfi/components/theme";
import {
  CurrencyEnum,
  Price,
  PriceTypeEnum,
  PrintingMethod,
  ProductType,
  Volume,
} from "@konfi/types";
import { getCombinations } from "@konfi/utils";
import { useConfiguration } from "context/configuration";
import { chunk, isNull, isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import * as React from "react";
import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";

export default function GenerateProduct() {
  const [loading, setLoading] = React.useState(false);
  const [value, setValue] = React.useState("");
  const { t } = useT();
  const { attributes, loadingAttributes } = useConfiguration();
  const methods = useFormContext();
  const priceType: PriceTypeEnum = useWatch({ name: "priceType" });
  const volumes: Volume[] | undefined = useWatch({ name: "volumes" });
  const attributeOptions = useWatch({ name: "attributeOptions" });
  const _attributes = useWatch({ name: "attributes" });
  const productType: ProductType | undefined = useWatch({
    name: "productType",
  });

  useEffect(() => {
    if (loadingAttributes) setLoading(true);
    else setLoading(false);
  }, [loadingAttributes]);

  async function handleOnClick() {
    if (loading || !productType || !volumes) return;
    if (isNull(attributes) || isEmpty(attributes)) return;

    setLoading(true);

    let selectedAttributes: Record<string, string[]> = {};
    let selectedAttributesKeys: string[] = [];

    try {
      if (isEmpty(attributeOptions) && isEmpty(_attributes)) {
        toaster.create({
          title: t("admin.generatingAttributes"),
          type: "info",
        });
        const { selectedAttributes: retrievedAttributes } =
          await retrieveAttributesAdmin({
            attributes: attributes.filter(
              (attribute) =>
                productType.attributes.includes(attribute.id) &&
                attribute.calculated,
            ),
            text: value,
          });
        selectedAttributes = retrievedAttributes;

        selectedAttributesKeys = Object.keys(selectedAttributes);

        if (isEmpty(selectedAttributes)) return;
        console.log(selectedAttributes);

        methods.setValue("attributes", selectedAttributesKeys);
        methods.setValue("attributeOptions", selectedAttributes);

        toaster.success({
          title: t("admin.attributesAdded"),
          description: t("admin.attributesAddedDescription"),
          duration: 5000,
        });
      } else {
        selectedAttributes = attributeOptions;
        selectedAttributesKeys = Object.keys(attributeOptions);
        toaster.create({
          title: t("admin.skippingAttributes"),
          description: t("admin.attributesAlreadySelected"),
          type: "warning",
          duration: 5000,
        });
      }
      toaster.create({
        title: t("admin.generatingCombinations"),
        type: "info",
      });
      const _arr = [];
      const _attrs = selectedAttributesKeys.sort(
        (a: string, b: string) =>
          selectedAttributesKeys.indexOf(a) - selectedAttributesKeys.indexOf(b),
      );
      for (let i = 0; i < _attrs.length; i++) {
        const attr = _attrs[i];
        if (
          attributes?.find((obj) => obj.id === attr)?.calculated &&
          !isUndefined(selectedAttributes[attr])
        ) {
          _arr.push(selectedAttributes[attr]);
        } else continue;
      }

      const combinations = getCombinations(_arr);

      console.log(combinations);

      const chunks = chunk(combinations, 10);

      const prices: Price[] = [];

      console.log(chunks);

      const pricesPromises = chunks.map((chunk) =>
        retrievePricesAdmin({
          combinations: chunk,
          volumes: volumes.map((volume) => volume.value),
          text: value,
        }),
      );
      toaster.create({
        title: t("admin.generatingPrices"),
        type: "info",
      });
      const pricesResultsChunks = await Promise.all(pricesPromises);
      console.log(pricesResultsChunks);
      const pricesResults: {
        [key: string]: { volume: number; price: number }[];
      } = Object.assign({}, ...pricesResultsChunks);
      console.log(pricesResults);
      const priceResultsKeys = Object.keys(pricesResults);
      for (let i = 0; i < priceResultsKeys.length; i++) {
        const priceResults = pricesResults[priceResultsKeys[i]];
        const combinationId = priceResultsKeys[i];
        for (let j = 0; j < priceResults.length; j++) {
          const priceResult = priceResults[j];
          prices.push({
            combination: {
              id: combinationId,
              active: true,
              customFormat: false,
            },
            volume: {
              value: priceResult.volume,
              deliveryTime: 3 + j,
              markup: 0,
              printType: PrintingMethod.OFFSET,
            },
            currency: CurrencyEnum.PLN,
            value: priceResult.price,
            threshold: 0,
          });
        }
      }

      methods.setValue("prices", prices);
      toaster.success({
        title: t("admin.productGenerated"),
        description: t("admin.productGeneratedDescription"),
        duration: 5000,
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("admin.generationError"),
        description: t("admin.generationErrorDescription"),
        duration: 5000,
      });
    }

    setLoading(false);
  }

  if (priceType !== PriceTypeEnum.MATRIX) return null;

  return (
    <Box w={"100%"} mb={6}>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        borderRadius={"3xl"}
        placeholder={t("admin.productGenerationPlaceholder")}
      />
      <Text fontSize={"sm"} pl={1} py={2}>
        {t("admin.productGenerationSteps")
          .split("\n")
          .map((step, index) => (
            <span key={index}>
              {step}
              {index <
                t("admin.productGenerationSteps").split("\n").length - 1 && (
                <br />
              )}
            </span>
          ))}
      </Text>
      <Button
        asChild
        pr={6}
        mt={2}
        onClick={handleOnClick}
        disabled={isUndefined(isEmpty(attributes)) || loading}
        loading={loading}
        colorPalette={"primary"}
      >
        <HStack>
          <MaterialSymbol>auto_awesome</MaterialSymbol>
          <span>{t("actions.generate")}</span>
        </HStack>
        <Box
          asChild
          position={"absolute"}
          inset={"-1px"}
          h={"1px"}
          bgImage={themeGradients.topShine}
          mx={"auto"}
          mt={"auto"}
        ></Box>
      </Button>
    </Box>
  );
}
