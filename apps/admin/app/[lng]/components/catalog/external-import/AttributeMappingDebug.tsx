import { Field, Text, Textarea, VStack } from "@chakra-ui/react";
import type { AttributeMapping, ExternalProduct } from "@konfi/types";
import type { TranslateFn } from "./types";

type AttributeMappingDebugProps = {
  externalAttributes: ExternalProduct["attributes"][number][];
  draftMappings: AttributeMapping[];
  t: TranslateFn;
};

export default function AttributeMappingDebug({
  externalAttributes,
  draftMappings,
  t,
}: AttributeMappingDebugProps) {
  return (
    <VStack alignItems="stretch" gap={2}>
      <Text fontWeight="semibold">
        {t("externalProducts.debugTitle", {
          defaultValue: "Debug",
        })}
      </Text>
      <Field.Root>
        <Field.Label>
          {t("externalProducts.debugExternalAttributes", {
            defaultValue: "External attributes",
          })}
        </Field.Label>
        <Textarea
          readOnly
          value={JSON.stringify(externalAttributes, null, 2)}
          rows={4}
          borderRadius="3xl"
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          {t("externalProducts.debugMappings", {
            defaultValue: "Current mappings",
          })}
        </Field.Label>
        <Textarea
          readOnly
          value={JSON.stringify(draftMappings, null, 2)}
          rows={4}
          borderRadius="3xl"
        />
      </Field.Root>
    </VStack>
  );
}