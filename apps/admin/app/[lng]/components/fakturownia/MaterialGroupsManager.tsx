"use client";

import {
  deleteMaterialGroupAction,
  listMaterialGroupsAction,
  saveMaterialGroupAction,
  suggestMaterialGroupsAction,
  type AttributeCatalogItem,
  type MaterialGroupPlain,
} from "@/actions/fakturownia-costs";
import type { MaterialGroupSuggestion } from "@/lib/fakturownia/material-groups";
import { useT } from "@/i18n/client";
import {
  Badge,
  Box,
  Button,
  Card,
  Combobox,
  Field,
  HStack,
  IconButton,
  Input,
  Portal,
  Separator,
  Spinner,
  Text,
  useFilter,
  useListCollection,
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AttributeOption {
  id: string;
  name: string;
}

interface AliasRow {
  key: string; // variant value
  value: string; // canonical value
}

interface GroupFormState {
  id?: string;
  name: string;
  selectedAttributeIds: string[];
  aliasRows: AliasRow[];
}

// ---------------------------------------------------------------------------
// Small helper: multi-checkbox attribute picker with search + rich metadata
// ---------------------------------------------------------------------------

function AttributeCheckboxList({
  attributes,
  selectedIds,
  onChange,
  groups,
}: {
  attributes: AttributeCatalogItem[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  groups: MaterialGroupPlain[];
}) {
  const { t } = useT(["fakturownia"]);
  const [search, setSearch] = useState("");

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  // Build map: attributeId -> group name (for "in group" annotation)
  const attrGroupName = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of groups) {
      for (const attrId of group.attributeIds) {
        map.set(attrId, group.name);
      }
    }
    return map;
  }, [groups]);

  // Summary: count option values shared across ≥2 currently-selected attributes
  const sharedValueCount = useMemo(() => {
    const selectedAttrs = attributes.filter((a) => selectedIds.includes(a.id));
    if (selectedAttrs.length < 2) return 0;
    const valueCounts = new Map<string, number>();
    for (const attr of selectedAttrs) {
      const seen = new Set<string>();
      for (const opt of attr.options) {
        if (!seen.has(opt.value)) {
          seen.add(opt.value);
          valueCounts.set(opt.value, (valueCounts.get(opt.value) ?? 0) + 1);
        }
      }
    }
    let shared = 0;
    for (const count of valueCounts.values()) {
      if (count >= 2) shared++;
    }
    return shared;
  }, [attributes, selectedIds]);

  const lowerSearch = search.toLowerCase();

  // Sort selected attributes to the top, then alphabetical within each group
  const visible = useMemo(() => {
    const filtered = attributes.filter(
      (a) => !search || a.name.toLowerCase().includes(lowerSearch),
    );
    return filtered.slice().sort((a, b) => {
      const aSelected = selectedIds.includes(a.id) ? 0 : 1;
      const bSelected = selectedIds.includes(b.id) ? 0 : 1;
      return aSelected - bSelected || a.name.localeCompare(b.name);
    });
  }, [attributes, search, lowerSearch, selectedIds]);

  if (attributes.length === 0) {
    return (
      <Text color="fg.muted" fontSize="xs">
        —
      </Text>
    );
  }

  return (
    <VStack align="stretch" gap={2} w="full">
      <Input
        size="xs"
        placeholder={t("fakturownia.costs.materialGroups.searchPlaceholder", {
          defaultValue: "Search attributes…",
        })}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {selectedIds.length > 0 ? (
        <Text color="fg.muted" fontSize="xs">
          {t("fakturownia.costs.materialGroups.selectedSummary", {
            n: selectedIds.length,
            m: sharedValueCount,
            defaultValue: "{{n}} selected · share {{m}} option values",
          })}
        </Text>
      ) : null}
      <VStack align="stretch" gap={1} maxH="52" overflowY="auto" w="full">
        {visible.map((attr) => {
          const checked = selectedIds.includes(attr.id);
          const inGroupName = attrGroupName.get(attr.id);
          return (
            <HStack
              key={attr.id}
              gap={2}
              cursor="pointer"
              onClick={() => toggle(attr.id)}
              _hover={{ bg: "bg.subtle" }}
              borderRadius="md"
              px={2}
              py={1}
              w="full"
            >
              <Box
                w={4}
                h={4}
                borderRadius="sm"
                borderWidth="1px"
                borderColor={checked ? "primary.500" : "border.emphasized"}
                bg={checked ? "primary.500" : "transparent"}
                flexShrink={0}
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                {checked ? (
                  <MaterialSymbol style={{ fontSize: 12, color: "white" }}>
                    check
                  </MaterialSymbol>
                ) : null}
              </Box>
              <Text fontSize="sm" truncate flex={1}>
                {attr.name}
              </Text>
              {attr.materialLike ? (
                <Badge colorPalette="teal" size="xs" flexShrink={0}>
                  {t("fakturownia.costs.materialGroups.materialBadge", {
                    defaultValue: "material",
                  })}
                </Badge>
              ) : null}
              <Text color="fg.muted" fontSize="xs" flexShrink={0}>
                {t("fakturownia.costs.materialGroups.optionCount", {
                  count: attr.optionCount,
                  defaultValue: "{{count}} options",
                })}
              </Text>
              {inGroupName ? (
                <Text
                  color="fg.subtle"
                  fontSize="xs"
                  flexShrink={0}
                  fontStyle="italic"
                >
                  {t("fakturownia.costs.materialGroups.inGroup", {
                    name: inGroupName,
                    defaultValue: "in group: {{name}}",
                  })}
                </Text>
              ) : null}
            </HStack>
          );
        })}
        {visible.length === 0 ? (
          <Text color="fg.muted" fontSize="xs" px={2}>
            —
          </Text>
        ) : null}
      </VStack>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Suggested group card
// ---------------------------------------------------------------------------

function SuggestionCard({
  suggestion,
  onUse,
}: {
  suggestion: MaterialGroupSuggestion;
  onUse: (s: MaterialGroupSuggestion) => void;
}) {
  const { t } = useT(["fakturownia"]);
  return (
    <Card.Root variant="outline" borderColor="border.emphasized">
      <Card.Body p={3}>
        <HStack justify="space-between" align="start" gap={3}>
          <VStack align="stretch" gap={1} flex={1} minW={0}>
            <HStack gap={2} flexWrap="wrap">
              <Text fontSize="sm" fontWeight="semibold" truncate>
                {suggestion.suggestedName}
              </Text>
              {suggestion.materialLike ? (
                <Badge colorPalette="teal" size="xs">
                  {t("fakturownia.costs.materialGroups.materialBadge", {
                    defaultValue: "material",
                  })}
                </Badge>
              ) : null}
            </HStack>
            <Text color="fg.muted" fontSize="xs">
              {suggestion.attributeNames.join(", ")}
            </Text>
            {suggestion.sharedValueCount > 0 ? (
              <Text color="fg.muted" fontSize="xs">
                {t("fakturownia.costs.materialGroups.sharesValues", {
                  count: suggestion.sharedValueCount,
                  defaultValue: "shares {{count}} option values",
                })}
                {suggestion.sampleSharedValues.length > 0 ? (
                  <>
                    {": "}
                    <Text as="span" color="fg.subtle" fontStyle="italic">
                      {suggestion.sampleSharedValues.join(", ")}
                    </Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </VStack>
          <Button
            size="xs"
            variant="outline"
            colorPalette="primary"
            flexShrink={0}
            onClick={() => onUse(suggestion)}
          >
            <MaterialSymbol>add_circle</MaterialSymbol>
            {t("fakturownia.costs.materialGroups.useThisSuggestion", {
              defaultValue: "Create group",
            })}
          </Button>
        </HStack>
      </Card.Body>
    </Card.Root>
  );
}

// ---------------------------------------------------------------------------
// Single-value combobox — mirrors the pattern from fakturownia-costs-page.tsx
// ---------------------------------------------------------------------------

interface AliasSelectOption {
  label: string;
  value: string;
}

function AliasCombobox({
  disabled,
  onChange,
  options,
  placeholder,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: AliasSelectOption[];
  placeholder: string;
  value: string;
}) {
  // Unique per-instance ids so the two comboboxes in an alias row never share
  // an internal input id — otherwise Ark's focus-by-id routes keystrokes from
  // the right field into the left one.
  const comboboxId = useId();
  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );
  const [inputValue, setInputValue] = useState(selectedOption?.label ?? "");
  const { contains } = useFilter({ sensitivity: "base" });
  const stableOptions = useMemo(() => options.slice(), [options]);
  const { collection, filter, set } = useListCollection<AliasSelectOption>({
    filter: contains,
    initialItems: stableOptions,
    itemToString: (item) => item.label,
    itemToValue: (item) => item.value,
  });

  useEffect(() => {
    set(stableOptions);
    filter("");
  }, [filter, set, stableOptions]);

  useEffect(() => {
    setInputValue(selectedOption?.label ?? "");
  }, [selectedOption?.label]);

  return (
    <Combobox.Root
      closeOnSelect
      collection={collection}
      colorPalette="primary"
      disabled={disabled}
      ids={{
        root: `${comboboxId}-root`,
        label: `${comboboxId}-label`,
        control: `${comboboxId}-control`,
        input: `${comboboxId}-input`,
        content: `${comboboxId}-content`,
        trigger: `${comboboxId}-trigger`,
        clearTrigger: `${comboboxId}-clear`,
        positioner: `${comboboxId}-positioner`,
      }}
      inputValue={inputValue}
      onInputValueChange={({ inputValue: next }) => {
        setInputValue(next);
        filter(next);
      }}
      onValueChange={({ value: nextValue }) => {
        const next = nextValue[0] ?? "";
        onChange(next);
        const nextOption = stableOptions.find((o) => o.value === next);
        setInputValue(nextOption?.label ?? "");
        filter("");
      }}
      openOnClick
      selectionBehavior="replace"
      size="sm"
      value={value ? [value] : []}
      width="100%"
    >
      <Combobox.Control>
        <Combobox.Input placeholder={placeholder} />
        <Combobox.IndicatorGroup>
          <Combobox.ClearTrigger />
          <Combobox.Trigger />
        </Combobox.IndicatorGroup>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner>
          <Combobox.Content maxH="52" overflowY="auto">
            <Combobox.Empty>—</Combobox.Empty>
            {collection.items.map((item) => (
              <Combobox.Item key={item.value} item={item}>
                <Combobox.ItemText width="100%">
                  <Text fontSize="sm" truncate>
                    {item.label}
                    {item.label !== item.value ? (
                      <Text as="span" color="fg.muted" fontSize="xs" ml={1}>
                        ({item.value})
                      </Text>
                    ) : null}
                  </Text>
                </Combobox.ItemText>
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  );
}

// ---------------------------------------------------------------------------
// Alias row editor — dropdowns populated from the selected attributes' options
// ---------------------------------------------------------------------------

function AliasRowEditor({
  rows,
  onChange,
  availableOptions,
  disabled,
  addLabel,
  removeLabel,
  variantPlaceholder,
  canonicalPlaceholder,
  disabledHint,
}: {
  rows: AliasRow[];
  onChange: (rows: AliasRow[]) => void;
  availableOptions: AliasSelectOption[];
  disabled: boolean;
  addLabel: string;
  removeLabel: string;
  variantPlaceholder: string;
  canonicalPlaceholder: string;
  disabledHint: string;
}) {
  const addRow = () => onChange([...rows, { key: "", value: "" }]);
  const removeRow = (index: number) =>
    onChange(rows.filter((_, i) => i !== index));
  const updateRow = (index: number, field: "key" | "value", val: string) =>
    onChange(
      rows.map((row, i) => (i === index ? { ...row, [field]: val } : row)),
    );

  if (disabled) {
    return (
      <Text color="fg.muted" fontSize="xs" fontStyle="italic">
        {disabledHint}
      </Text>
    );
  }

  return (
    <VStack align="stretch" gap={2} w="full">
      {rows.map((row, index) => (
        // eslint-disable-next-line react/no-array-index-key -- Alias rows are editable draft pairs without stable persisted ids.
        <HStack key={index} gap={2} align="center" w="full">
          <Box flex={1} minW={0}>
            <AliasCombobox
              options={availableOptions}
              value={row.key}
              onChange={(val) => updateRow(index, "key", val)}
              placeholder={variantPlaceholder}
            />
          </Box>
          <MaterialSymbol style={{ fontSize: 16, flexShrink: 0 }}>
            arrow_forward
          </MaterialSymbol>
          <Box flex={1} minW={0}>
            <AliasCombobox
              options={availableOptions}
              value={row.value}
              onChange={(val) => updateRow(index, "value", val)}
              placeholder={canonicalPlaceholder}
            />
          </Box>
          <IconButton
            aria-label={removeLabel}
            colorPalette="red"
            size="xs"
            variant="ghost"
            onClick={() => removeRow(index)}
          >
            <MaterialSymbol>remove_circle_outline</MaterialSymbol>
          </IconButton>
        </HStack>
      ))}
      <Button size="xs" variant="outline" onClick={addRow} alignSelf="start">
        <MaterialSymbol>add</MaterialSymbol>
        {addLabel}
      </Button>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MaterialGroupsManager({
  attributes: attributesProp,
  hideHeading = false,
}: {
  attributes: AttributeOption[];
  /** When true, suppresses the internal "Material cost groups" heading row so a
   * parent CollapsibleSection can provide it without duplication. */
  hideHeading?: boolean;
}) {
  const { t } = useT(["fakturownia", "translation"]);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<MaterialGroupPlain[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Rich attribute catalog (from suggestMaterialGroupsAction); falls back to prop
  const [richAttributes, setRichAttributes] = useState<
    AttributeCatalogItem[] | null
  >(null);
  const [suggestions, setSuggestions] = useState<MaterialGroupSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);

  const [formState, setFormState] = useState<GroupFormState>({
    name: "",
    selectedAttributeIds: [],
    aliasRows: [],
  });
  const nameInputId = useId();
  const loadedRef = useRef(false);

  // Derived: the attribute list the picker uses (rich if available, prop fallback)
  const pickerAttributes: AttributeCatalogItem[] =
    richAttributes ??
    attributesProp.map((a) => ({
      id: a.id,
      name: a.name,
      optionCount: 0,
      materialLike: false,
      options: [],
    }));

  const load = useCallback(async () => {
    setLoading(true);
    setSuggestionsLoading(true);
    try {
      // Fire both actions in parallel
      const [groupsResult, suggestResult] = await Promise.all([
        listMaterialGroupsAction(),
        suggestMaterialGroupsAction(),
      ]);

      if (groupsResult.ok && groupsResult.groups) {
        setGroups(groupsResult.groups);
      } else {
        toaster.error({
          title: t("fakturownia.costs.materialGroups.loadError", {
            defaultValue: "Failed to load material groups",
          }),
          description: groupsResult.error,
          duration: 4000,
        });
      }

      if (suggestResult.ok) {
        if (suggestResult.attributes) {
          setRichAttributes(suggestResult.attributes);
        }
        setSuggestions(suggestResult.suggestions ?? []);
      }
      // If suggestions fail, silently ignore — not critical
    } finally {
      setLoading(false);
      setSuggestionsLoading(false);
    }
  }, [t]);

  // Load once on mount
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void load();
    }
  }, [load]);

  function openCreate() {
    setFormState({ name: "", selectedAttributeIds: [], aliasRows: [] });
    setOpen(true);
  }

  function openEdit(group: MaterialGroupPlain) {
    const aliasRows: AliasRow[] = group.valueAliases
      ? Object.entries(group.valueAliases).map(([k, v]) => ({
          key: k,
          value: v,
        }))
      : [];
    setFormState({
      id: group.id,
      name: group.name,
      selectedAttributeIds: group.attributeIds,
      aliasRows,
    });
    setOpen(true);
  }

  function openFromSuggestion(suggestion: MaterialGroupSuggestion) {
    setFormState({
      name: suggestion.suggestedName,
      selectedAttributeIds: suggestion.attributeIds,
      aliasRows: [],
    });
    setOpen(true);
  }

  async function handleSave() {
    const name = formState.name.trim();
    if (!name) {
      toaster.error({
        title: t("fakturownia.costs.materialGroups.nameRequired", {
          defaultValue: "Group name is required",
        }),
        duration: 3000,
      });
      return;
    }
    if (formState.selectedAttributeIds.length < 1) {
      toaster.error({
        title: t("fakturownia.costs.materialGroups.attributesRequired", {
          defaultValue: "Select at least one attribute",
        }),
        duration: 3000,
      });
      return;
    }

    const valueAliases: Record<string, string> = {};
    for (const row of formState.aliasRows) {
      const k = row.key.trim();
      const v = row.value.trim();
      if (k && v) {
        valueAliases[k] = v;
      }
    }

    setSaving(true);
    try {
      const result = await saveMaterialGroupAction({
        ...(formState.id ? { id: formState.id } : {}),
        name,
        attributeIds: formState.selectedAttributeIds,
        // Always send valueAliases (even {}) so clearing/removing aliases on an
        // edit is persisted — the lib replaces/deletes the field accordingly.
        valueAliases,
      });
      if (result.ok) {
        toaster.success({
          title: t("fakturownia.costs.materialGroups.saved", {
            defaultValue: "Material group saved",
          }),
          duration: 3000,
        });
        setOpen(false);
        await load();
      } else {
        toaster.error({
          title: t("fakturownia.costs.materialGroups.saveError", {
            defaultValue: "Failed to save material group",
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
        t("fakturownia.costs.materialGroups.deleteConfirm", {
          defaultValue: "Delete this material group? This cannot be undone.",
        }),
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const result = await deleteMaterialGroupAction({ id });
      if (result.ok) {
        toaster.success({
          title: t("fakturownia.costs.materialGroups.deleted", {
            defaultValue: "Material group deleted",
          }),
          duration: 3000,
        });
        await load();
      } else {
        toaster.error({
          title: t("fakturownia.costs.materialGroups.deleteError", {
            defaultValue: "Failed to delete material group",
          }),
          description: result.error,
          duration: 4000,
        });
      }
    } finally {
      setDeletingId(null);
    }
  }

  // Build a map from id -> name for display in group cards
  const attrNameMap = new Map(pickerAttributes.map((a) => [a.id, a.name]));

  // Deduped union of option values across the currently-selected attributes —
  // used to populate the alias dropdown selects.
  const availableAliasOptions = useMemo<AliasSelectOption[]>(() => {
    const seen = new Map<string, string>(); // value -> label
    for (const attr of pickerAttributes) {
      if (!formState.selectedAttributeIds.includes(attr.id)) continue;
      for (const opt of attr.options) {
        if (!seen.has(opt.value)) {
          seen.set(opt.value, opt.label);
        }
      }
    }
    return Array.from(seen.entries()).map(([value, label]) => ({
      value,
      label,
    }));
  }, [pickerAttributes, formState.selectedAttributeIds]);

  return (
    <>
      <Box>
        {!hideHeading ? (
          <HStack justify="space-between" mb={2}>
            <HStack gap={2}>
              <Text fontSize="md" fontWeight="semibold">
                {t("fakturownia.costs.materialGroups.title", {
                  defaultValue: "Material cost groups",
                })}
              </Text>
              {loading ? (
                <Spinner size="xs" />
              ) : (
                <Badge colorPalette="gray">{groups.length}</Badge>
              )}
            </HStack>
            <Button
              colorPalette="primary"
              size="sm"
              variant="outline"
              onClick={openCreate}
            >
              <MaterialSymbol>add</MaterialSymbol>
              {t("fakturownia.costs.materialGroups.create", {
                defaultValue: "New group",
              })}
            </Button>
          </HStack>
        ) : (
          <HStack justify="flex-end" mb={2}>
            <Button
              colorPalette="primary"
              size="sm"
              variant="outline"
              onClick={openCreate}
            >
              <MaterialSymbol>add</MaterialSymbol>
              {t("fakturownia.costs.materialGroups.create", {
                defaultValue: "New group",
              })}
            </Button>
          </HStack>
        )}

        <Text color="fg.muted" fontSize="xs" mb={3}>
          {t("fakturownia.costs.materialGroups.hint", {
            defaultValue:
              "Group attributes that represent the same material so their option costs are shared across products.",
          })}
        </Text>

        {/* ---- Suggested groups section ---- */}
        <Box mb={4}>
          <HStack gap={2} mb={2}>
            <Text fontSize="sm" fontWeight="semibold">
              {t("fakturownia.costs.materialGroups.suggestionsTitle", {
                defaultValue: "Suggested groups",
              })}
            </Text>
            {suggestionsLoading ? <Spinner size="xs" /> : null}
          </HStack>

          {!suggestionsLoading && suggestions.length === 0 ? (
            <Text color="fg.muted" fontSize="xs">
              {t("fakturownia.costs.materialGroups.suggestionsEmpty", {
                defaultValue: "No grouping candidates detected.",
              })}
            </Text>
          ) : (
            <VStack align="stretch" gap={2}>
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.attributeIds.join(",")}
                  suggestion={s}
                  onUse={openFromSuggestion}
                />
              ))}
            </VStack>
          )}
        </Box>

        <Separator mb={4} />

        {/* ---- Existing groups list ---- */}
        <VStack align="stretch" gap={2}>
          {!loading && groups.length === 0 ? (
            <Card.Root variant="outline">
              <Card.Body p={3}>
                <Text color="fg.muted" fontSize="sm">
                  {t("fakturownia.costs.materialGroups.empty", {
                    defaultValue: "No material groups defined yet.",
                  })}
                </Text>
              </Card.Body>
            </Card.Root>
          ) : (
            groups.map((group) => {
              const attrNames = group.attributeIds
                .map((id) => attrNameMap.get(id) ?? id)
                .join(", ");
              const aliasCount = group.valueAliases
                ? Object.keys(group.valueAliases).length
                : 0;
              const isDeleting = deletingId === group.id;

              return (
                <Card.Root key={group.id} variant="outline">
                  <Card.Body p={3}>
                    <HStack justify="space-between" align="start" gap={3}>
                      <VStack align="stretch" gap={1} flex={1} minW={0}>
                        <Text fontSize="sm" fontWeight="semibold" truncate>
                          {group.name}
                        </Text>
                        <Text
                          color="fg.muted"
                          fontSize="xs"
                          truncate
                          title={attrNames}
                        >
                          {t("fakturownia.costs.materialGroups.attributes", {
                            defaultValue: "Attributes",
                          })}
                          {": "}
                          {attrNames || "—"}
                        </Text>
                        {aliasCount > 0 ? (
                          <Text color="fg.muted" fontSize="xs">
                            {t("fakturownia.costs.materialGroups.aliasCount", {
                              count: aliasCount,
                              defaultValue: "{{count}} value alias(es)",
                            })}
                          </Text>
                        ) : null}
                      </VStack>
                      <HStack gap={1} flexShrink={0}>
                        <IconButton
                          aria-label={t(
                            "fakturownia.costs.materialGroups.edit",
                            { defaultValue: "Edit group" },
                          )}
                          size="xs"
                          variant="ghost"
                          onClick={() => openEdit(group)}
                        >
                          <MaterialSymbol>edit</MaterialSymbol>
                        </IconButton>
                        <IconButton
                          aria-label={t(
                            "fakturownia.costs.materialGroups.delete",
                            { defaultValue: "Delete group" },
                          )}
                          colorPalette="red"
                          size="xs"
                          variant="ghost"
                          disabled={isDeleting}
                          loading={isDeleting}
                          onClick={() => void handleDelete(group.id)}
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
            ? t("fakturownia.costs.materialGroups.editTitle", {
                defaultValue: "Edit material group",
              })
            : t("fakturownia.costs.materialGroups.createTitle", {
                defaultValue: "New material group",
              })
        }
        size="md"
        open={open}
        setOpen={setOpen}
        lazyMount
        unmountOnExit
      >
        <VStack align="stretch" gap={5} py={2} w="full">
          {/* Form intro */}
          <Box
            bg="bg.subtle"
            borderRadius="md"
            px={3}
            py={2}
            borderWidth="1px"
            borderColor="border.subtle"
          >
            <Text color="fg.muted" fontSize="xs">
              {t("fakturownia.costs.materialGroups.formIntro", {
                defaultValue:
                  'Group attributes that represent the same physical material — for example all variants of "Paper" across different product families. A cost approved for one option value (e.g. kreda300) is then automatically shared with every product that carries that value under any attribute in the group. Use value aliases to unify differently-coded names of the same material.',
              })}
            </Text>
          </Box>

          {/* Name */}
          <Field.Root required>
            <Field.Label htmlFor={nameInputId} fontSize="sm">
              {t("fakturownia.costs.materialGroups.name", {
                defaultValue: "Group name",
              })}
            </Field.Label>
            <Input
              id={nameInputId}
              size="sm"
              placeholder={t(
                "fakturownia.costs.materialGroups.namePlaceholder",
                { defaultValue: "e.g. Paper material" },
              )}
              value={formState.name}
              onChange={(e) =>
                setFormState((prev) => ({ ...prev, name: e.target.value }))
              }
            />
          </Field.Root>

          {/* Attributes multi-select */}
          <Field.Root required>
            <Field.Label fontSize="sm">
              {t("fakturownia.costs.materialGroups.attributes", {
                defaultValue: "Attributes",
              })}
            </Field.Label>
            <Text color="fg.muted" fontSize="xs" mb={1}>
              {t("fakturownia.costs.materialGroups.attributesHelp", {
                defaultValue:
                  "Pick every attribute whose options describe the same material. The picker shows how many option values each attribute exposes and whether two or more of your selected attributes share values — that overlap is the signal that the grouping is correct.",
              })}
            </Text>
            <Box w="full">
              <AttributeCheckboxList
                attributes={pickerAttributes}
                selectedIds={formState.selectedAttributeIds}
                onChange={(ids) =>
                  setFormState((prev) => ({
                    ...prev,
                    selectedAttributeIds: ids,
                  }))
                }
                groups={groups}
              />
            </Box>
          </Field.Root>

          <Separator />

          {/* Value aliases */}
          <Field.Root>
            <Field.Label fontSize="sm">
              {t("fakturownia.costs.materialGroups.aliases", {
                defaultValue: "Value aliases (optional)",
              })}
            </Field.Label>
            <Text color="fg.muted" fontSize="xs" mb={1}>
              {t("fakturownia.costs.materialGroups.aliasesHelp", {
                defaultValue:
                  "Aliases let you map a variant code (e.g. sirioAutumn300) to the canonical code (e.g. sirioAurum300) so both resolve to the same approved cost. Only values from the selected attributes are available. Incomplete rows are ignored on save.",
              })}
            </Text>
            <AliasRowEditor
              rows={formState.aliasRows}
              onChange={(rows) =>
                setFormState((prev) => ({ ...prev, aliasRows: rows }))
              }
              availableOptions={availableAliasOptions}
              disabled={formState.selectedAttributeIds.length === 0}
              variantPlaceholder={t(
                "fakturownia.costs.materialGroups.aliasVariantPlaceholder",
                { defaultValue: "Variant value…" },
              )}
              canonicalPlaceholder={t(
                "fakturownia.costs.materialGroups.aliasCanonicalPlaceholder",
                { defaultValue: "Canonical value…" },
              )}
              addLabel={t("fakturownia.costs.materialGroups.aliasAdd", {
                defaultValue: "Add alias",
              })}
              removeLabel={t("fakturownia.costs.materialGroups.aliasRemove", {
                defaultValue: "Remove alias",
              })}
              disabledHint={t(
                "fakturownia.costs.materialGroups.aliasSelectAttributesFirst",
                {
                  defaultValue:
                    "Select attributes first to enable alias mapping",
                },
              )}
            />
          </Field.Root>

          <HStack justify="end" gap={2}>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={saving}
            >
              {t("fakturownia.costs.materialGroups.cancel", {
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
              {t("fakturownia.costs.materialGroups.save", {
                defaultValue: "Save",
              })}
            </Button>
          </HStack>
        </VStack>
      </Drawer>
    </>
  );
}
