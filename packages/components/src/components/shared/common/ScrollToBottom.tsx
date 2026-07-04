import { Box, Button, Presence } from "@chakra-ui/react";
import { TFunction } from "i18next";
import { StickToBottomInstance } from "use-stick-to-bottom";
import { MaterialSymbol } from "../MaterialSymbol";

export function ScrollToBottom({
  sticky,
  t,
}: {
  sticky: StickToBottomInstance;
  t: TFunction;
}) {
  return (
    <Presence
      position="absolute"
      alignSelf="center"
      bottom="4"
      zIndex="10"
      present={!sticky.isAtBottom}
      animationName={{ _open: "fade-in", _closed: "fade-out" }}
      animationDuration="moderate"
    >
      <Box>
        <Button
          size="xs"
          onClick={() => {
            sticky.scrollToBottom();
          }}
          variant="surface"
          colorPalette="gray"
        >
          <MaterialSymbol>arrow_downward</MaterialSymbol>
          {t("common.scrollDown", { defaultValue: "Scroll to bottom" })}
        </Button>
      </Box>
    </Presence>
  );
}
