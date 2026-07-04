import { Alert } from "@chakra-ui/react";
import type { TranslateFn } from "./types";

type AiSuggestionsAlertProps = {
  hasSuggestions: boolean;
  t: TranslateFn;
};

export default function AiSuggestionsAlert({
  hasSuggestions,
  t,
}: AiSuggestionsAlertProps) {
  if (!hasSuggestions) return null;

  return (
    <Alert.Root status="info">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>
          {t("externalProducts.aiSuggestionsTitle", {
            defaultValue: "AI Suggestions Available",
          })}
        </Alert.Title>
        <Alert.Description>
          {t("externalProducts.aiSuggestionsDescription", {
            defaultValue:
              "Review the suggestions below. High-confidence mappings (≥70%) have been applied automatically.",
          })}
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
