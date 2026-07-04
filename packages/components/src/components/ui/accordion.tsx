import { Accordion, HStack } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import * as React from "react";

interface AccordionItemTriggerProps extends Accordion.ItemTriggerProps {
  indicatorPlacement?: "start" | "end";
  ref?: React.Ref<HTMLButtonElement>;
}

export const AccordionItemTrigger = (props: AccordionItemTriggerProps) => {
  const { children, indicatorPlacement = "end", ref, ...rest } = props;
  return (
    <Accordion.ItemTrigger {...rest} ref={ref}>
      {indicatorPlacement === "start" && (
        <Accordion.ItemIndicator rotate={{ base: "-90deg", _open: "0deg" }}>
          <ChevronDown />
        </Accordion.ItemIndicator>
      )}
      <HStack gap="4" flex="1" textAlign="start" width="full">
        {children}
      </HStack>
      {indicatorPlacement === "end" && (
        <Accordion.ItemIndicator>
          <ChevronDown />
        </Accordion.ItemIndicator>
      )}
    </Accordion.ItemTrigger>
  );
};

interface AccordionItemContentProps extends Accordion.ItemContentProps {
  ref?: React.Ref<HTMLDivElement>;
}

export const AccordionItemContent = (props: AccordionItemContentProps) => {
  const { ref, ...rest } = props;
  return (
    <Accordion.ItemContent>
      <Accordion.ItemBody {...rest} ref={ref} />
    </Accordion.ItemContent>
  );
};

export const AccordionRoot = Accordion.Root;
export const AccordionItem = Accordion.Item;
