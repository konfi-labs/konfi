"use client";

import { useT } from "@/i18n/client";
import type {
  ProductAgentCatalogSetupOption,
  ProductAgentCatalogSetupPlan,
} from "@/lib/ai/durable-agents/product-workflow.types";
import {
  Badge,
  Box,
  Button,
  Card,
  Field,
  HStack,
  Input,
  Switch,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";

interface ProductCatalogSetupEditorProps {
  onChange: (plan: ProductAgentCatalogSetupPlan) => void;
  plan: ProductAgentCatalogSetupPlan;
}

function formatOptionLines(options: ProductAgentCatalogSetupOption[]): string {
  return options
    .map((option) =>
      option.label === option.value
        ? option.label
        : `${option.label} | ${option.value}`,
    )
    .join("\n");
}

function parseOptionLines(value: string): ProductAgentCatalogSetupOption[] {
  return value.split(/\r?\n/).flatMap((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return [];
    }

    const [labelPart, valuePart] = trimmedLine
      .split("|")
      .map((part) => part.trim());
    const label = labelPart || valuePart || "";
    const optionValue = valuePart || label;

    if (!label) {
      return [];
    }

    return [
      {
        label,
        value: optionValue,
      },
    ];
  });
}

function formatAttributeRefLines(
  refs: NonNullable<
    ProductAgentCatalogSetupPlan["productType"]
  >["attributeRefs"],
): string {
  return refs
    .map((ref) =>
      ref.attributeId
        ? `${ref.attributeName} | ${ref.attributeId}`
        : ref.attributeName,
    )
    .join("\n");
}

function parseAttributeRefLines(
  value: string,
): NonNullable<ProductAgentCatalogSetupPlan["productType"]>["attributeRefs"] {
  return value.split(/\r?\n/).flatMap((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      return [];
    }

    const [attributeNamePart, attributeIdPart] = trimmedLine
      .split("|")
      .map((part) => part.trim());
    const attributeName = attributeNamePart || attributeIdPart || "";

    if (!attributeName) {
      return [];
    }

    return [
      {
        ...(attributeIdPart ? { attributeId: attributeIdPart } : {}),
        attributeName,
      },
    ];
  });
}

