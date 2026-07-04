import {
  db,
  get,
  getDoc,
  OrderBy,
  remove,
  tenant,
  update,
} from "@konfi/firebase";
import { Channel, Statistics, type TenantContext } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import {
  DocumentData,
  DocumentSnapshot,
  getCountFromServer,
  query as firestoreQuery,
  QueryConstraint,
} from "firebase/firestore";
import { Dispatch, SetStateAction } from "react";
import { firestore } from "./firebase/clientApp";
import { deleteObject, download } from "./firebase/storage";

function scopeQueryConstraints(
  queryConstraints: QueryConstraint[] | undefined,
  tenantContext: TenantContext | undefined,
) {
  return tenantContext
    ? tenant.queryConstraints(tenantContext, queryConstraints)
    : queryConstraints;
}

function shouldScopeTenantQueries(tenantContext: TenantContext): boolean {
  return (
    tenantContext.deploymentMode === "saas" || tenantContext.requireTenantId
  );
}

function logHelperError(error: unknown) {
  if (typeof error === "string") {
    console.warn(error);
    return;
  }

  console.error(error);
}

export const init = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  limit: number,
  setResults: Dispatch<SetStateAction<T[] | null>>,
  setLatest: Dispatch<SetStateAction<DocumentSnapshot<T> | null>> | undefined,
  emptyMessage: string,
  setSearchResults?: Dispatch<SetStateAction<T[] | null>>,
  queryConstraints?: QueryConstraint[],
  setCount?: Dispatch<SetStateAction<number>>,
  orderBy?: OrderBy,
  collectionGroup?: boolean,
  tenantContext?: TenantContext,
) => {
  try {
    setLoading(true);
    const scopedQueryConstraints = scopeQueryConstraints(
      queryConstraints,
      tenantContext,
    );
    const result = await get<T>(
      collectionGroup
        ? db.collectionGroup<T>(
            firestore,
            collectionPath,
            limit,
            scopedQueryConstraints,
          )
        : db.query<T>(
            firestore,
            collectionPath,
            limit,
            undefined,
            scopedQueryConstraints,
          ),
    );
    if (
      collectionPath ===
      `/channels/${process.env.NEXT_PUBLIC_STORE_CHANNEL_ID}/metadata`
    ) {
      console.log("result", result);
    }
    if (!result) {
      setResults(null);
      setLoading(false);
      throw emptyMessage;
    }
    const [_results, _latest] = result;
    setResults(_results);
    if (setLatest) setLatest(_latest);
    if (setSearchResults) setSearchResults(_results);
    if (!isUndefined(setCount)) {
      const countSource = scopedQueryConstraints
        ? firestoreQuery(
            db.collection<T>(firestore, collectionPath),
            ...scopedQueryConstraints,
          )
        : db.collection<T>(firestore, collectionPath);
      const count = (await getCountFromServer(countSource)).data().count;
      setCount(count);
    }
    setLoading(false);
  } catch (error) {
    logHelperError(error);
  }
};

export const initDoc = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  documentId: string,
  setResult: Dispatch<SetStateAction<T | null>>,
  emptyMessage: string,
) => {
  try {
    setLoading(true);
    await getDoc<T>(db.doc<T>(firestore, collectionPath, documentId)).then(
      (result) => {
        if (!result) {
          setResult(null);
          setLoading(false);
          throw emptyMessage;
        }
        setResult(result);
        setLoading(false);
      },
    );
  } catch (error) {
    logHelperError(error);
  }
};

export const initDocResult = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  documentId: string,
  emptyMessage: string,
): Promise<T | undefined> => {
  try {
    setLoading(true);
    const result = await getDoc<T>(
      db.doc<T>(firestore, collectionPath, documentId),
    ).then((result) => {
      if (!result) {
        setLoading(false);
        throw emptyMessage;
      }
      setLoading(false);
      return result;
    });
    return result;
  } catch (error) {
    logHelperError(error);
  }
};

export const show = async <T>(
  type: "FIRST" | "NEXT" | "PREVIOUS" | "LAST",
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  limit: number,
  latest: DocumentSnapshot<T> | null | undefined,
  setLatest: Dispatch<SetStateAction<DocumentSnapshot<T> | null>>,
  setResults: Dispatch<SetStateAction<T[] | null>>,
  queryConstraints?: QueryConstraint[],
  tenantContext?: TenantContext,
) => {
  try {
    setLoading(true);
    const scopedQueryConstraints = scopeQueryConstraints(
      queryConstraints,
      tenantContext,
    );
    const result = await get<T>(
      db.query(
        firestore,
        collectionPath,
        limit,
        type === "NEXT" ? latest || undefined : undefined,
        scopedQueryConstraints,
      ),
    );
    if (!result) {
      setLoading(false);
      return;
    }
    const [_results, _latest] = result;
    setResults(_results);
    setLatest(_latest);
    setLoading(false);
  } catch (error) {
    console.error(error);
  }
};

