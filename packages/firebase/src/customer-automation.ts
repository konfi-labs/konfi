import {
  CustomerInvoiceAutomation,
  CustomerInvoiceAutomationCreate,
  CustomerInvoiceAutomationUpdate,
} from "@konfi/types";
import {
  DocumentReference,
  Firestore,
  Timestamp,
  doc,
  getDoc,
  setDoc,
} from "firebase/firestore";

const ADMIN_USER = { id: "admin", name: "Admin" } as const;

function automationDocRef(
  firestore: Firestore,
  customerId: string,
): DocumentReference<CustomerInvoiceAutomation> {
  return doc(
    firestore,
    `customers/${customerId}/fakturowniaAutomation/estimate`,
  ) as DocumentReference<CustomerInvoiceAutomation>;
}

export async function getCustomerInvoiceAutomation(
  firestore: Firestore,
  customerId: string,
): Promise<CustomerInvoiceAutomation | null> {
  const ref = automationDocRef(firestore, customerId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return null;
  }
  return snap.data() as CustomerInvoiceAutomation;
}

export async function setCustomerInvoiceAutomation(
  firestore: Firestore,
  customerId: string,
  data: CustomerInvoiceAutomationCreate | CustomerInvoiceAutomationUpdate,
): Promise<void> {
  const ref = automationDocRef(firestore, customerId);
  const now = Timestamp.now();
  const existing = await getDoc(ref);

  if (existing.exists()) {
    const current = existing.data() as CustomerInvoiceAutomation;
    const payload: CustomerInvoiceAutomation = {
      ...current,
      name: current.name ?? "Fakturownia estimate automation",
      enabled: data.enabled,
      fakturowniaClientId: data.fakturowniaClientId,
      updatedAt: now,
      updatedBy: ADMIN_USER,
    };
    await setDoc(ref as DocumentReference, payload);
    return;
  }

  const payload: CustomerInvoiceAutomation = {
    id: "estimate",
    name: "Fakturownia estimate automation",
    enabled: data.enabled,
    fakturowniaClientId: data.fakturowniaClientId,
    active: true,
    createdAt: now,
    updatedAt: now,
    createdBy: ADMIN_USER,
    updatedBy: ADMIN_USER,
  };

  await setDoc(ref as DocumentReference, payload);
}
