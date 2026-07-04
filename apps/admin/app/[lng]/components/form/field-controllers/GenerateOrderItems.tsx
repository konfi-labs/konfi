import { useConfiguration } from "@/context/configuration";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import { generateOrderItemsFromClientInformationAction } from "@/actions/product-suggestions";
import { firestore } from "@/lib/firebase/clientApp";
import { Box, Button, Collapsible, Textarea } from "@chakra-ui/react";
import {
  GenerateInputWrapper,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { create, db } from "@konfi/firebase";
import { FormattedOrderItem } from "@konfi/types";
import { getAttributes, getRandomId } from "@konfi/utils";
import { useChannels } from "context/channels";
import { isEmpty } from "es-toolkit/compat";
import { useState } from "react";
import { FieldValues, UseFieldArrayPrepend } from "react-hook-form";
import { getCategorizedCardProducts } from "./ProductGroupedIndexedSearch";

interface Props {
  prepend: UseFieldArrayPrepend<FieldValues, string>;
}

export default function GenerateOrderItems({ prepend }: Props) {
  const { t } = useT(["order", "translation"]);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");
  const { channel } = useChannels();
  const { attributes } = useConfiguration();
  const tenantContext = useTenantContext();

  async function handleOnClick() {
    if (loading) return;
    if (!channel?.id) return;
    if (!attributes || isEmpty(attributes)) {
      toaster.error({
        title: t("common.error", { defaultValue: "An error occurred" }),
        description: t("order.noAttributes", {
          defaultValue: "No attributes found for the channel",
        }),
        duration: 5000,
      });
      return;
    }
    const question = value.trim();
    if (!question) return;

    setLoading(true);

    try {
      const categorizedCardProducts = await getCategorizedCardProducts(
        channel.id,
        tenantContext,
      );
      const products: {
        productId: string;
        productName: string;
        attributesWithOptions: {
          attributeName: string;
          options: string[];
        }[];
      }[] = [];
      if (
        categorizedCardProducts &&
        Object.keys(categorizedCardProducts).length > 0
      ) {
        for (const category in categorizedCardProducts) {
          for (const product of categorizedCardProducts[category]) {
            const productAttributes = getAttributes(
              attributes,
              product.attributes ?? [],
              product.attributeOptions ?? {},
            );
            if (!productAttributes) continue;
            products.push({
              productId: product.id,
              productName: product.name,
              attributesWithOptions: productAttributes.map((attribute) => ({
                attributeName: attribute.name,
                options: attribute.options.map((option) => option.label),
              })),
            });
          }
        }
      } else {
        console.warn(
          "No categorized card products found, passing an empty products array.",
        );
      }

      const result = await generateOrderItemsFromClientInformationAction({
        channelId: channel.id,
        question,
        productNamesWithAttributes: products,
      });

      if (!result.ok || isEmpty(result.items)) {
        toaster.error({
          title: t("common.error", { defaultValue: "An error occurred" }),
          description: t("order.generationFailed", {
            defaultValue: "Failed to generate order",
          }),
          duration: 5000,
        });
        return;
      }

      const orderItems: FormattedOrderItem[] = result.items;
      for (const orderItem of orderItems) {
        prepend(orderItem);
      }

      try {
        await create(
          firestore,
          {
            testCaseId: getRandomId(),
            input: {
              channelId: channel.id,
              question,
              products,
            },
            reference: orderItems,
          },
          undefined,
          db.collection(firestore, "generatedOrderItems"),
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          tenantContext,
        );
      } catch (error) {
        console.error("Error creating generated order items reference:", error);
      }
      toaster.success({
        title: t("order.generated", { defaultValue: "Order generated" }),
        description: t("order.generatedDescription", {
          defaultValue:
            "Order has been generated based on customer information",
        }),
        duration: 5000,
      });
    } catch (error) {
      console.error(error);
      toaster.error({
        title: t("common.error", { defaultValue: "An error occurred" }),
        description: t("order.generationFailed", {
          defaultValue: "Failed to generate order",
        }),
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Collapsible.Root w={"100%"} unmountOnExit>
      <Collapsible.Trigger asChild>
        <Button
          w={"100%"}
          size={"2xs"}
          variant={"subtle"}
          colorPalette={"primary"}
        >
          <MaterialSymbol>draw</MaterialSymbol>
          {t("order.generateFromClientInformation", {
            defaultValue: "Generate from client information",
          })}
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content overflow={loading ? "visible" : undefined}>
        <Box w={"100%"} mt={2}>
          <GenerateInputWrapper loading={loading}>
            <Textarea
              zIndex={1}
              bg={{ base: "white", _dark: "black" }}
              value={value}
              onChange={(e) => setValue(e.currentTarget.value)}
              borderRadius="3xl"
              placeholder={t("order.generateFromClientInformationPlaceholder", {
                defaultValue:
                  "Client information. Do not include personal data, only order details.",
              })}
              disabled={loading}
              opacity={1}
              autoresize
            />
          </GenerateInputWrapper>
        </Box>
        <Button
          w={"100%"}
          size={"2xs"}
          pr={6}
          mt={loading ? 2 : undefined}
          mb={1}
          onClick={handleOnClick}
          disabled={!value || loading}
          loading={loading}
          colorPalette={"primary"}
        >
          <MaterialSymbol>draw</MaterialSymbol>
          {t("order.generate", { defaultValue: "Generate" })}
        </Button>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
