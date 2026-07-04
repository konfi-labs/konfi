"use client";

import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Input,
  Menu,
  Portal,
  Stack,
  Table,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Field, MaterialSymbol, Switch } from "@konfi/components";
import { copyTextToClipboard } from "@konfi/utils";
import { useT } from "@/i18n/client";
import { Fragment, useState, type ReactNode } from "react";
import {
  ColorPaletteSelect,
  IconSelect,
  DEFAULT_TAXONOMY_ICON_OPTIONS,
} from "./TaxonomySelects";
import {
  type TaxonomyDefinition,
  moveTaxonomy,
  renumberTaxonomy,
} from "./taxonomy-utils";

export interface TaxonomyColumn<T extends TaxonomyDefinition> {
  key: string;
  header: ReactNode;
  width?: string;
  render: (definition: T, update: (patch: Partial<T>) => void) => ReactNode;
}

export interface TaxonomyToggle<T extends TaxonomyDefinition> {
  key: keyof T & string;
  label: ReactNode;
}

export interface TaxonomyEditorProps<T extends TaxonomyDefinition> {
  definitions: T[];
  onChange: (definitions: T[]) => void;
  createDefinition: (params: {
    id: string;
    name: string;
    icon: string;
    colorPalette: string;
    order: number;
  }) => T;
  createId: (name: string, existingIds: readonly string[]) => string;
  fallbackIcon?: string;
  fallbackColorPalette?: string;
  iconOptions?: readonly string[];
  /** Extra columns rendered after the Name cell, before Enabled. */
  extraColumns?: readonly TaxonomyColumn<T>[];
  /** Boolean toggles rendered below each row (semantic flags). */
  toggles?: readonly TaxonomyToggle<T>[];
  addNamePlaceholder?: string;
  emptyMessage?: ReactNode;
  /** Optional element rendered next to the header (e.g. CopyFromChannelMenu). */
  headerActions?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
}

