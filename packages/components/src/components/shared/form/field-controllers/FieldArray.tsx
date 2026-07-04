import { Box, Button, IconButton, Stack, VStack } from "@chakra-ui/react";
import { FieldData, FormData, SelectOption, Warehouse } from "@konfi/types";
import { getRandomId } from "@konfi/utils";
import { isEmpty } from "es-toolkit/compat";
import { i18n, TFunction } from "i18next";
import { memo, useCallback, useMemo, useRef, useState, type JSX } from "react";
import {
  FieldValues,
  useFieldArray,
  UseFieldArrayInsert,
  UseFieldArrayPrepend,
  UseFieldArrayRemove,
  useFormContext,
  UseFormSetValue,
  useWatch,
} from "react-hook-form";
import { MaterialSymbol } from "../../MaterialSymbol";
import type { FormControllerProps } from "../FormController";
import { FieldController } from "./FieldController";

const FieldArrayItem = memo(function FieldArrayItem({
  name,
  sectionFields,
  index,
  fieldArrayItemId,
  fieldsLength,
  borderColor,
  isOver,
  isDraggingItem,
  anyUninitialized,
  newField,
  update,
  searchResults,
  searchFn,
  warehouses,
  Templates,
  stackDirection,
  CombinationInput,
  ProductGroupedIndexedSearch,
  Generate,
  FileManagerActions,
  insert,
  prepend,
  remove,
  createNewEntry,
  setNewField,
  handleDragStart,
  handleDragEnter,
  handleDragOver,
  handleDragEnd,
  handleDrop,
  dynamicOptions,
  orderProcessingQueue,
  renderAfterField,
  t,
  i18n,
}: FieldArrayItemProps) {
  const fieldPrefix = `${name}[${index}]`;
  const itemBg = isOver ? { base: "gray.100", _dark: "gray.900" } : undefined;
  const prefixedSectionFields = useMemo(
    () =>
      sectionFields.map((field) => ({
        ...field,
        name: `${fieldPrefix}.${field.name}`,
      })),
    [fieldPrefix, sectionFields],
  );

  return (
    <Box
      position={"relative"}
      w={"100%"}
      p={8}
      pt={2}
      border={"1px solid"}
      borderColor={borderColor}
      bg={itemBg}
      borderRadius={"3xl"}
      role={"listitem"}
      aria-roledescription={"Draggable item"}
      data-draggable-card={"true"}
      opacity={isDraggingItem ? 0.6 : 1}
      transform={isDraggingItem ? "translateY(-6px) scale(1.02)" : undefined}
      boxShadow={isDraggingItem ? "xl" : undefined}
      transition={
        "transform 150ms ease, box-shadow 150ms ease, opacity 150ms ease, background-color 150ms ease, border-color 150ms ease"
      }
      cursor={
        anyUninitialized
          ? "not-allowed"
          : isDraggingItem
            ? "grabbing"
            : undefined
      }
      onDragEnter={(event) => handleDragEnter(event, index)}
      onDragOver={(event) => handleDragOver(event, index)}
      onDrop={(event) => handleDrop(event, index)}
    >
      <Stack
        px={1}
        py={1}
        borderRadius={"3xl"}
        direction={"row"}
        gap={"2"}
        justifyContent={"end"}
        zIndex={1}
      >
        {fieldPrefix.includes("option") && Templates && (
          <Templates option={fieldPrefix} />
        )}
        <IconButton
          variant={"ghost"}
          colorPalette={"red"}
          onClick={() => !anyUninitialized && remove(index)}
          aria-label={t("fieldArray.remove", { defaultValue: "Remove" })}
          size={"sm"}
          disabled={anyUninitialized || fieldsLength <= 1}
        >
          <MaterialSymbol>delete</MaterialSymbol>
        </IconButton>
        <IconButton
          variant={"ghost"}
          colorPalette={"primary"}
          onClick={() => {
            setNewField(fieldPrefix);
            if (!anyUninitialized) insert(index, createNewEntry());
          }}
          aria-label={t("fieldArray.add", { defaultValue: "Add" })}
          size={"sm"}
          disabled={anyUninitialized}
        >
          <MaterialSymbol>add</MaterialSymbol>
        </IconButton>
        <IconButton
          aria-label={t("fieldArray.dragHandle", {
            defaultValue: "Drag to reorder",
          })}
          variant={"ghost"}
          colorPalette={"gray"}
          draggable={!anyUninitialized}
          onDragStart={(event) => handleDragStart(event, index)}
          onDragEnd={handleDragEnd}
          size={"sm"}
          cursor={anyUninitialized ? "not-allowed" : "grab"}
          disabled={anyUninitialized || fieldsLength <= 1}
        >
          <MaterialSymbol>drag_indicator</MaterialSymbol>
        </IconButton>
      </Stack>
      <FieldController
        fields={prefixedSectionFields}
        fieldArrayIndex={index}
        update={update}
        searchResults={searchResults}
        searchFn={searchFn}
        sectionName={name}
        newField={newField}
        warehouses={warehouses}
        stackDirection={stackDirection}
        prepend={prepend}
        CombinationInput={CombinationInput}
        ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
        Generate={Generate}
        FileManagerActions={FileManagerActions}
        insert={insert}
        dynamicOptions={dynamicOptions}
        orderProcessingQueue={orderProcessingQueue}
        renderAfterField={renderAfterField}
        itemId={fieldArrayItemId}
        t={t}
        i18n={i18n}
      />
    </Box>
  );
});

