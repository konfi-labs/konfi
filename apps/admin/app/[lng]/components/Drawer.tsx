import { Box } from "@chakra-ui/react/box";
import { CloseButton } from "@chakra-ui/react/button";
import { Drawer as ChakraDrawer } from "@chakra-ui/react/drawer";
import { Portal } from "@chakra-ui/react/portal";
import { ConditionalValue } from "@chakra-ui/react/styled-system";
import { isElectron } from "@konfi/utils";
import { Dispatch, ReactNode, SetStateAction } from "react";
import { useSwipeable } from "react-swipeable";

type Props = {
  header: string;
  children?: ReactNode;
  size?: ConditionalValue<
    "sm" | "md" | "lg" | "xl" | "xs" | "full" | undefined
  >;
  open?: boolean;
  setOpen?: Dispatch<SetStateAction<boolean>>;
  closeOnOverlayClick?: boolean;
  restoreFocus?: boolean;
  lazyMount?: boolean;
  unmountOnExit?: boolean;
};

export default function Drawer({
  header,
  children,
  size = "md",
  open = false,
  setOpen,
  closeOnOverlayClick = true,
  restoreFocus = true,
  lazyMount = false,
  unmountOnExit = false,
}: Props) {
  const handler = useSwipeable({
    onSwipedRight: () => {
      if (setOpen) {
        setOpen(false);
      }
    },
  });

  if (!setOpen) {
    throw new Error(
      "Drawer component requires an 'open' state and an 'setOpen' function.",
    );
  }

  return (
    <ChakraDrawer.Root
      open={open}
      onOpenChange={({ open: _open }) => setOpen(_open)}
      size={size}
      closeOnInteractOutside={closeOnOverlayClick}
      restoreFocus={restoreFocus}
      lazyMount={lazyMount}
      unmountOnExit={unmountOnExit}
    >
      <Portal>
        <ChakraDrawer.Backdrop />
        <ChakraDrawer.Positioner>
          <ChakraDrawer.Content
            {...(open ? handler : {})}
            m={size === "full" ? 0 : undefined}
            mt={size === "full" ? (isElectron() ? 6 : 0) : undefined}
            offset={"4"}
          >
            <ChakraDrawer.Header>
              <ChakraDrawer.Title>{header}</ChakraDrawer.Title>
            </ChakraDrawer.Header>
            <ChakraDrawer.Body
              pr={5}
              tabIndex={-1}
              overflow="hidden"
              display="flex"
              minH={0}
            >
              <Box
                flex={1}
                minH={0}
                h="full"
                overflowY="auto"
                overflowX="hidden"
                overscrollBehavior="contain"
                tabIndex={-1}
                pe={8}
                pl={1}
                pb={size === "full" ? 8 : 0}
              >
                {children}
              </Box>
            </ChakraDrawer.Body>
            <ChakraDrawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </ChakraDrawer.CloseTrigger>
          </ChakraDrawer.Content>
        </ChakraDrawer.Positioner>
      </Portal>
    </ChakraDrawer.Root>
  );
}