export function TaxonomyEditor<T extends TaxonomyDefinition>({
  definitions,
  onChange,
  createDefinition,
  createId,
  fallbackIcon = "category",
  fallbackColorPalette = "gray",
  iconOptions = DEFAULT_TAXONOMY_ICON_OPTIONS,
  extraColumns = [],
  toggles = [],
  addNamePlaceholder,
  emptyMessage,
  headerActions,
  title,
  description,
}: TaxonomyEditorProps<T>) {
  const { t } = useT();
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState(fallbackIcon);
  const [newColor, setNewColor] = useState(fallbackColorPalette);

  const update = (id: string, patch: Partial<T>) => {
    onChange(definitions.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    const next = createDefinition({
      id: createId(
        trimmed,
        definitions.map((d) => d.id),
      ),
      name: trimmed,
      icon: newIcon.trim() || fallbackIcon,
      colorPalette: newColor.trim() || fallbackColorPalette,
      order: definitions.length,
    });
    onChange(renumberTaxonomy([...definitions, next]));
    setNewName("");
    setNewIcon(fallbackIcon);
    setNewColor(fallbackColorPalette);
  };

  const duplicate = (definition: T) => {
    const trimmed = `${definition.name} (copy)`;
    const next = {
      ...definition,
      id: createId(
        trimmed,
        definitions.map((d) => d.id),
      ),
      name: trimmed,
      isDefault: false,
      order: definitions.length,
    };
    onChange(renumberTaxonomy([...definitions, next]));
  };

  const totalCols = 2 + extraColumns.length + 2; // preview+name + extras + enabled+actions

  return (
    <Stack gap={3} align="stretch">
      {(title || description || headerActions) && (
        <HStack justify="space-between" align="start" wrap="wrap" gap={2}>
          <Stack gap={0}>
            {title ? (
              <Text fontWeight="semibold" fontSize="md">
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text color="fg.muted" fontSize="sm">
                {description}
              </Text>
            ) : null}
          </Stack>
          {headerActions}
        </HStack>
      )}

      {/* Add row */}
      <Box bg="bg.subtle" borderRadius="3xl" borderWidth="1px" p={3}>
        <HStack gap={2} align="end" wrap={{ base: "wrap", lg: "nowrap" }}>
          <Field
            label={t("taxonomyEditor.add.name", { defaultValue: "Name" })}
            flex="1"
            minW="180px"
          >
            <Input
              autoComplete="off"
              size="sm"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={addNamePlaceholder}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
          </Field>
          <Field
            label={t("taxonomyEditor.add.icon", { defaultValue: "Icon" })}
            w={{ base: "100%", lg: "180px" }}
          >
            <IconSelect
              fallback={fallbackIcon}
              icons={iconOptions}
              value={newIcon}
              onChange={setNewIcon}
            />
          </Field>
          <Field
            label={t("taxonomyEditor.add.color", { defaultValue: "Color" })}
            w={{ base: "100%", lg: "140px" }}
          >
            <ColorPaletteSelect
              fallback={fallbackColorPalette}
              value={newColor}
              onChange={setNewColor}
            />
          </Field>
          <Button
            size="sm"
            colorPalette="primary"
            variant={newName.trim() ? "solid" : "outline"}
            disabled={!newName.trim()}
            onClick={handleAdd}
          >
            <MaterialSymbol>add</MaterialSymbol>
            {t("taxonomyEditor.add.button", { defaultValue: "Add" })}
          </Button>
        </HStack>
      </Box>

      {definitions.length === 0 ? (
        <Box
          borderRadius="3xl"
          borderWidth="1px"
          borderStyle="dashed"
          color="fg.muted"
          fontSize="sm"
          p={6}
          textAlign="center"
        >
          {emptyMessage ??
            t("taxonomyEditor.empty", {
              defaultValue: "No items yet. Add the first one above.",
            })}
        </Box>
      ) : (
        <Table.Root size="sm" variant="line" interactive={false}>
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader w="44px" />
              <Table.ColumnHeader>
                {t("taxonomyEditor.columns.preview", {
                  defaultValue: "Item",
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader>
                {t("taxonomyEditor.columns.name", { defaultValue: "Name" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader w="160px">
                {t("taxonomyEditor.add.icon", { defaultValue: "Icon" })}
              </Table.ColumnHeader>
              <Table.ColumnHeader w="140px">
                {t("taxonomyEditor.add.color", { defaultValue: "Color" })}
              </Table.ColumnHeader>
              {extraColumns.map((col) => (
                <Table.ColumnHeader
                  key={col.key}
                  w={col.width}
                  whiteSpace="nowrap"
                >
                  {col.header}
                </Table.ColumnHeader>
              ))}
              <Table.ColumnHeader w="120px" textAlign="center">
                {t("taxonomyEditor.columns.enabled", {
                  defaultValue: "Enabled",
                })}
              </Table.ColumnHeader>
              <Table.ColumnHeader w="56px" textAlign="end" />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {definitions.map((d, index) => {
              const isFirst = index === 0;
              const isLast = index === definitions.length - 1;
              const archived = d.archived === true;
              return (
                <Fragment key={d.id}>
                  <Table.Row
                    opacity={archived ? 0.6 : 1}
                    bg={archived ? "bg.subtle" : undefined}
                  >
                    <Table.Cell verticalAlign="middle">
                      <VStack gap={0}>
                        <IconButton
                          aria-label={t("taxonomyEditor.actions.moveUp", {
                            defaultValue: "Move up",
                          })}
                          disabled={isFirst}
                          size="2xs"
                          variant="ghost"
                          onClick={() =>
                            onChange(moveTaxonomy(definitions, d.id, -1))
                          }
                        >
                          <MaterialSymbol>keyboard_arrow_up</MaterialSymbol>
                        </IconButton>
                        <IconButton
                          aria-label={t("taxonomyEditor.actions.moveDown", {
                            defaultValue: "Move down",
                          })}
                          disabled={isLast}
                          size="2xs"
                          variant="ghost"
                          onClick={() =>
                            onChange(moveTaxonomy(definitions, d.id, 1))
                          }
                        >
                          <MaterialSymbol>keyboard_arrow_down</MaterialSymbol>
                        </IconButton>
                      </VStack>
                    </Table.Cell>
                    <Table.Cell verticalAlign="middle">
                      <HStack gap={2} minW={0}>
                        <Badge
                          colorPalette={d.colorPalette}
                          maxW="full"
                          title={d.id}
                        >
                          <MaterialSymbol>{d.icon}</MaterialSymbol>
                          <Text truncate>{d.name || d.id}</Text>
                        </Badge>
                        {d.isDefault ? (
                          <Badge size="xs" variant="subtle">
                            {t("taxonomyEditor.badges.default", {
                              defaultValue: "Default",
                            })}
                          </Badge>
                        ) : null}
                        {archived ? (
                          <Badge
                            size="xs"
                            variant="subtle"
                            colorPalette="orange"
                          >
                            {t("taxonomyEditor.badges.archived", {
                              defaultValue: "Archived",
                            })}
                          </Badge>
                        ) : null}
                      </HStack>
                    </Table.Cell>
                    <Table.Cell verticalAlign="middle">
                      <Input
                        autoComplete="off"
                        minW="260px"
                        size="sm"
                        value={d.name}
                        onChange={(e) =>
                          update(d.id, {
                            name: e.target.value,
                          } as Partial<T>)
                        }
                      />
                    </Table.Cell>
                    <Table.Cell verticalAlign="middle">
                      <IconSelect
                        fallback={fallbackIcon}
                        icons={iconOptions}
                        value={d.icon}
                        onChange={(icon) =>
                          update(d.id, { icon } as Partial<T>)
                        }
                      />
                    </Table.Cell>
                    <Table.Cell verticalAlign="middle">
                      <ColorPaletteSelect
                        fallback={fallbackColorPalette}
                        value={d.colorPalette}
                        onChange={(colorPalette) =>
                          update(d.id, { colorPalette } as Partial<T>)
                        }
                      />
                    </Table.Cell>
                    {extraColumns.map((col) => (
                      <Table.Cell key={col.key} verticalAlign="middle">
                        {col.render(d, (patch) => update(d.id, patch))}
                      </Table.Cell>
                    ))}
                    <Table.Cell verticalAlign="middle" textAlign="center">
                      <Switch
                        checked={d.enabled && !archived}
                        disabled={archived}
                        onCheckedChange={({ checked }) =>
                          update(d.id, { enabled: checked } as Partial<T>)
                        }
                      />
                    </Table.Cell>
                    <Table.Cell verticalAlign="middle" textAlign="end">
                      <Menu.Root>
                        <Menu.Trigger asChild>
                          <IconButton
                            aria-label={t("taxonomyEditor.actions.openMenu", {
                              defaultValue: "Open menu",
                            })}
                            size="xs"
                            variant="ghost"
                          >
                            <MaterialSymbol>more_vert</MaterialSymbol>
                          </IconButton>
                        </Menu.Trigger>
                        <Portal>
                          <Menu.Positioner>
                            <Menu.Content>
                              <Menu.Item
                                value="moveUp"
                                disabled={isFirst}
                                onClick={() =>
                                  onChange(moveTaxonomy(definitions, d.id, -1))
                                }
                              >
                                <MaterialSymbol>arrow_upward</MaterialSymbol>
                                {t("taxonomyEditor.actions.moveUp", {
                                  defaultValue: "Move up",
                                })}
                              </Menu.Item>
                              <Menu.Item
                                value="moveDown"
                                disabled={isLast}
                                onClick={() =>
                                  onChange(moveTaxonomy(definitions, d.id, 1))
                                }
                              >
                                <MaterialSymbol>arrow_downward</MaterialSymbol>
                                {t("taxonomyEditor.actions.moveDown", {
                                  defaultValue: "Move down",
                                })}
                              </Menu.Item>
                              <Menu.Item
                                value="duplicate"
                                onClick={() => duplicate(d)}
                              >
                                <MaterialSymbol>content_copy</MaterialSymbol>
                                {t("taxonomyEditor.actions.duplicate", {
                                  defaultValue: "Duplicate",
                                })}
                              </Menu.Item>
                              <Menu.Item
                                value="copyId"
                                onClick={() => void copyTextToClipboard(d.id)}
                              >
                                <MaterialSymbol>tag</MaterialSymbol>
                                {t("taxonomyEditor.actions.copyId", {
                                  defaultValue: "Copy ID",
                                })}
                                <Menu.ItemCommand>{d.id}</Menu.ItemCommand>
                              </Menu.Item>
                              <Menu.Item
                                value="archive"
                                color={
                                  archived
                                    ? undefined
                                    : { base: "red.500", _dark: "red.300" }
                                }
                                onClick={() =>
                                  update(d.id, {
                                    archived: !archived,
                                    enabled: archived === true,
                                  } as Partial<T>)
                                }
                              >
                                <MaterialSymbol>
                                  {archived ? "unarchive" : "archive"}
                                </MaterialSymbol>
                                {archived
                                  ? t("taxonomyEditor.actions.restore", {
                                      defaultValue: "Restore",
                                    })
                                  : t("taxonomyEditor.actions.archive", {
                                      defaultValue: "Archive",
                                    })}
                              </Menu.Item>
                            </Menu.Content>
                          </Menu.Positioner>
                        </Portal>
                      </Menu.Root>
                    </Table.Cell>
                  </Table.Row>
                  {toggles.length > 0 ? (
                    <Table.Row bg="bg.subtle">
                      <Table.Cell />
                      <Table.Cell colSpan={totalCols + extraColumns.length}>
                        <HStack gap={4} wrap="wrap">
                          {toggles.map((toggle) => (
                            <Switch
                              key={toggle.key}
                              checked={d[toggle.key] === true}
                              onCheckedChange={({ checked }) =>
                                update(d.id, {
                                  [toggle.key]: checked,
                                } as Partial<T>)
                              }
                            >
                              {toggle.label}
                            </Switch>
                          ))}
                        </HStack>
                      </Table.Cell>
                    </Table.Row>
                  ) : null}
                </Fragment>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Stack>
  );
}
