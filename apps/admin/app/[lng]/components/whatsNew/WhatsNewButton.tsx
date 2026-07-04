"use client";

import { useWhatsNew } from "@/context/whatsNew";
import { useT } from "@/i18n/client";
import { Box, Button } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { isElectron } from "@konfi/utils";

export default function WhatsNewButton() {
  const { t } = useT();
  const { hasUnseenChanges, openDialog, loading } = useWhatsNew();

  const isDev = process.env.NODE_ENV === "development";
  const topOffset = isElectron() ? { base: 10, md: 16 } : { base: 2, md: 8 };

  if (loading || (!hasUnseenChanges && !isDev)) return null;

  return (
    <Box
      position="fixed"
      top={topOffset}
      left="50%"
      transform="translateX(-50%)"
      zIndex={1500}
    >
      <Button
        onClick={openDialog}
        variant="solid"
        size="xs"
        rounded="full"
        boxShadow="md"
        gap={2}
      >
        <MaterialSymbol>info</MaterialSymbol>
        {t("whatsNew.newChanges", { defaultValue: "New changes" })}
      </Button>
    </Box>
  );
}
