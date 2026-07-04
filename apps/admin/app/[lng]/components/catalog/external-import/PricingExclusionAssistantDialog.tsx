"use client";

import {
  Button,
  Dialog,
  Field,
  Portal,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { suggestExternalProductPricingExclusionRules } from "@/actions/external-products";
import { MaterialSymbol, toaster } from "@konfi/components";
import type {
  AttributeMapping,
  ExternalProduct,
  ExternalProductPricingExclusionRule,
} from "@konfi/types";
import { useState } from "react";
import type { TranslateFn } from "./types";
import PricingExclusionRulePreview, {
  type PricingExclusionAssistantSuggestion,
} from "./PricingExclusionRulePreview";

type PricingExclusionAssistantDialogProps = {
  addPricingExclusionRules: (
    rules: ExternalProductPricingExclusionRule[],
  ) => void;
  displayExternalAttributes: ExternalProduct["attributes"][number][];
  draftMappings: AttributeMapping[];
  draftPricingExclusionRules: ExternalProductPricingExclusionRule[];
  productId: string;
  t: TranslateFn;
};

export default function PricingExclusionAssistantDialog({
  addPricingExclusionRules,
  displayExternalAttributes,
  draftMappings,
  draftPricingExclusionRules,
  productId,
  t,
}: PricingExclusionAssistantDialogProps) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<
    PricingExclusionAssistantSuggestion | undefined
  >();

  const handleGenerate = async () => {
    if (description.trim().length === 0) {
      toaster.create({
        title: t("externalProducts.pricingExclusionsAssistantMissingInput", {
          defaultValue: "Describe the exclusions first",
        }),
        type: "warning",
      });
      return;
    }

    setGenerating(true);
    setSuggestion(undefined);

    try {
      const result = await suggestExternalProductPricingExclusionRules({
        attributeMappings: draftMappings,
        description,
        existingPricingExclusionRules: draftPricingExclusionRules,
        externalProductId: productId,
      });

      if (!result.success) {
        toaster.create({
          title: t("externalProducts.pricingExclusionsAssistantFailed", {
            defaultValue: "Could not generate exclusions",
          }),
          description: result.error,
          type: "error",
        });
        return;
      }

      setSuggestion({
        estimatedConfigurationCountBefore:
          result.estimatedConfigurationCountBefore,
        rules: result.rules,
        summary: result.summary,
        warnings: result.warnings,
      });

      if (result.rules.length === 0) {
        toaster.create({
          title: t("externalProducts.pricingExclusionsAssistantNoRules", {
            defaultValue: "No valid rules generated",
          }),
          description: result.warnings.join(" "),
          type: "info",
        });
      }
    } catch (error) {
      console.error("Error generating pricing exclusion rules:", error);
      toaster.create({
        title: t("common.error", { defaultValue: "Error" }),
        type: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (!suggestion?.rules.length) {
      return;
    }

    addPricingExclusionRules(suggestion.rules);
    setOpen(false);
    setSuggestion(undefined);
    setDescription("");
    toaster.create({
      title: t("externalProducts.pricingExclusionsAssistantApplied", {
        defaultValue: "Generated exclusion rules added",
      }),
      description: t(
        "externalProducts.pricingExclusionsAssistantAppliedDescription",
        {
          defaultValue: "{{count}} rules added. Save mappings to persist them.",
          count: suggestion.rules.length,
        },
      ),
      type: "success",
    });
  };

  return (
    <>
      <Button
        alignSelf="flex-start"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <MaterialSymbol>auto_awesome</MaterialSymbol>
        {t("externalProducts.pricingExclusionsAssistantOpen", {
          defaultValue: "Generate Exclusions",
        })}
      </Button>

      <Dialog.Root
        open={open}
        onOpenChange={(details) => setOpen(details.open)}
        placement="center"
        size="xl"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner
            alignItems="center"
            display="flex"
            justifyContent="center"
            minH="100dvh"
            p={4}
          >
            <Dialog.Content
              display="flex"
              flexDirection="column"
              maxH="calc(100dvh - 2rem)"
              my={0}
            >
              <Dialog.Header>
                <Dialog.Title>
                  {t("externalProducts.pricingExclusionsAssistantTitle", {
                    defaultValue: "Generate Supplier Exclusions",
                  })}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body minH={0} overflowY="auto">
                <VStack alignItems="stretch" gap={4}>
                  <Text color="fg.muted">
                    {t(
                      "externalProducts.pricingExclusionsAssistantDescription",
                      {
                        defaultValue:
                          "Describe supplier options that make other options invalid. The assistant will turn the description into draft exclusion rules for this mapped product.",
                      },
                    )}
                  </Text>

                  <Field.Root required>
                    <Field.Label>
                      {t(
                        "externalProducts.pricingExclusionsAssistantPromptLabel",
                        {
                          defaultValue: "Option exclusion description",
                        },
                      )}
                    </Field.Label>
                    <Textarea
                      name="pricing-exclusion-description"
                      autoComplete="off"
                      minH="140px"
                      value={description}
                      onChange={(event) =>
                        setDescription(event.currentTarget.value)
                      }
                      placeholder={t(
                        "externalProducts.pricingExclusionsAssistantPromptPlaceholder",
                        {
                          defaultValue:
                            "Example: cover paper cannot be heavier than inner paper; no cover lamination excludes selective varnish and foil…",
                        },
                      )}
                    />
                  </Field.Root>

                  {suggestion ? (
                    <PricingExclusionRulePreview
                      displayExternalAttributes={displayExternalAttributes}
                      suggestion={suggestion}
                      t={t}
                    />
                  ) : null}
                </VStack>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={generating}
                >
                  {t("common.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  variant="ai"
                  onClick={handleGenerate}
                  loading={generating}
                >
                  <MaterialSymbol>auto_awesome</MaterialSymbol>
                  {t("externalProducts.pricingExclusionsAssistantGenerate", {
                    defaultValue: "Generate Rules",
                  })}
                </Button>
                <Button
                  colorPalette="primary"
                  onClick={handleApply}
                  disabled={!suggestion?.rules.length || generating}
                >
                  {t("externalProducts.pricingExclusionsAssistantApply", {
                    defaultValue: "Add Draft Rules",
                  })}
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </>
  );
}
