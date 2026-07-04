import { Box, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { Preview3D } from "@konfi/preview3d";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { ReactNode } from "react";

const meta = {
  title: "Store/Preview3D",
  component: Preview3D,
  parameters: {
    appTheme: "store",
  },
} satisfies Meta<typeof Preview3D>;

export default meta;
type Story = StoryObj<typeof meta>;

const frontPreviewUrl = createPreviewDataUrl("#fffbeb", "#2563eb", "FRONT");
const backPreviewUrl = createPreviewDataUrl("#f8fafc", "#16a34a", "BACK");

export const ProceduralTemplates: Story = {
  args: {
    height: 120,
    previewURLs: [frontPreviewUrl],
    width: 200,
  },
  render: () => (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={5}>
      <PreviewFrame title="Flat">
        <Preview3D
          height={120}
          previewURLs={[frontPreviewUrl]}
          template="FLAT"
          width={200}
        />
      </PreviewFrame>
      <PreviewFrame title="Box">
        <Preview3D
          height={140}
          previewURLs={[frontPreviewUrl, backPreviewUrl]}
          template="BOX"
          width={140}
        />
      </PreviewFrame>
      <PreviewFrame title="Booklet">
        <Preview3D
          currentPage={4}
          height={297}
          pageCount={12}
          previewURLs={[frontPreviewUrl]}
          template="BOOKLET"
          width={210}
        />
      </PreviewFrame>
    </SimpleGrid>
  ),
};

export const RollupModel: Story = {
  args: {
    height: 200,
    previewURLs: [frontPreviewUrl],
    template: "ROLLUP_STANDARD",
    width: 120,
  },
  render: () => (
    <PreviewFrame title="Rollup standard">
      <Preview3D
        height={200}
        previewURLs={[frontPreviewUrl]}
        template="ROLLUP_STANDARD"
        width={120}
      />
    </PreviewFrame>
  ),
};

function PreviewFrame({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <VStack align="stretch" gap={3}>
      <Text color="fg.muted" fontSize="sm" fontWeight="medium">
        {title}
      </Text>
      <Box borderWidth="1px" h="360px" overflow="hidden">
        {children}
      </Box>
    </VStack>
  );
}

function createPreviewDataUrl(
  background: string,
  foreground: string,
  label: string,
) {
  return `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1024" viewBox="0 0 720 1024">
      <rect width="720" height="1024" fill="${background}"/>
      <rect x="72" y="96" width="576" height="832" rx="32" fill="${foreground}" opacity="0.9"/>
      <circle cx="360" cy="360" r="132" fill="#ffffff" opacity="0.9"/>
      <text x="360" y="648" text-anchor="middle" font-family="Arial, sans-serif" font-size="96" font-weight="700" fill="#ffffff">${label}</text>
    </svg>
  `)}`;
}
