"use client";

import {
  deleteCostRecipeAction,
  listCostRecipeCatalogAction,
  listCostRecipesAction,
  saveCostRecipeAction,
  type AttributeCatalogItem,
  type CostRecipePlain,
} from "@/actions/fakturownia-costs";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Card,
  createListCollection,
  Field,
  HStack,
  IconButton,
  Input,
  Portal,
  Select,
  Separator,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Drawer from "../Drawer";

interface ComponentRow {
  attributeId: string;
  optionValue: string;
  factor: string;
}

interface RecipeFormState {
  id?: string;
  name: string;
  targetAttributeId: string;
  targetOptionValue: string;
  components: ComponentRow[];
}

interface SelectOption {
  label: string;
  value: string;
}

function optionLabel(
  attributes: AttributeCatalogItem[],
  attributeId: string,
  optionValue: string,
): string {
  const attribute = attributes.find(
    (candidate) => candidate.id === attributeId,
  );
  const option = attribute?.options.find(
    (candidate) => candidate.value === optionValue,
  );
  return attribute && option
    ? `${attribute.name} / ${option.label}`
    : `${attributeId}:${optionValue}`;
}

function SelectField({
  disabled,
  label,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  value: string;
}) {
  const collection = useMemo(
    () => createListCollection({ items: options }),
    [options],
  );

  const select = (
    <Select.Root
      collection={collection}
      disabled={disabled}
      onValueChange={({ value: nextValue }) => onChange(nextValue[0] ?? "")}
      size="sm"
      value={value ? [value] : []}
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder={placeholder} />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.ClearTrigger />
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content maxH="64" overflowY="auto">
            {collection.items.map((item) => (
              <Select.Item key={item.value} item={item}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );

  if (!label) {
    return select;
  }

  return (
    <Field.Root>
      <Field.Label fontSize="sm">{label}</Field.Label>
      {select}
    </Field.Root>
  );
}

function blankComponent(): ComponentRow {
  return {
    attributeId: "",
    optionValue: "",
    factor: "1",
  };
}

export function CostRecipesManager({
  hideHeading = false,
}: {
  hideHeading?: boolean;
}) {
  const { t } = useT(["fakturownia", "translation"]);
  const [recipes, setRecipes] = useState<CostRecipePlain[]>([]);
  const [attributes, setAttributes] = useState<AttributeCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [formState, setFormState] = useState<RecipeFormState>({
    name: "",
    targetAttributeId: "",
    targetOptionValue: "",
    components: [blankComponent(), blankComponent()],
  });
  const loadedRef = useRef(false);
  const nameInputId = useId();

  const attributeOptions = useMemo(
    () =>
      attributes.map((attribute) => ({
        label: attribute.name,
        value: attribute.id,
      })),
    [attributes],
  );
  const optionOptionsFor = useCallback(
    (attributeId: string) =>
      attributes
        .find((attribute) => attribute.id === attributeId)
        ?.options.map((option) => ({
          label: option.label,
          value: option.value,
        })) ?? [],
    [attributes],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recipesResult, catalogResult] = await Promise.all([
        listCostRecipesAction(),
        listCostRecipeCatalogAction(),
      ]);
      if (recipesResult.ok && recipesResult.recipes) {
        setRecipes(recipesResult.recipes);
      } else {
        toaster.error({
          title: t("fakturownia.costs.costRecipes.loadError", {
            defaultValue: "Failed to load cost recipes",
          }),
          description: recipesResult.error,
          duration: 4000,
        });
      }
      if (catalogResult.ok && catalogResult.attributes) {
        setAttributes(catalogResult.attributes);
      } else {
        toaster.error({
          title: t("fakturownia.costs.costRecipes.catalogError", {
            defaultValue: "Failed to load recipe catalog",
          }),
          description: catalogResult.error,
          duration: 4000,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  }, [load]);

  function openCreate() {
    setFormState({
      name: "",
      targetAttributeId: "",
      targetOptionValue: "",
      components: [blankComponent(), blankComponent()],
    });
    setOpen(true);
  }

  function openEdit(recipe: CostRecipePlain) {
    setFormState({
      id: recipe.id,
      name: recipe.name,
      targetAttributeId: recipe.targetAttributeId,
      targetOptionValue: recipe.targetOptionValue,
      components: recipe.components.map((component) => ({
        attributeId: component.attributeId,
        optionValue: component.optionValue,
        factor: String(component.factor ?? 1),
      })),
    });
    setOpen(true);
  }

  function updateComponent(index: number, patch: Partial<ComponentRow>) {
    setFormState((previous) => ({
      ...previous,
      components: previous.components.map((component, componentIndex) =>
        componentIndex === index ? { ...component, ...patch } : component,
      ),
    }));
  }

  async function handleSave() {
    const name = formState.name.trim();
    if (!name) {
      toaster.error({
        title: t("fakturownia.costs.costRecipes.nameRequired", {
          defaultValue: "Recipe name is required",
        }),
        duration: 3000,
      });
      return;
    }

    const components = formState.components
      .map((component) => ({
        attributeId: component.attributeId.trim(),
        optionValue: component.optionValue.trim(),
        factor: Number.parseFloat(component.factor.replace(",", ".")),
      }))
      .filter((component) => component.attributeId && component.optionValue);

    if (
      components.some(
        (component) =>
          !Number.isFinite(component.factor) || component.factor <= 0,
      )
    ) {
      toaster.error({
        title: t("fakturownia.costs.costRecipes.factorRequired", {
          defaultValue: "Component factors must be positive numbers",
        }),
        duration: 3000,
      });
      return;
    }

    const normalizedComponents = components.map((component) => ({
      attributeId: component.attributeId,
      optionValue: component.optionValue,
      ...(Number.isFinite(component.factor) && component.factor !== 1
        ? { factor: component.factor }
        : {}),
    }));

    setSaving(true);
    try {
      const result = await saveCostRecipeAction({
        ...(formState.id ? { id: formState.id } : {}),
        name,
        targetAttributeId: formState.targetAttributeId,
        targetOptionValue: formState.targetOptionValue,
        components: normalizedComponents,
      });
      if (result.ok) {
        toaster.success({
          title: t("fakturownia.costs.costRecipes.saved", {
            defaultValue: "Cost recipe saved",
          }),
          duration: 3000,
        });
        setOpen(false);
        await load();
      } else {
        toaster.error({
          title: t("fakturownia.costs.costRecipes.saveError", {
            defaultValue: "Failed to save cost recipe",
          }),
          description: result.error,
          duration: 4000,
        });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        t("fakturownia.costs.costRecipes.deleteConfirm", {
          defaultValue: "Delete this cost recipe?",
        }),
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const result = await deleteCostRecipeAction({ id });
      if (result.ok) {
        toaster.success({
          title: t("fakturownia.costs.costRecipes.deleted", {
            defaultValue: "Cost recipe deleted",
          }),
          duration: 3000,
        });
        await load();
      } else {
        toaster.error({
          title: t("fakturownia.costs.costRecipes.deleteError", {
            defaultValue: "Failed to delete cost recipe",
          }),
          description: result.error,
          duration: 4000,
        });
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Box>
        <HStack justify={hideHeading ? "flex-end" : "space-between"} mb={2}>
          {!hideHeading ? (
            <HStack gap={2}>
              <Text fontSize="md" fontWeight="semibold">
                {t("fakturownia.costs.costRecipes.title", {
                  defaultValue: "Cost recipes",
                })}
              </Text>
              {loading ? (
                <Spinner size="xs" />
              ) : (
                <Badge colorPalette="gray">{recipes.length}</Badge>
              )}
            </HStack>
          ) : null}
          <Button
            colorPalette="primary"
            size="sm"
            variant="outline"
            onClick={openCreate}
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("fakturownia.costs.costRecipes.create", {
              defaultValue: "New recipe",
            })}
          </Button>
        </HStack>
        <Text color="fg.muted" fontSize="xs" mb={3}>
          {t("fakturownia.costs.costRecipes.hint", {
            defaultValue:
              "Compose one target option from several approved material costs. Recipes override a direct cost assigned to the same target option in the admin margin panel.",
          })}
        </Text>

        <VStack align="stretch" gap={2}>
          {!loading && recipes.length === 0 ? (
            <Card.Root variant="outline">
              <Card.Body p={3}>
                <Text color="fg.muted" fontSize="sm">
                  {t("fakturownia.costs.costRecipes.empty", {
                    defaultValue: "No cost recipes defined yet.",
                  })}
                </Text>
              </Card.Body>
            </Card.Root>
          ) : (
            recipes.map((recipe) => {
              const isDeleting = deletingId === recipe.id;
              return (
                <Card.Root key={recipe.id} variant="outline">
                  <Card.Body p={3}>
                    <HStack justify="space-between" align="start" gap={3}>
                      <VStack align="stretch" gap={1} flex={1} minW={0}>
                        <Text fontSize="sm" fontWeight="semibold" truncate>
                          {recipe.name}
                        </Text>
                        <Text color="fg.muted" fontSize="xs" truncate>
                          {optionLabel(
                            attributes,
                            recipe.targetAttributeId,
                            recipe.targetOptionValue,
                          )}
                        </Text>
                        <Text color="fg.muted" fontSize="xs">
                          {t("fakturownia.costs.costRecipes.componentCount", {
                            count: recipe.components.length,
                            defaultValue: "{{count}} component(s)",
                          })}
                        </Text>
                      </VStack>
                      <HStack gap={1} flexShrink={0}>
                        <IconButton
                          aria-label={t("fakturownia.costs.costRecipes.edit", {
                            defaultValue: "Edit recipe",
                          })}
                          size="xs"
                          variant="ghost"
                          onClick={() => openEdit(recipe)}
                        >
                          <MaterialSymbol>edit</MaterialSymbol>
                        </IconButton>
                        <IconButton
                          aria-label={t(
                            "fakturownia.costs.costRecipes.delete",
                            {
                              defaultValue: "Delete recipe",
                            },
                          )}
                          colorPalette="red"
                          disabled={isDeleting}
                          loading={isDeleting}
                          size="xs"
                          variant="ghost"
                          onClick={() => void handleDelete(recipe.id)}
                        >
                          <MaterialSymbol>delete</MaterialSymbol>
                        </IconButton>
                      </HStack>
                    </HStack>
                  </Card.Body>
                </Card.Root>
              );
            })
          )}
        </VStack>
      </Box>

      <Drawer
        header={
          formState.id
            ? t("fakturownia.costs.costRecipes.editTitle", {
                defaultValue: "Edit cost recipe",
              })
            : t("fakturownia.costs.costRecipes.createTitle", {
                defaultValue: "New cost recipe",
              })
        }
        size="md"
        open={open}
        setOpen={setOpen}
        lazyMount
        unmountOnExit
      >
        <VStack align="stretch" gap={5} py={2} w="full">
          <Field.Root required>
            <Field.Label htmlFor={nameInputId} fontSize="sm">
              {t("fakturownia.costs.costRecipes.name", {
                defaultValue: "Recipe name",
              })}
            </Field.Label>
            <Input
              id={nameInputId}
              size="sm"
              placeholder={t("fakturownia.costs.costRecipes.namePlaceholder", {
                defaultValue: "e.g. Paper + matte laminate",
              })}
              value={formState.name}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  name: event.target.value,
                }))
              }
            />
          </Field.Root>

          <VStack align="stretch" gap={3}>
            <Text fontSize="sm" fontWeight="semibold">
              {t("fakturownia.costs.costRecipes.target", {
                defaultValue: "Target option",
              })}
            </Text>
            <SelectField
              label={t("fakturownia.costs.attribute", {
                defaultValue: "Attribute",
              })}
              options={attributeOptions}
              placeholder={t("fakturownia.costs.attributePlaceholder", {
                defaultValue: "Any attribute",
              })}
              value={formState.targetAttributeId}
              onChange={(value) =>
                setFormState((previous) => ({
                  ...previous,
                  targetAttributeId: value,
                  targetOptionValue: "",
                }))
              }
            />
            <SelectField
              disabled={!formState.targetAttributeId}
              label={t("fakturownia.costs.option", { defaultValue: "Option" })}
              options={optionOptionsFor(formState.targetAttributeId)}
              placeholder={t("fakturownia.costs.optionPlaceholder", {
                defaultValue: "Any option",
              })}
              value={formState.targetOptionValue}
              onChange={(value) =>
                setFormState((previous) => ({
                  ...previous,
                  targetOptionValue: value,
                }))
              }
            />
          </VStack>

          <Separator />

          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontSize="sm" fontWeight="semibold">
                {t("fakturownia.costs.costRecipes.components", {
                  defaultValue: "Components",
                })}
              </Text>
              <Button
                size="xs"
                variant="outline"
                disabled={formState.components.length >= 10}
                onClick={() =>
                  setFormState((previous) => ({
                    ...previous,
                    components: [...previous.components, blankComponent()],
                  }))
                }
              >
                <MaterialSymbol>add</MaterialSymbol>
                {t("fakturownia.costs.costRecipes.addComponent", {
                  defaultValue: "Add component",
                })}
              </Button>
            </HStack>
            {formState.components.map((component, index) => (
              // eslint-disable-next-line react/no-array-index-key -- Component rows are editable drafts without stable persisted ids.
              <Card.Root key={index} variant="outline">
                <Card.Body p={3}>
                  <VStack align="stretch" gap={2}>
                    <HStack justify="space-between">
                      <Text color="fg.muted" fontSize="xs">
                        {t("fakturownia.costs.costRecipes.component", {
                          index: index + 1,
                          defaultValue: "Component {{index}}",
                        })}
                      </Text>
                      <IconButton
                        aria-label={t(
                          "fakturownia.costs.costRecipes.removeComponent",
                          { defaultValue: "Remove component" },
                        )}
                        colorPalette="red"
                        disabled={formState.components.length <= 1}
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          setFormState((previous) => ({
                            ...previous,
                            components: previous.components.filter(
                              (_candidate, candidateIndex) =>
                                candidateIndex !== index,
                            ),
                          }))
                        }
                      >
                        <MaterialSymbol>remove_circle_outline</MaterialSymbol>
                      </IconButton>
                    </HStack>
                    <SelectField
                      options={attributeOptions}
                      placeholder={t("fakturownia.costs.attributePlaceholder", {
                        defaultValue: "Any attribute",
                      })}
                      value={component.attributeId}
                      onChange={(value) =>
                        updateComponent(index, {
                          attributeId: value,
                          optionValue: "",
                        })
                      }
                    />
                    <SelectField
                      disabled={!component.attributeId}
                      options={optionOptionsFor(component.attributeId)}
                      placeholder={t("fakturownia.costs.optionPlaceholder", {
                        defaultValue: "Any option",
                      })}
                      value={component.optionValue}
                      onChange={(value) =>
                        updateComponent(index, { optionValue: value })
                      }
                    />
                    <Field.Root>
                      <Field.Label fontSize="xs">
                        {t("fakturownia.costs.costRecipes.factor", {
                          defaultValue: "Factor",
                        })}
                      </Field.Label>
                      <Input
                        min="0.0001"
                        size="sm"
                        type="number"
                        value={component.factor}
                        onChange={(event) =>
                          updateComponent(index, {
                            factor: event.target.value,
                          })
                        }
                      />
                    </Field.Root>
                  </VStack>
                </Card.Body>
              </Card.Root>
            ))}
          </VStack>

          <HStack justify="end" gap={2}>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              {t("fakturownia.costs.costRecipes.cancel", {
                defaultValue: "Cancel",
              })}
            </Button>
            <Button
              colorPalette="primary"
              size="sm"
              disabled={saving}
              loading={saving}
              onClick={() => void handleSave()}
            >
              <MaterialSymbol>save</MaterialSymbol>
              {t("fakturownia.costs.costRecipes.save", {
                defaultValue: "Save",
              })}
            </Button>
          </HStack>
        </VStack>
      </Drawer>
    </>
  );
}
