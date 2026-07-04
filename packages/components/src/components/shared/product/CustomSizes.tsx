"use client";

import { Box, Collapsible, HStack, Text } from "@chakra-ui/react";
import { Configuration, CustomSize } from "@konfi/types";
import { i18n, TFunction } from "i18next";
import { Dispatch, startTransition, useEffect, useMemo, useState } from "react";
import { RadioGroup } from "../custom-radio/RadioGroup";
import { MaterialSymbol } from "../MaterialSymbol";

interface Props {
  updateConfiguration: Dispatch<Partial<Configuration>>;
  customSizes: CustomSize[];
  width: number;
  height: number;
  t: TFunction;
  i18n: i18n;
}

export function CustomSizes({
  updateConfiguration,
  customSizes,
  width,
  height,
  t,
  i18n,
}: Props) {
  "use memo";
  const options = useMemo(() => {
    return customSizes.map((size) => ({
      label: size.label,
      value: `${size.width} ${size.height}`,
    }));
  }, [customSizes]);
  const initOption = options.find(
    (option) => option.value === `${width} ${height}`,
  );
  const [value, setValue] = useState<string | null>(
    initOption ? initOption.value : options[0].value,
  );
  const exists = useMemo(() => {
    return customSizes.some(
      (size) => size.width === width && size.height === height,
    );
  }, [customSizes, width, height]);
  const [open, setOpen] = useState(exists);

  function _handleChange(value: string) {
    const [width, height] = value.split(" ").map(Number);
    setValue(value);
    updateConfiguration({ width, height });
  }

  useEffect(() => {
    if (!exists) setOpen(false);
  }, [exists]);

  function handleOpenCollapse() {
    if (!open) {
      queueMicrotask(() => {
        setValue(options[0].value);
        updateConfiguration({
          width: customSizes[0].width,
          height: customSizes[0].height,
        });
      });
    }
    setOpen(!open);
  }

  return (
    <Box w={"100%"} py={"2"}>
      <Collapsible.Root open={open}>
        <Collapsible.Trigger>
          <HStack cursor={"pointer"} onClick={handleOpenCollapse}>
            <Text fontSize={"xl"} fontWeight={"600"}>
              {t
                ? t("forms.headings.customSizes", {
                    defaultValue: "Custom Sizes",
                  })
                : "Custom Sizes"}
            </Text>
            <MaterialSymbol
              data-state={open ? "open" : "closed"}
              rotate={open ? "180deg" : "0deg"}
              paddingTop={open ? "4px" : "0px"}
              transition={"rotate .3s"}
            >
              expand_more
            </MaterialSymbol>
          </HStack>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Box mt={4}>
            <RadioGroup
              name={"customSizes"}
              options={options}
              handleChange={(value) =>
                startTransition(() => {
                  if (typeof value === "string") {
                    _handleChange(value);
                  }
                })
              }
              value={value}
              t={t}
              i18n={i18n}
            />
          </Box>
        </Collapsible.Content>
      </Collapsible.Root>
    </Box>
  );
}
