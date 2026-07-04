import "server-only";

import { getAdminDb } from "@/lib/firebase/serverApp";
import { FieldValue } from "firebase-admin/firestore";
import type {
  EmailOrderImportDraft,
  EmailOrderImportFollowUpDraft,
} from "./types";

function getImportsCollection() {
  return getAdminDb().collection("emailOrderImports");
}

export async function saveEmailOrderImportDraftStep({
  importId,
  draft,
}: {
  importId: string;
  draft: EmailOrderImportDraft;
}) {
  "use step";

  await getImportsCollection().doc(importId).set(
    {
      status: "draft-ready",
      orderDraft: draft,
      followUpEmail: null,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveEmailOrderImportFollowUpStep({
  importId,
  followUpEmail,
}: {
  importId: string;
  followUpEmail: EmailOrderImportFollowUpDraft;
}) {
  "use step";

  await getImportsCollection().doc(importId).set(
    {
      status: "followup-required",
      followUpEmail,
      orderDraft: null,
      error: null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function saveEmailOrderImportFailureStep({
  importId,
  error,
}: {
  importId: string;
  error: string;
}) {
  "use step";

  await getImportsCollection().doc(importId).set(
    {
      status: "failed",
      error,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