export const search = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  searchKey: string,
  setSearchResults: Dispatch<SetStateAction<T[] | null>>,
  queryConstraints?: QueryConstraint[],
  tenantContext?: TenantContext,
) => {
  try {
    if (!searchKey) {
      setSearchResults(null);
      setLoading(false);
      return [];
    }
    const results = await get<T>(
      db.search<T>(
        firestore,
        collectionPath,
        searchKey,
        scopeQueryConstraints(queryConstraints, tenantContext),
      ),
    );
    const _results = results?.[0];
    if (!_results) return [];
    setSearchResults(_results);
    setLoading(false);
    return _results;
  } catch (error) {
    console.error(error);
  }
};

export const deactivate = async <T extends DocumentData & { active?: boolean }>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  documentId: string,
  refresh?: () => void,
  tenantContext?: TenantContext,
) => {
  try {
    if (!documentId) {
      throw new Error(
        `Cannot deactivate document in ${collectionPath}: missing id.`,
      );
    }

    setLoading(true);
    await update<T>(
      { active: false } as T,
      db.doc<T>(firestore, collectionPath, documentId),
      tenantContext,
    );
    if (refresh) refresh();
    setLoading(false);
  } catch (error) {
    console.error(error);
    setLoading(false);
  }
};

export const removeDoc = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  documentId: string,
  refresh?: () => void,
) => {
  try {
    if (!documentId) {
      throw new Error(
        `Cannot remove document from ${collectionPath}: missing id.`,
      );
    }

    setLoading(true);
    await remove<T>(db.doc<T>(firestore, collectionPath, documentId));
    if (refresh) refresh();
    setLoading(false);
  } catch (error) {
    console.error(error);
    setLoading(false);
  }
};

export const getStatistics = async <T>(
  setLoading: Dispatch<SetStateAction<boolean>>,
  setResults: Dispatch<SetStateAction<Statistics | null>>,
  channelId: Channel["id"],
  tenantContext?: TenantContext,
) => {
  try {
    setLoading(true);
    const countSource = (collectionPath: string) =>
      tenantContext && shouldScopeTenantQueries(tenantContext)
        ? firestoreQuery(
            db.collection<T>(firestore, collectionPath),
            ...tenant.queryConstraints(tenantContext),
          )
        : db.collection<T>(firestore, collectionPath);
    const statistics: Statistics = {
      ordersCount: (
        await getCountFromServer(
          countSource("/channels/" + channelId + "/orders"),
        )
      ).data().count,
      customersCount: (
        await getCountFromServer(countSource("/customers"))
      ).data().count,
      quotesCount: (
        await getCountFromServer(
          countSource("/channels/" + channelId + "/quotes"),
        )
      ).data().count,
      productsCount: (
        await getCountFromServer(
          countSource("/channels/" + channelId + "/products"),
        )
      ).data().count,
    };
    setResults(statistics);
    setLoading(false);
  } catch (error) {
    console.error(error);
  }
};

export async function onFileDelete(
  url?: string,
  setDirtyFlag?: (value: SetStateAction<boolean>) => void,
  dirtyFlag?: boolean,
) {
  await deleteObject(url);
  if (!isUndefined(setDirtyFlag)) setDirtyFlag(!dirtyFlag);
}

export async function onFileDownload(url?: string) {
  await download(url);
}

export async function onFilePreview(url?: string) {
  await download(url, true);
}

/**
 * Constructs the full path to an order's folder
 * @param basePath - The base folder path for orders (from settings)
 * @param orderNumber - The order number
 * @returns The full path to the order's folder
 */
export function getOrderFolderPath(
  basePath: string,
  orderNumber: number,
): string {
  // Use path separator based on platform
  const separator = basePath.includes("\\") ? "\\" : "/";
  // Construct folder name using order number
  const folderName = `${orderNumber}`;
  return `${basePath}${separator}${folderName}`;
}

/**
 * Opens a folder using the Electron API
 * @param folderPath - The folder path to open
 * @param createIfNotExists - Whether to create the folder if it doesn't exist (default: true)
 * @returns Promise that resolves to true if successful, false otherwise
 */
export async function openOrderFolder(
  folderPath: string,
  createIfNotExists: boolean = true,
): Promise<boolean> {
  void createIfNotExists;
  if (typeof window === "undefined" || !window.konfiDesktop?.orders) {
    console.warn("Electron API not available");
    return false;
  }

  try {
    const pathParts = folderPath.split(/[/\\]/).filter(Boolean);
    const orderFolderName = pathParts.at(-1);
    const orderNumber = Number(orderFolderName);
    if (!Number.isInteger(orderNumber)) {
      return false;
    }
    const separator = folderPath.includes("\\") ? "\\" : "/";
    const baseFolderPath = pathParts.slice(0, -1).join(separator);
    return window.konfiDesktop.orders.openOrderFolder({
      baseFolderPath,
      orderNumber,
    });
  } catch (error) {
    console.error("Error opening folder:", error);
    return false;
  }
}