export default function ProductCatalogSetupEditor({
  onChange,
  plan,
}: ProductCatalogSetupEditorProps) {
  const { t } = useT();

  return (
    <VStack align="stretch" gap={3}>
      {plan.attributes.map((attribute, index) => (
        <Card.Root key={`${attribute.suggestedId}-${index}`} variant="outline">
          <Card.Body p={4}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between" align="start">
                <Box>
                  <Text fontSize="sm" fontWeight="semibold">
                    {t("agents.catalogSetup.newAttribute", {
                      defaultValue: "New attribute",
                    })}
                  </Text>
                  <HStack gap={2} mt={1} flexWrap="wrap">
                    <Badge size="sm" variant="outline">
                      {attribute.suggestedType}
                    </Badge>
                    <Badge size="sm" variant="outline">
                      {attribute.suggestedId}
                    </Badge>
                  </HStack>
                </Box>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() =>
                    onChange({
                      ...plan,
                      attributes: plan.attributes.filter((_, i) => i !== index),
                    })
                  }
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("agents.catalogSetup.removeItem", {
                    defaultValue: "Remove",
                  })}
                </Button>
              </HStack>

              <Field.Root>
                <Field.Label>
                  {t("agents.catalogSetup.attributeName", {
                    defaultValue: "Attribute name",
                  })}
                </Field.Label>
                <Input
                  value={attribute.name}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      attributes: plan.attributes.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              name: event.target.value,
                            }
                          : item,
                      ),
                    })
                  }
                />
              </Field.Root>

              <Switch.Root
                checked={attribute.calculated}
                onCheckedChange={(details) =>
                  onChange({
                    ...plan,
                    attributes: plan.attributes.map((item, i) =>
                      i === index
                        ? {
                            ...item,
                            calculated: details.checked,
                          }
                        : item,
                    ),
                  })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>
                  {t("agents.catalogSetup.calculated", {
                    defaultValue: "Calculated attribute",
                  })}
                </Switch.Label>
              </Switch.Root>

              <Field.Root>
                <Field.Label>
                  {t("agents.catalogSetup.options", {
                    defaultValue: "Options",
                  })}
                </Field.Label>
                <Textarea
                  rows={5}
                  value={formatOptionLines(attribute.options)}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      attributes: plan.attributes.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              options: parseOptionLines(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                  placeholder={t("agents.catalogSetup.optionsPlaceholder", {
                    defaultValue: "Red | red\nBlue | blue",
                  })}
                />
                <Field.HelperText>
                  {t("agents.catalogSetup.optionsHelp", {
                    defaultValue:
                      "Use one option per line. Format: label | value. If you omit the value, the label will be used.",
                  })}
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}

      {plan.options.map((optionUpdate, index) => (
        <Card.Root
          key={`${optionUpdate.attributeId}-${index}`}
          variant="outline"
        >
          <Card.Body p={4}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between" align="start">
                <Box>
                  <Text fontSize="sm" fontWeight="semibold">
                    {t("agents.catalogSetup.existingAttribute", {
                      defaultValue: "Existing attribute options",
                    })}
                  </Text>
                  <HStack gap={2} mt={1} flexWrap="wrap">
                    <Badge size="sm" variant="outline">
                      {optionUpdate.attributeName}
                    </Badge>
                    <Badge size="sm" variant="outline">
                      {optionUpdate.attributeId}
                    </Badge>
                  </HStack>
                </Box>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() =>
                    onChange({
                      ...plan,
                      options: plan.options.filter((_, i) => i !== index),
                    })
                  }
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("agents.catalogSetup.removeItem", {
                    defaultValue: "Remove",
                  })}
                </Button>
              </HStack>

              <Field.Root>
                <Field.Label>
                  {t("agents.catalogSetup.options", {
                    defaultValue: "Options",
                  })}
                </Field.Label>
                <Textarea
                  rows={4}
                  value={formatOptionLines(optionUpdate.options)}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      options: plan.options.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              options: parseOptionLines(event.target.value),
                            }
                          : item,
                      ),
                    })
                  }
                  placeholder={t("agents.catalogSetup.optionsPlaceholder", {
                    defaultValue: "Red | red\nBlue | blue",
                  })}
                />
              </Field.Root>
            </VStack>
          </Card.Body>
        </Card.Root>
      ))}

      {plan.productType && (
        <Card.Root variant="outline">
          <Card.Body p={4}>
            <VStack align="stretch" gap={3}>
              <HStack justify="space-between" align="start">
                <Box>
                  <Text fontSize="sm" fontWeight="semibold">
                    {t("agents.catalogSetup.productType", {
                      defaultValue: "Product type",
                    })}
                  </Text>
                  <Badge size="sm" variant="outline" mt={1}>
                    {plan.productType.suggestedId}
                  </Badge>
                </Box>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() =>
                    onChange({
                      ...plan,
                      productType: undefined,
                    })
                  }
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("agents.catalogSetup.removeItem", {
                    defaultValue: "Remove",
                  })}
                </Button>
              </HStack>

              <Field.Root>
                <Field.Label>
                  {t("agents.catalogSetup.productTypeName", {
                    defaultValue: "Product type name",
                  })}
                </Field.Label>
                <Input
                  value={plan.productType.name}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      productType: {
                        ...plan.productType!,
                        name: event.target.value,
                      },
                    })
                  }
                />
              </Field.Root>

              <Switch.Root
                checked={plan.productType.isShippable}
                onCheckedChange={(details) =>
                  onChange({
                    ...plan,
                    productType: {
                      ...plan.productType!,
                      isShippable: details.checked,
                    },
                  })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>
                  {t("agents.catalogSetup.isShippable", {
                    defaultValue: "Shippable",
                  })}
                </Switch.Label>
              </Switch.Root>

              <Field.Root>
                <Field.Label>
                  {t("agents.catalogSetup.attributeRefs", {
                    defaultValue: "Product type attributes",
                  })}
                </Field.Label>
                <Textarea
                  rows={4}
                  value={formatAttributeRefLines(
                    plan.productType.attributeRefs,
                  )}
                  onChange={(event) =>
                    onChange({
                      ...plan,
                      productType: {
                        ...plan.productType!,
                        attributeRefs: parseAttributeRefLines(
                          event.target.value,
                        ),
                      },
                    })
                  }
                  placeholder={t(
                    "agents.catalogSetup.attributeRefsPlaceholder",
                    {
                      defaultValue: "Color | color\nSize | size",
                    },
                  )}
                />
                <Field.HelperText>
                  {t("agents.catalogSetup.attributeRefsHelp", {
                    defaultValue:
                      "Use one attribute per line. Format: name | id. The id part is optional for newly created attributes.",
                  })}
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </Card.Body>
        </Card.Root>
      )}
    </VStack>
  );
}
