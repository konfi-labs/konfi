"use client";

import { useListCollection } from "@chakra-ui/react";
import { SearchSelectOption } from "@konfi/types";
import { DONE_TYPING_INTERVAL, promiseOptions } from "@konfi/utils";
import { useCallback, useEffect, useRef, useState } from "react";

function useLatestRef<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

type SearcherMap = Record<
  string,
  (searchKey: string) => Promise<unknown[] | undefined | void>
>;

interface UseAsyncSearchSelectParams {
  isOpen: boolean;
  resourceKey: string;
  searchers: SearcherMap;
  debounce?: number;
  autoLoad?: boolean;
}

type SelectCollectionStore = ReturnType<
  typeof useListCollection<SearchSelectOption<{ id: string }>>
>;

interface UseAsyncSearchSelectResult {
  collection: SelectCollectionStore["collection"];
  loading: boolean;
  options: SearchSelectOption<{ id: string }>[];
  handleSearch: (inputValue: string) => void;
  refresh: (inputValue?: string) => Promise<void>;
  cancelPending: () => void;
  reset: () => void;
}

export function useAsyncSearchSelect({
  isOpen,
  resourceKey,
  searchers,
  debounce = DONE_TYPING_INTERVAL,
  autoLoad = true,
}: UseAsyncSearchSelectParams): UseAsyncSearchSelectResult {
  const [options, setOptions] = useState<SearchSelectOption<{ id: string }>[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const typingTimer = useRef<NodeJS.Timeout | null>(null);

  const { collection, set } = useListCollection<
    SearchSelectOption<{ id: string }>
  >({
    initialItems: options,
    itemToString: (item) => item.label?.toString() || "",
    itemToValue: (item) => item.value?.toString() || "",
  });

  useEffect(() => {
    set(options);
  }, [options, set]);

  const cancelPending = useCallback(() => {
    if (typingTimer.current) {
      clearTimeout(typingTimer.current);
      typingTimer.current = null;
    }
  }, []);

  const fetchOptions = useCallback(
    async (inputValue: string = "") => {
      setLoading(true);
      try {
        const values = await promiseOptions(inputValue, resourceKey, searchers);
        setOptions(values || []);
      } finally {
        setLoading(false);
      }
    },
    [resourceKey, searchers],
  );

  const fetchOptionsRef = useLatestRef(fetchOptions);

  const scheduleFetch = useCallback(
    (inputValue: string) => {
      cancelPending();
      typingTimer.current = setTimeout(() => {
        void fetchOptions(inputValue);
      }, debounce);
    },
    [cancelPending, debounce, fetchOptions],
  );

  useEffect(() => () => cancelPending(), [cancelPending]);

  useEffect(() => {
    if (!isOpen) {
      setOptions([]);
      cancelPending();
      return;
    }

    if (!autoLoad) return;

    void fetchOptionsRef.current("");
  }, [autoLoad, cancelPending, fetchOptionsRef, isOpen]);

  const reset = useCallback(() => setOptions([]), []);

  return {
    collection,
    loading,
    options,
    handleSearch: scheduleFetch,
    refresh: fetchOptions,
    cancelPending,
    reset,
  };
}
