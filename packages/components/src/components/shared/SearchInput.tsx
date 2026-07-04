"use client";

import {
  Button,
  type ConditionalValue,
  HStack,
  IconButton,
  Input,
  Presence,
} from "@chakra-ui/react";
import { DONE_TYPING_INTERVAL } from "@konfi/utils";
import { TFunction } from "i18next";
import React from "react";
import { Tooltip } from "../ui";
import { InputGroup } from "../ui/input-group";
import { MaterialSymbol } from "./MaterialSymbol";

type SearchHandler = (
  searchKey: string,
  vector?: boolean,
) => void | Promise<unknown[] | undefined | void | (() => void)>;

type SearchInputProps = {
  placeholder: string;
  searchFn?: SearchHandler;
  setSearchKey?: React.Dispatch<React.SetStateAction<string | null>>;
  cleanFn?: () => void;
  searchKey?: string | null;
  searchResults?: unknown[] | null;
  enableVectorSearch?: boolean;
  loading?: boolean;
  searchMode?: "debounced" | "manual";
  maxW?: ConditionalValue<string | number>;
  t: TFunction;
};

const hasActiveSearch = (
  searchKey?: string | null,
  searchResults?: unknown[] | null,
): boolean => {
  return (
    (searchKey !== null && searchKey !== undefined) ||
    (searchResults !== null && searchResults !== undefined)
  );
};

