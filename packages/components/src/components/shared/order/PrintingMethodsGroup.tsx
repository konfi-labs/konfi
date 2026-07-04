import { Badge, Group, VStack } from "@chakra-ui/react";
import type {
  Locale,
  PrintingMethodId,
  PrintingMethodsSettings,
} from "@konfi/types";
import {
  getPrintingMethodColorPalette,
  getPrintingMethodLabel,
} from "@konfi/utils";

export function PrintingMethodsGroup({
  values,
  settings,
  t,
  locale,
}: {
  values: PrintingMethodId[];
  settings?: PrintingMethodsSettings | null;
  t: (key: string, options?: { defaultValue?: string }) => string;
  locale?: Locale | string;
}) {
  // if there are more than 2 values, split them into groups of 2, otherwise use the whole array
  const groups = values.length > 2 ? [] : [values];
  if (values.length > 2) {
    for (let i = 0; i < values.length; i += 2) {
      groups.push(values.slice(i, i + 2));
    }
  }

  return (
    <VStack align="start" gap={1}>
      {groups.map((group, groupIndex) => (
        <Group key={groupIndex} maxW={"250px"} wrap={"wrap"} gap={1}>
          {group.map((method, index) => (
            <Badge
              variant="surface"
              key={index}
              colorPalette={getPrintingMethodColorPalette(method, settings)}
            >
              {getPrintingMethodLabel(method, settings, t, locale)}
            </Badge>
          ))}
        </Group>
      ))}
    </VStack>
  );
}
