"use client";

import {
  DEFAULT_STORE_GENERATION_STYLE,
  type StoreGenerationStyle,
} from "@/lib/ai/store-image-generation.shared";
import { useSyncExternalStore } from "react";
import type {
  GenerationProgressState,
  GenerationResponse,
} from "./ProductImageGenerationPanel.types";

const DEFAULT_ESTIMATED_DURATION_SECONDS = 60;

export type ProductImageGenerationSessionState = {
  prompt: string;
  improvePrompt: boolean;
  style: StoreGenerationStyle;
  result: GenerationResponse | null;
  generationStartedAt: number | null;
  rateLimitBlockedUntil: number | null;
};

const DEFAULT_SESSION_STATE: ProductImageGenerationSessionState = {
  prompt: "",
  improvePrompt: false,
  style: DEFAULT_STORE_GENERATION_STYLE,
  result: null,
  generationStartedAt: null,
  rateLimitBlockedUntil: null,
};

const sessionStateByKey = new Map<string, ProductImageGenerationSessionState>();
const sessionListenersByKey = new Map<string, Set<() => void>>();

function getSessionListeners(key: string): Set<() => void> {
  const listeners = sessionListenersByKey.get(key);
  if (listeners) {
    return listeners;
  }

  const nextListeners = new Set<() => void>();
  sessionListenersByKey.set(key, nextListeners);
  return nextListeners;
}

function notifySessionListeners(key: string) {
  for (const listener of getSessionListeners(key)) {
    listener();
  }
}

export function buildProductImageGenerationSessionKey(params: {
  productId: string;
  channelId?: string;
  selectedAttributeOptions?: Record<string, string>;
  width?: number;
  height?: number;
  pageCount?: number;
}): string {
  const normalizedAttributeOptions = Object.entries(
    params.selectedAttributeOptions ?? {},
  )
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, string>>((accumulator, [key, value]) => {
      accumulator[key] = value;
      return accumulator;
    }, {});

  return JSON.stringify({
    productId: params.productId,
    channelId: params.channelId ?? null,
    selectedAttributeOptions: normalizedAttributeOptions,
    width: params.width ?? null,
    height: params.height ?? null,
    pageCount: params.pageCount ?? null,
  });
}

export function getProductImageGenerationSessionState(
  key: string,
): ProductImageGenerationSessionState {
  return sessionStateByKey.get(key) ?? DEFAULT_SESSION_STATE;
}

export function updateProductImageGenerationSessionState(
  key: string,
  updater:
    | Partial<ProductImageGenerationSessionState>
    | ((
        previous: ProductImageGenerationSessionState,
      ) => ProductImageGenerationSessionState),
) {
  const previous = getProductImageGenerationSessionState(key);
  const next =
    typeof updater === "function"
      ? updater(previous)
      : {
          ...previous,
          ...updater,
        };

  sessionStateByKey.set(key, next);
  notifySessionListeners(key);
}

export function resetProductImageGenerationSessionState(key: string) {
  sessionStateByKey.delete(key);
  notifySessionListeners(key);
}

export function useProductImageGenerationSessionState(
  key: string,
): ProductImageGenerationSessionState {
  return useSyncExternalStore(
    (onStoreChange) => {
      const listeners = getSessionListeners(key);
      listeners.add(onStoreChange);

      return () => {
        listeners.delete(onStoreChange);
        if (listeners.size === 0) {
          sessionListenersByKey.delete(key);
        }
      };
    },
    () => getProductImageGenerationSessionState(key),
    () => DEFAULT_SESSION_STATE,
  );
}

export function getGenerationProgressFromTimestamp(
  generationStartedAt: number | null,
  estimatedDurationSeconds = DEFAULT_ESTIMATED_DURATION_SECONDS,
  currentTimestamp = Date.now(),
): GenerationProgressState | null {
  if (generationStartedAt === null) {
    return null;
  }

  const elapsedSeconds = Math.max(
    0,
    Math.floor((currentTimestamp - generationStartedAt) / 1000),
  );

  return {
    elapsedSeconds,
    remainingSeconds: Math.max(0, estimatedDurationSeconds - elapsedSeconds),
    progressPercent: Math.min(
      100,
      Math.round(
        (Math.min(elapsedSeconds, estimatedDurationSeconds) /
          estimatedDurationSeconds) *
          100,
      ),
    ),
    isOvertime: elapsedSeconds >= estimatedDurationSeconds,
    estimatedDurationSeconds,
  };
}
