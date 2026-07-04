"use client";

import { useWhatsNew } from "@/context/whatsNew";
import { useT } from "@/i18n/client";
import { IconButton } from "@chakra-ui/react";
import { MaterialSymbol, Tooltip } from "@konfi/components";

export default function WhatsNewIconButton() {
  const { t } = useT();
  const { openDialog } = useWhatsNew();

  return (
    <Tooltip
      content={t("whatsNew.title", { defaultValue: "What's New" })}
      positioning={{ placement: "top" }}
    >
      <IconButton
        onClick={openDialog}
        variant="ghost"
        aria-label={t("whatsNew.title", { defaultValue: "What's New" })}
        size="sm"
      >
        <MaterialSymbol>info</MaterialSymbol>
      </IconButton>
    </Tooltip>
  );
}
