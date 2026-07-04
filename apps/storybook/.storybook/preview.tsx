import { Box, ChakraProvider } from "@chakra-ui/react";
import { ColorModeProvider, Toaster, type ColorMode } from "@konfi/components";
import { withThemeByClassName } from "@storybook/addon-themes";
import type { Decorator, Preview, ReactRenderer } from "@storybook/nextjs-vite";
import { system as adminSystem } from "../../admin/theme";
import { system as storeSystem } from "../../store/theme";
import "../src/storybook.css";

type AppTheme = "admin" | "store";

const appThemes = {
  admin: adminSystem,
  store: storeSystem,
} as const;

function isAppTheme(value: unknown): value is AppTheme {
  return value === "admin" || value === "store";
}

function getAppTheme(value: unknown, fallback: AppTheme) {
  return isAppTheme(value) ? value : fallback;
}

function getColorMode(value: unknown): ColorMode {
  return value === "dark" ? "dark" : "light";
}

const withKonfiProviders: Decorator = (Story, context) => {
  const globalTheme = getAppTheme(context.globals.appTheme, "admin");
  const appTheme = getAppTheme(context.parameters.appTheme, globalTheme);
  const colorMode = getColorMode(context.globals.theme);

  return (
    <ChakraProvider value={appThemes[appTheme]}>
      <ColorModeProvider enableSystem={false} forcedTheme={colorMode}>
        <Box minH="100vh" bg="bg" color="fg" p={{ base: 4, md: 8 }}>
          <Story />
        </Box>
        <Toaster />
      </ColorModeProvider>
    </ChakraProvider>
  );
};

const preview: Preview = {
  decorators: [
    withThemeByClassName<ReactRenderer>({
      defaultTheme: "light",
      themes: { light: "", dark: "dark" },
    }),
    withKonfiProviders,
  ],
  globalTypes: {
    appTheme: {
      description: "Konfi Chakra system",
      defaultValue: "admin",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "admin", title: "Admin" },
          { value: "store", title: "Store" },
        ],
      },
    },
  },
  parameters: {
    a11y: {
      // "todo" reports accessibility violations in the test UI without
      // failing test runs; switch to "error" to make violations fail.
      test: "todo",
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    nextjs: {
      appDirectory: true,
      navigation: {
        asPath: "/en/storybook",
        pathname: "/[lng]/storybook",
        query: { lng: "en" },
        segments: [["lng", "en"]],
      },
    },
  },
  tags: ["autodocs"],
};

export default preview;