import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { RenderResult, render as rtlRender } from "@testing-library/react";

export function render(ui: React.ReactNode): RenderResult {
  return rtlRender(<>{ui}</>, {
    wrapper: (props: React.PropsWithChildren) => (
      <ChakraProvider value={defaultSystem}>{props.children}</ChakraProvider>
    ),
  });
}
