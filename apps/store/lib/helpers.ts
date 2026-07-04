import { deleteObject, download } from "@/lib/firebase/storage";
import { db, get, getDoc, remove, update } from "@konfi/firebase";
import { Channel, OrderItem, Statistics } from "@konfi/types";
import { isNull, isUndefined } from "es-toolkit";
import {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  getCountFromServer,
  QueryConstraint,
} from "firebase/firestore";
import { Dispatch, SetStateAction } from "react";

export const init = async <T>(
  firestore: Firestore,
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  limit: number,
  setResults: Dispatch<SetStateAction<T[] | null>>,
  setLatest: Dispatch<SetStateAction<DocumentSnapshot<T> | null>> | undefined,
  emptyMessage: string,
  setSearchResults?: Dispatch<SetStateAction<T[] | null>>,
  queryConstraints?: QueryConstraint[],
  setCount?: Dispatch<SetStateAction<number>>,
) => {
  try {
    setLoading(true);
    const result = await get<T>(
      db.query<T>(
        firestore,
        collectionPath,
        limit,
        undefined,
        queryConstraints,
      ),
    );
    if (!result) {
      setResults(null);
      setLoading(false);
      throw emptyMessage;
    }
    const [_results, _latest] = result;
    setResults(_results);
    if (setLatest) {
      setLatest(_latest);
    }
    if (setSearchResults) {
      setSearchResults(_results);
    }
    if (!isUndefined(setCount)) {
      const count = (
        await getCountFromServer(db.collection<T>(firestore, collectionPath))
      ).data().count;
      setCount(count);
    }
    setLoading(false);
  } catch (error) {
    console.error(error);
  }
};

export const initDoc = async <T>(
  firestore: Firestore,
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
    console.error(error);
  }
};

export const initCart = async (
  firestore: Firestore,
  setLoading: Dispatch<SetStateAction<boolean>>,
  uid: string,
  setResult: Dispatch<SetStateAction<OrderItem[] | null>>,
  emptyMessage: string,
) => {
  try {
    setLoading(true);
    const result = await initDocResult<{ orderItems: OrderItem[] }>(
      firestore,
      setLoading,
      "/carts",
      uid,
      emptyMessage,
    );
    if (isUndefined(result)) {
      setResult(null);
      setLoading(false);
      throw emptyMessage;
    }
    setResult(result?.orderItems);
    setLoading(false);
  } catch (error) {
    console.error(error);
    setLoading(false);
  }
};

export const initDocResult = async <T>(
  firestore: Firestore,
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
    console.error(error);
    setLoading(false);
  }
};

export const search = async <T>(
  firestore: Firestore,
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  searchKey: string,
  setSearchResults: Dispatch<SetStateAction<T[] | null>>,
) => {
  try {
    setLoading(true);
    if (!searchKey) {
      setSearchResults(null);
      setLoading(false);
      return [];
    }
    const results = await get<T>(
      db.search<T>(firestore, collectionPath, searchKey, []),
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
  firestore: Firestore,
  setLoading: Dispatch<SetStateAction<boolean>>,
  collectionPath: string,
  documentId: string,
  refresh?: () => void,
) => {
  try {
    setLoading(true);
    await update<T>(
      { active: false } as T,
      db.doc<T>(firestore, collectionPath, documentId),
    );
    if (refresh) {
      refresh();
    }
    setLoading(false);
  } catch (error) {
    console.error(error);
    setLoading(false);
  }
};

export const removeDoc = async <T>(
  firestore: Firestore,
  collectionPath: string,
  documentId: string,
  setLoading?: Dispatch<SetStateAction<boolean>>,
  refresh?: () => void,
) => {
  try {
    if (setLoading) {
      setLoading(true);
    }
    await remove<T>(db.doc<T>(firestore, collectionPath, documentId));
    if (refresh) {
      refresh();
    }
    if (setLoading) {
      setLoading(false);
    }
  } catch (error) {
    console.error(error);
    if (setLoading) {
      setLoading(false);
    }
  }
};

export const getStatistics = async <T>(
  firestore: Firestore,
  setLoading: Dispatch<SetStateAction<boolean>>,
  setResults: Dispatch<SetStateAction<Statistics | null>>,
  channelId: Channel["id"],
) => {
  try {
    setLoading(true);
    const statistics: Statistics = {
      ordersCount: (
        await getCountFromServer(
          db.collection<T>(firestore, "/channels/" + channelId + "/orders"),
        )
      ).data().count,
      customersCount: (
        await getCountFromServer(db.collection<T>(firestore, "/customers"))
      ).data().count,
      quotesCount: (
        await getCountFromServer(
          db.collection<T>(firestore, "/channels/" + channelId + "/quotes"),
        )
      ).data().count,
      productsCount: (
        await getCountFromServer(
          db.collection<T>(firestore, "/channels/" + channelId + "/products"),
        )
      ).data().count,
    };
    setResults(statistics);
    setLoading(false);
  } catch (error) {
    console.error(error);
  }
};

export function searchByKey<T>(
  items: (T[] & { [key: string]: any }) | null,
  key: string,
  value: any,
): T[] & { [key: string]: any } {
  if (isNull(items)) throw "items are null";
  return items.filter((item) =>
    (item as T & { [key: string]: any })[key].toLowerCase().includes(value),
  );
}

export async function onFileDelete(
  url?: string,
  setDirtyFlag?: (value: SetStateAction<boolean>) => void,
  dirtyFlag?: boolean,
) {
  try {
    await deleteObject(url);
    if (!isUndefined(setDirtyFlag)) setDirtyFlag(!dirtyFlag);
  } catch (error) {
    console.error(error);
  }
}

export async function onFileDownload(url?: string) {
  try {
    await download(url);
  } catch (error) {
    console.error(error);
  }
}

export async function onFilePreview(url?: string) {
  try {
    await download(url, true);
  } catch (error) {
    console.error(error);
  }
}
