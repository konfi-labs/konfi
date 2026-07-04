import {
  Menu as ChakraMenu,
  ConditionalValue,
  IconButton,
  Portal,
} from "@chakra-ui/react";
import { JSXElementConstructor, ReactElement } from "react";

type Props = {
  children?: React.ReactNode;
  icon?:
    | ReactElement<unknown, string | JSXElementConstructor<unknown>>
    | undefined;
  size?: ConditionalValue<
    "sm" | "md" | "lg" | "xl" | "xs" | "2xl" | "2xs" | undefined
  >;
  disablePortal?: boolean;
} & (
  | {
      label: string;
      ariaLabel?: string;
    }
  | {
      label?: undefined;
      ariaLabel: string;
    }
);

export default function Menu({
  children,
  ariaLabel,
  label,
  icon,
  size,
  disablePortal = false,
}: Props) {
  const buttonAriaLabel = ariaLabel ?? label;

  return (
    <ChakraMenu.Root>
      <ChakraMenu.Trigger asChild>
        <IconButton
          variant={"ghost"}
          size={size}
          aria-label={buttonAriaLabel}
          title={label ?? buttonAriaLabel}
        >
          {icon}
          {label}
        </IconButton>
      </ChakraMenu.Trigger>
      <Portal disabled={disablePortal}>
        <ChakraMenu.Positioner>
          <ChakraMenu.Content>{children}</ChakraMenu.Content>
        </ChakraMenu.Positioner>
      </Portal>
    </ChakraMenu.Root>
  );
}
