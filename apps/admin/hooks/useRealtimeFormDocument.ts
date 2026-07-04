"use client";

import { firestore } from "@/lib/firebase/clientApp";
import { db } from "@konfi/firebase";
import { onSnapshot } from "firebase/firestore";
import { startTransition, useEffect } from "react";
import {
  FieldPath,
  FieldPathValue,
  FieldValues,
  UseFormReturn,
} from "react-hook-form";

type IdentifiableDocument = {
  id?: string | null;
};

export function useRealtimeFormDocument<
  TFieldValues extends FieldValues,
  TFieldName extends FieldPath<TFieldValues>,
  TDocument extends IdentifiableDocument,
>({
  collectionPath,
  enabled = true,
  fieldName,
  form,
  value,
}: {
  collectionPath: string | null;
  enabled?: boolean;
  fieldName: TFieldName;
  form: UseFormReturn<TFieldValues>;
  value: TDocument | null | undefined;
}) {
  const { getValues, setValue } = form;
  const trimmedDocumentId =
    typeof value?.id === "string" ? value.id.trim() : null;
  const documentId =
    enabled && trimmedDocumentId ? trimmedDocumentId : null;

  useEffect(() => {
    if (!collectionPath || !documentId) {
      return;
    }

    const documentRef = db.doc<TDocument>(firestore, collectionPath, documentId);

    return onSnapshot(
      documentRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const currentValue = getValues(fieldName) as TDocument | null | undefined;

        if (!currentValue || currentValue.id !== documentId) {
          return;
        }

        const nextValue = snapshot.data() as FieldPathValue<
          TFieldValues,
          TFieldName
        >;

        startTransition(() => {
          setValue(fieldName, nextValue);
        });
      },
      (error) => {
        console.error(
          `Error subscribing to ${collectionPath}/${documentId}:`,
          error,
        );
      },
    );
  }, [collectionPath, documentId, fieldName, getValues, setValue]);
}
