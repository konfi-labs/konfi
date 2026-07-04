import { firestore } from "@/lib/firebase/clientApp";
import { db } from "@konfi/firebase";
import { Product } from "@konfi/types";
import {
  deleteField,
  type DocumentReference,
  getDoc,
  setDoc,
} from "firebase/firestore";
import {
  AGENT_CUSTOM_PRODUCT_SETTINGS_DOC_ID,
  type AgentCustomProductSettings,
  canUseProductForAgentCustomProduct,
} from "./agent-custom-product-settings";

export function getAgentCustomProductSettingsRef(
  channelId: string,
): DocumentReference<AgentCustomProductSettings> {
  return db.doc<AgentCustomProductSettings>(
    firestore,
    `/channels/${channelId}/settings`,
    AGENT_CUSTOM_PRODUCT_SETTINGS_DOC_ID,
  );
}

export async function loadAgentCustomProductSettings(
  channelId: string,
): Promise<AgentCustomProductSettings | null> {
  const snapshot = await getDoc(getAgentCustomProductSettingsRef(channelId));
  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() ?? null;
}

export async function saveAgentCustomProductSettings(
  channelId: string,
  settings: AgentCustomProductSettings,
): Promise<void> {
  await setDoc(getAgentCustomProductSettingsRef(channelId), settings, {
    merge: true,
  });
}

export async function clearAgentCustomProductSettings(
  channelId: string,
): Promise<void> {
  await setDoc(
    getAgentCustomProductSettingsRef(channelId) as DocumentReference<
      Record<string, unknown>
    >,
    {
      defaultProductChannelId: deleteField(),
      defaultProductId: deleteField(),
      defaultProductName: deleteField(),
    },
    { merge: true },
  );
}

export async function loadAgentCustomProduct(
  channelId: string,
): Promise<Product | null> {
  const settings = await loadAgentCustomProductSettings(channelId);
  if (!settings?.defaultProductId) {
    return null;
  }

  const productChannelId = settings.defaultProductChannelId || channelId;
  const snapshot = await getDoc(
    db.doc<Product>(
      firestore,
      `/channels/${productChannelId}/products`,
      settings.defaultProductId,
    ),
  );

  if (!snapshot.exists()) {
    return null;
  }

  const product = {
    ...snapshot.data(),
    channelId: productChannelId,
    id: snapshot.id,
  } as Product;

  return canUseProductForAgentCustomProduct(product) ? product : null;
}