export const FieldArray = ({
  name,
  sectionFields,
  defaultValues,
  update,
  searchResults,
  searchFn,
  warehouses,
  GenerateOrderItems,
  Templates,
  stackDirection,
  CombinationInput,
  ProductGroupedIndexedSearch,
  Generate,
  FileManagerActions,
  dynamicOptions,
  orderProcessingQueue = 0,
  renderAfterField,
  t,
  i18n,
}: FieldArrayProps) => {
  const borderColor = "gray.muted";
  const { control } = useFormContext();
  const { fields, remove, move, insert, prepend } = useFieldArray({
    control,
    name,
    keyName: "__fieldArrayId",
  });
  const [newField, setNewField] = useState<string>();
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Refs and constants used for auto-scrolling while dragging
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastClientYRef = useRef<number | null>(null);
  const SCROLL_THRESHOLD = 60; // px from edge to start scrolling
  const MAX_SCROLL_SPEED = 18; // max pixels per frame

  const isDragging = useMemo(() => draggingIndex !== null, [draggingIndex]);

  const usesCombination = useMemo(
    () => sectionFields?.some((field) => field.combination),
    [sectionFields],
  );
  const productFieldNames = useMemo(
    () =>
      usesCombination
        ? fields.map((_, index) => `${name}[${index}].product`)
        : [],
    [fields, name, usesCombination],
  );
  const watchedProducts = useWatch({
    control,
    disabled: !usesCombination || productFieldNames.length === 0,
    name: productFieldNames,
  }) as unknown[] | undefined;
  const anyUninitialized = useMemo(() => {
    if (!usesCombination) return false;
    if (!Array.isArray(watchedProducts)) return false;
    return watchedProducts.some((product) => {
      if (!product) return false;
      if (typeof product !== "object") return false;

      const keyCount = Object.keys(product).length;
      if (keyCount <= 4) return true;
      if (!("allowCustomPrice" in product)) return true;
      return false;
    });
  }, [watchedProducts, usesCombination]);

  // Auto-scroll loop driven by requestAnimationFrame
  const startAutoScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    const step = () => {
      const container =
        scrollContainerRef.current ?? document.scrollingElement ?? null;
      if (!container || draggingIndex === null || anyUninitialized) {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        return;
      }
      const clientY = lastClientYRef.current;
      if (clientY == null) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }
      const rect =
        container instanceof HTMLElement
          ? container.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };
      const topDistance = clientY - rect.top;
      const bottomDistance = rect.bottom - clientY;
      let delta = 0;
      if (topDistance < SCROLL_THRESHOLD) {
        delta = -Math.ceil(
          ((SCROLL_THRESHOLD - topDistance) / SCROLL_THRESHOLD) *
            MAX_SCROLL_SPEED,
        );
      } else if (bottomDistance < SCROLL_THRESHOLD) {
        delta = Math.ceil(
          ((SCROLL_THRESHOLD - bottomDistance) / SCROLL_THRESHOLD) *
            MAX_SCROLL_SPEED,
        );
      }
      if (delta !== 0) {
        if (container instanceof HTMLElement) {
          container.scrollTop += delta;
        } else {
          window.scrollBy({ top: delta });
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [draggingIndex, anyUninitialized]);

  const createNewEntry = useCallback(() => {
    const base = (defaultValues ?? {}) as Record<string, unknown>;
    const cloned: Record<string, unknown> =
      typeof structuredClone === "function"
        ? structuredClone(base)
        : (JSON.parse(JSON.stringify(base)) as Record<string, unknown>);
    if (cloned && typeof cloned === "object" && !("id" in cloned)) {
      cloned.id = getRandomId();
    }
    return cloned as FieldValues;
  }, [defaultValues]);

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      if (anyUninitialized) {
        e.preventDefault();
        return;
      }
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(index));
        const handleEl = e.currentTarget as HTMLElement;
        const card = handleEl.closest(
          '[data-draggable-card="true"]',
        ) as HTMLElement | null;
        if (card && e.dataTransfer.setDragImage) {
          e.dataTransfer.setDragImage(card, 24, 24);
        }
        // locate the nearest scrollable list container (we mark the list with data-draggable-list)
        const list = card?.closest(
          '[data-draggable-list="true"]',
        ) as HTMLElement | null;
        scrollContainerRef.current =
          list ?? (document.scrollingElement as HTMLElement | null);
      } catch {
        // ignore DataTransfer errors in some browsers
      }
      setDraggingIndex(index);
    },
    [anyUninitialized],
  );

  const handleDragEnter = useCallback(
    (_e: React.DragEvent, index: number) => {
      if (draggingIndex !== null && draggingIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggingIndex],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      if (anyUninitialized) return;
      e.preventDefault();
      if (draggingIndex !== null && draggingIndex !== index) {
        setDragOverIndex(index);
      }
      // update pointer position and ensure auto-scroll is running
      lastClientYRef.current = e.clientY;
      startAutoScroll();
    },
    [draggingIndex, anyUninitialized, startAutoScroll],
  );

  const handleDragEnd = useCallback(() => {
    // stop auto-scrolling and clear refs
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastClientYRef.current = null;
    scrollContainerRef.current = null;
    setDraggingIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      if (anyUninitialized) return handleDragEnd();
      let fromIndex = draggingIndex;
      if (fromIndex === null) {
        const data = e.dataTransfer.getData("text/plain");
        const parsed = Number.isNaN(Number(data)) ? null : Number(data);
        fromIndex = parsed;
      }
      if (fromIndex === null) return handleDragEnd();
      if (fromIndex !== toIndex) {
        move(fromIndex, toIndex);
      }
      handleDragEnd();
    },
    [draggingIndex, move, handleDragEnd, anyUninitialized],
  );

  return (
    <VStack
      gap={"2"}
      role={"list"}
      aria-label={t("fieldArray.listLabel", { defaultValue: "Orderable list" })}
      aria-disabled={anyUninitialized || undefined}
      data-draggable-list={"true"}
    >
      {GenerateOrderItems && <GenerateOrderItems prepend={prepend} />}
      {isEmpty(fields) && (
        <Button
          w={"100%"}
          colorPalette={"primary"}
          onClick={() => insert(0, createNewEntry())}
          disabled={anyUninitialized}
          aria-label={t("fieldArray.add", { defaultValue: "Add" })}
        >
          <MaterialSymbol>add</MaterialSymbol>
          {t("fieldArray.add", { defaultValue: "Add" })}
        </Button>
      )}
      {fields.map((field, index: number) => {
        const fieldArrayItemId = String(field["__fieldArrayId"] ?? "");
        const isOver = dragOverIndex === index && isDragging;
        return (
          <FieldArrayItem
            key={fieldArrayItemId}
            name={name}
            sectionFields={sectionFields}
            index={index}
            fieldArrayItemId={fieldArrayItemId}
            fieldsLength={fields.length}
            borderColor={borderColor}
            isOver={isOver}
            isDraggingItem={draggingIndex === index}
            anyUninitialized={anyUninitialized}
            newField={newField}
            update={update}
            searchResults={searchResults}
            searchFn={searchFn}
            warehouses={warehouses}
            Templates={Templates}
            stackDirection={stackDirection}
            CombinationInput={CombinationInput}
            ProductGroupedIndexedSearch={ProductGroupedIndexedSearch}
            Generate={Generate}
            FileManagerActions={FileManagerActions}
            insert={insert}
            prepend={prepend}
            remove={remove}
            createNewEntry={createNewEntry}
            setNewField={setNewField}
            handleDragStart={handleDragStart}
            handleDragEnter={handleDragEnter}
            handleDragOver={handleDragOver}
            handleDragEnd={handleDragEnd}
            handleDrop={handleDrop}
            dynamicOptions={dynamicOptions}
            orderProcessingQueue={orderProcessingQueue}
            renderAfterField={renderAfterField}
            t={t}
            i18n={i18n}
          />
        );
      })}
    </VStack>
  );
};

