import { Box, Heading, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StoreLandingHero } from "@konfi/components";
import type { CSSProperties } from "react";
import Processing from "../../../store/app/[lng]/components/checkout/Processing";
import { HowItWorks } from "../../../store/app/[lng]/components/home/HowItWorks";
import { StoreTrustGrid } from "../../../store/app/[lng]/components/home/StoreTrustGrid";
import Loader from "../../../store/app/[lng]/components/Loader";

const meta = {
  title: "Store/Components",
  component: Loader,
  parameters: {
    appTheme: "store",
  },
} satisfies Meta<typeof Loader>;

export default meta;
type Story = StoryObj<typeof meta>;

const storefrontRoundedThemeStyle = {
  "--konfi-store-block-radius": "32px",
  "--konfi-store-button-radius": "9999px",
  "--konfi-store-card-radius": "24px",
  "--konfi-store-media-radius": "18px",
  "--konfi-store-radius": "32px",
} as CSSProperties;

export const CheckoutLoading: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: (args) => (
    <VStack align="stretch" gap={6}>
      <Box>
        <Heading size="lg">Store loading state</Heading>
        <Text color="fg.muted">
          Uses the storefront Chakra system and imports an app component.
        </Text>
      </Box>
      <Box minH="320px" borderWidth="1px" borderRadius="3xl" overflow="hidden">
        <Loader {...args} />
      </Box>
    </VStack>
  ),
};

export const CheckoutProcessing: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: () => (
    <Box minH="320px" borderWidth="1px" borderRadius="3xl" overflow="hidden">
      <Processing />
    </Box>
  ),
};

export const HomepageTrustGrid: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: () => (
    <Box maxW="6xl" style={storefrontRoundedThemeStyle}>
      <StoreTrustGrid lng="en" />
    </Box>
  ),
};

export const HomepageHowItWorks: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: () => (
    <Box maxW="6xl" style={storefrontRoundedThemeStyle}>
      <HowItWorks lng="en" />
    </Box>
  ),
};

export const HomepageHeroVariants: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: () => (
    <VStack align="stretch" gap={8} style={storefrontRoundedThemeStyle}>
      <Box>
        <Heading size="lg">Hero Variants</Heading>
        <Text color="fg.muted">
          Default, fullscreen, and editorial layouts share the same content.
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, xl: 3 }} gap={6}>
        {(["default", "fullscreen", "editorial"] as const).map((variant) => (
          <Box
            key={variant}
            borderWidth="1px"
            borderRadius="3xl"
            overflow="hidden"
          >
            <StoreLandingHero
              lng="en"
              variant={variant}
              labels={{
                fallbackDescription:
                  "Upload, proof, produce and ship in one clean flow.",
                fallbackTitle: "Premium print work, ready faster",
                primaryCtaLabel: "Start Order",
                secondaryCtaLabel: "Browse Products",
              }}
            />
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  ),
};

export const HomepageHeroButtonStyles: Story = {
  args: {
    text: "Preparing your checkout preview…",
  },
  render: () => (
    <VStack align="stretch" gap={8} style={storefrontRoundedThemeStyle}>
      <Box>
        <Heading size="lg">Hero Button Styles</Heading>
        <Text color="fg.muted">
          Storefront theme button styles applied to primary and secondary hero
          CTAs.
        </Text>
      </Box>
      <SimpleGrid columns={{ base: 1, xl: 3 }} gap={6}>
        {(["solid", "subtle", "outline"] as const).map((buttonStyle) => (
          <Box
            key={buttonStyle}
            borderWidth="1px"
            borderRadius="3xl"
            overflow="hidden"
          >
            <StoreLandingHero
              buttonStyle={buttonStyle}
              lng="en"
              labels={{
                fallbackDescription:
                  "Each tenant can choose how storefront calls to action appear.",
                fallbackTitle: `${buttonStyle} storefront buttons`,
                primaryCtaLabel: "Start Order",
                secondaryCtaLabel: "Browse Products",
              }}
            />
          </Box>
        ))}
      </SimpleGrid>
    </VStack>
  ),
};