export function SearchInput({
  placeholder,
  searchFn,
  setSearchKey,
  cleanFn,
  searchKey,
  searchResults,
  enableVectorSearch,
  loading,
  searchMode = "manual",
  maxW = "xl",
  t,
}: SearchInputProps) {
  const typingTimerRef = React.useRef<number | null>(null);
  const [vectorSearch, setVectorSearch] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(searchKey ?? "");

  React.useEffect(() => {
    if (searchKey !== undefined) {
      setInputValue(searchKey ?? "");
    }
  }, [searchKey]);

  const clearTypingTimer = React.useCallback(() => {
    if (typingTimerRef.current === null) {
      return;
    }

    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = null;
  }, []);

  React.useEffect(() => {
    return () => {
      clearTypingTimer();
    };
  }, [clearTypingTimer]);

  React.useEffect(() => {
    if (searchMode === "manual") {
      clearTypingTimer();
    }
  }, [clearTypingTimer, searchMode]);

  const submitSearch = React.useCallback(
    (
      rawSearchKey: string,
      searchVector: boolean,
      allowEmptySearch: boolean,
    ) => {
      const nextSearchKey = rawSearchKey.trim();

      if (nextSearchKey.length === 0) {
        if (!allowEmptySearch) {
          return;
        }

        setInputValue("");

        if (setSearchKey) {
          setSearchKey(null);
          return;
        }

        if (!searchFn) {
          console.error("Missing search function");
          return;
        }

        void searchFn("", searchVector);
        return;
      }

      if (nextSearchKey !== rawSearchKey) {
        setInputValue(nextSearchKey);
      }

      if (setSearchKey) {
        setSearchKey(nextSearchKey);
        return;
      }

      if (!searchFn) {
        console.error("Missing search function");
        return;
      }

      void searchFn(nextSearchKey, searchVector);
    },
    [searchFn, setSearchKey],
  );

  const handleInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;

      setInputValue(nextValue);

      if (searchMode === "manual") {
        return;
      }

      clearTypingTimer();
      typingTimerRef.current = window.setTimeout(() => {
        submitSearch(nextValue, vectorSearch, true);
      }, DONE_TYPING_INTERVAL);
    },
    [clearTypingTimer, searchMode, submitSearch, vectorSearch],
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (searchMode === "manual") {
        if (event.key !== "Enter" || event.nativeEvent.isComposing) {
          return;
        }

        event.preventDefault();
        clearTypingTimer();
        submitSearch(inputValue, vectorSearch, false);
        return;
      }

      clearTypingTimer();
    },
    [clearTypingTimer, inputValue, searchMode, submitSearch, vectorSearch],
  );

  const handleManualSearch = React.useCallback(() => {
    clearTypingTimer();
    submitSearch(inputValue, vectorSearch, false);
  }, [clearTypingTimer, inputValue, submitSearch, vectorSearch]);

  const handleClean = React.useCallback(() => {
    clearTypingTimer();
    setInputValue("");

    if (setSearchKey && searchKey !== null && searchKey !== undefined) {
      setSearchKey(null);
      return;
    }

    if (cleanFn && searchResults !== null && searchResults !== undefined) {
      cleanFn();
    }
  }, [cleanFn, clearTypingTimer, searchKey, searchResults, setSearchKey]);

  const showClearButton =
    inputValue.length > 0 || hasActiveSearch(searchKey, searchResults);
  const vectorSearchTrigger = enableVectorSearch ? (
    <Tooltip
      content={t("search.semanticSearch", {
        defaultValue: "Semantic Search",
      })}
    >
      <IconButton
        aria-label={t("search.semanticSearch", {
          defaultValue: "Semantic Search",
        })}
        size={"2xs"}
        colorPalette={"primary"}
        variant={vectorSearch ? "solid" : "outline"}
        onClick={() => setVectorSearch((previous) => !previous)}
        loading={loading}
      >
        <MaterialSymbol>network_intelligence</MaterialSymbol>
      </IconButton>
    </Tooltip>
  ) : undefined;
  const inputPaddingEnd = (() => {
    if (searchMode === "manual") {
      if (showClearButton && enableVectorSearch) return "13rem";
      if (showClearButton) return "10.25rem";
      if (enableVectorSearch) return "5.75rem";
      return "3.5rem";
    }

    if (showClearButton) return "8rem";
    if (enableVectorSearch) return "3rem";
    return undefined;
  })();

  if (typeof window === "undefined") return null;

  return (
    <InputGroup
      maxW={maxW}
      minW={"0"}
      w={"full"}
      startElement={<MaterialSymbol>search</MaterialSymbol>}
      endElementProps={{ width: "auto", px: "0.5rem" }}
      endElement={
        searchMode === "manual" ? (
          <HStack gap={"1"}>
            {vectorSearchTrigger}
            <Presence
              present={showClearButton}
              animationStyle={{
                _open: "scale-fade-in",
                _closed: "scale-fade-out",
              }}
              animationDuration="fast"
            >
              <Button
                width={"7rem"}
                colorPalette={"primary"}
                h={"1.75rem"}
                size={"sm"}
                onClick={handleClean}
                disabled={loading}
              >
                <MaterialSymbol fontWeight={"600"}>close</MaterialSymbol>
                {t("search.clear", { defaultValue: "Clear" })}
              </Button>
            </Presence>
            <Tooltip
              content={t("search.search", {
                defaultValue: "Search",
              })}
            >
              <IconButton
                aria-label={t("search.search", {
                  defaultValue: "Search",
                })}
                width={"1.75rem"}
                height={"1.75rem"}
                colorPalette={"primary"}
                onClick={handleManualSearch}
                disabled={loading || inputValue.trim().length === 0}
                loading={loading}
              >
                <MaterialSymbol>search</MaterialSymbol>
              </IconButton>
            </Tooltip>
          </HStack>
        ) : (
          <Presence
            present={showClearButton}
            animationStyle={{
              _open: "scale-fade-in",
              _closed: "scale-fade-out",
            }}
            animationDuration="fast"
          >
            <Button
              width={"7rem"}
              colorPalette={"primary"}
              h={"1.75rem"}
              size={"sm"}
              onClick={handleClean}
              loading={loading}
            >
              <MaterialSymbol fontWeight={"600"}>close</MaterialSymbol>
              {t("search.clear", { defaultValue: "Clear" })}
            </Button>
          </Presence>
        )
      }
    >
      <Input
        id={"search"}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete={"off"}
        enterKeyHint={"search"}
        name={"search"}
        pe={inputPaddingEnd}
        spellCheck={false}
        type={"search"}
        value={inputValue}
        width={"full"}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
    </InputGroup>
  );
}