type FieldArrayProps = {
  name: string;
  sectionFields: FieldData[];
  defaultValues?: {};
  update?: boolean;
  searchResults?: { [x: string]: any[] | null };
  searchFn?: {
    [x: string]: (searchKey: string) => Promise<any[] | undefined | void>;
  };
  hasByField?: boolean;
  hasAttributesField?: boolean;
  hasToChannelField?: boolean;
  warehouses?: Warehouse[] | null;
  onValuesChange?: (values: any) => void;
  GenerateOrderItems?:
    | (({
        prepend,
      }: {
        prepend: UseFieldArrayPrepend<FieldValues, string>;
      }) => JSX.Element | null)
    | undefined;
  Templates?: ({ option }: { option: string }) => JSX.Element;
  stackDirection: FormData["sections"]["0"]["stackDirection"];
  CombinationInput?: ({
    index,
    insertAction,
    itemId,
  }: {
    index: number;
    insertAction: UseFieldArrayInsert<FieldValues, string>;
    itemId?: string;
  }) => JSX.Element | null;
  ProductGroupedIndexedSearch?: ({
    fieldData,
    fieldArrayIndex,
  }: {
    fieldData: FieldData;
    fieldArrayIndex: number | undefined;
  }) => JSX.Element;
  Generate?: React.ComponentType<{
    fieldData: FieldData;
    setValue: UseFormSetValue<FieldValues>;
    systemPrompt: string;
    context: string;
  }>;
  FileManagerActions?: React.ComponentType<{
    fieldData: FieldData;
  }>;
  dynamicOptions?: {
    contacts?: SelectOption[];
    shippingAddresses?: SelectOption[];
    billingAddresses?: SelectOption[];
  };
  orderProcessingQueue?: number;
  renderAfterField?: FormControllerProps["renderAfterField"];
  t: TFunction;
  i18n: i18n;
};

type FieldArrayItemProps = Omit<FieldArrayProps, "defaultValues"> & {
  index: number;
  fieldArrayItemId: string;
  fieldsLength: number;
  borderColor: string;
  isOver: boolean;
  isDraggingItem: boolean;
  anyUninitialized: boolean;
  newField: string | undefined;
  insert: UseFieldArrayInsert<FieldValues, string>;
  prepend: UseFieldArrayPrepend<FieldValues, string>;
  remove: UseFieldArrayRemove;
  createNewEntry: () => FieldValues;
  setNewField: (value: string) => void;
  handleDragStart: (event: React.DragEvent, index: number) => void;
  handleDragEnter: (event: React.DragEvent, index: number) => void;
  handleDragOver: (event: React.DragEvent, index: number) => void;
  handleDragEnd: () => void;
  handleDrop: (event: React.DragEvent, index: number) => void;
};
