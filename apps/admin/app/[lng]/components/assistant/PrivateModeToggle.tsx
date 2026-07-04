"use client";

import { useT } from "@/i18n/client";
import { Button } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import { useAssistantHistory } from "context/assistant-history";
import { isEmpty } from "es-toolkit/compat";

export function PrivateModeToggle() {
  const { t } = useT();
  const { isPrivateMode, togglePrivateMode, currentSession } =
    useAssistantHistory();

  return (
    <Button
      width={"100%"}
      size={"xs"}
      variant={isPrivateMode ? "solid" : "outline"}
      colorPalette={isPrivateMode ? "orange" : undefined}
      onClick={togglePrivateMode}
      disabled={isEmpty(currentSession.messages)}
    >
      <MaterialSymbol>
        {isPrivateMode ? "lock" : "lock_open"}
      </MaterialSymbol>
      {t("assistant.history.private")}
    </Button>
  );
}
