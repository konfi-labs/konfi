"use client";

import {
  generateEntityTranslationAction,
  markEntityTranslationReviewedAction,
} from "@/actions/managed-translations";
import type { ManagedTranslationRef } from "@/lib/translations";
import { Locale } from "@konfi/types";
import {
  TranslationPanelView,
  type TranslationPanelGenerationMode,
  type TranslationPanelTranslation,
  type TranslationPanelViewProps,
} from "./TranslationPanelView";

export { ManagedTranslationStatusBadge } from "./TranslationPanelView";
export type {
  TranslationPanelFormType,
  TranslationPanelGenerationMode,
  TranslationPanelTranslation,
} from "./TranslationPanelView";

export interface TranslationPanelProps<
  TTranslation extends TranslationPanelTranslation,
> extends Omit<
  TranslationPanelViewProps<TTranslation>,
  "onGenerateTranslation" | "onMarkReviewed"
> {
  translationRef: ManagedTranslationRef;
}

export function TranslationPanel<
  TTranslation extends TranslationPanelTranslation,
>({ translationRef, ...props }: TranslationPanelProps<TTranslation>) {
  return (
    <TranslationPanelView
      {...props}
      onGenerateTranslation={({
        locale,
        mode,
      }: {
        locale: Locale;
        mode: TranslationPanelGenerationMode;
      }) =>
        generateEntityTranslationAction({
          ref: translationRef,
          locale,
          mode,
        })
      }
      onMarkReviewed={({ locale }: { locale: Locale }) =>
        markEntityTranslationReviewedAction({
          ref: translationRef,
          locale,
        })
      }
    />
  );
}
