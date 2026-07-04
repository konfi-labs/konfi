import {
  Address,
  ApplicationMethodTargetTypeEnum,
  B2BInquiry,
  Campaign,
  Complaint,
  Contact,
  CurrencyEnum,
  Customer,
  dbMetadata,
  dbPageContent,
  DEFAULT_LOCALE,
  ImpositionWorkflowData,
  isNestedCustomer,
  Locale,
  NestedCustomer,
  NestedMember,
  Newsletter,
  Note,
  Order,
  type PaymentMethodId,
  PaymentType,
  Product,
  Promotion,
  Supplier,
} from "@konfi/types";
import type { TenantContext } from "@sblyvwx/cloud-contracts";
import {
  removeUndefined,
  validatePromotion,
  validatePromotionRules,
} from "@konfi/utils";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import {
  arrayUnion,
  collection,
  collectionGroup,
  CollectionReference,
  deleteDoc,
  doc,
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldPath,
  Firestore,
  getDoc as firestoreGetDoc,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  OrderByDirection,
  query,
  Query,
  QueryConstraint,
  QueryDocumentSnapshot,
  runTransaction,
  startAfter,
  Timestamp,
  UpdateData,
  updateDoc,
  where,
} from "firebase/firestore";
import { ImageListType } from "react-images-uploading";
import { firestore, initFirestore } from "./lib";
import { ORDER_COUNTERS_COLLECTION_ID } from "./order-number-counter";
import {
  requireTenantContextTenantId,
  resolveDocumentTenantId,
  withTenantId,
} from "./tenant-context";

export type OrderBy = {
  fieldPath: string | FieldPath;
  directionStr: OrderByDirection | undefined;
};

const converter = <T>() => ({
  toFirestore: (data: T) => ({ ...data }) as DocumentData,
  fromFirestore: (snapshot: QueryDocumentSnapshot) => snapshot.data() as T,
});

type QueryConstraintWithValue = QueryConstraint & {
  _field?: {
    canonicalString?: () => string;
  };
  _op?: string;
  _value?: unknown;
};

type NumberedCreateData = {
  number?: number;
  keywords?: string[] | string;
  tenantId?: string | null;
};

type NumberCounterDocument = {
  nextNumber?: number;
  tenantId?: string | null;
};

function hasOwnProperty(object: object, property: string) {
  return Object.prototype.hasOwnProperty.call(object, property);
}

function isValidNumberCounterValue(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function resolveNumberCounterDocumentRef<T>(
  numberedCollectionRef: CollectionReference<T>,
): DocumentReference<NumberCounterDocument> | null {
  const parentRef = numberedCollectionRef.parent;

  if (!parentRef) {
    return null;
  }

  return doc(
    collection(parentRef, ORDER_COUNTERS_COLLECTION_ID),
    numberedCollectionRef.id,
  ) as DocumentReference<NumberCounterDocument>;
}

async function resolveNextNumberFromCollection<T extends NumberedCreateData>(
  numberedCollectionRef: CollectionReference<T>,
): Promise<number> {
  const latestNumberQuery = query(
    numberedCollectionRef,
    orderBy("number", "desc"),
    limit(1),
  );
  const latestNumberSnapshot = await getDocs(latestNumberQuery);
  const latestNumber = latestNumberSnapshot.docs[0]?.data().number;

  return isValidNumberCounterValue(latestNumber) ? latestNumber + 1 : 0;
}

function withAssignedDocumentNumber<T extends NumberedCreateData>(
  data: T,
  number: number,
): T & { number: number } {
  return {
    ...data,
    number,
    ...(Array.isArray(data.keywords)
      ? { keywords: [...data.keywords, number.toString()] }
      : {}),
  };
}

function createNumberCounterWrite(
  nextNumber: number,
  tenantContext?: TenantContext,
): NumberCounterDocument & { tenantId?: string } {
  const counter = { nextNumber };

  return tenantContext
    ? withTenantId(counter, tenantContext, "Firestore number counter")
    : counter;
}

function getQueryConstraintFieldName(constraint: QueryConstraintWithValue) {
  return constraint._field?.canonicalString?.() ?? "<unknown>";
}

function assertValidQueryConstraints(
  collectionPath: string,
  queryConstraints?: QueryConstraint[],
) {
  for (const constraint of queryConstraints ?? []) {
    if (!hasOwnProperty(constraint, "_value")) {
      continue;
    }

    const filterConstraint = constraint as QueryConstraintWithValue;

    if (filterConstraint._value === undefined) {
      throw new Error(
        `Invalid Firestore query for "${collectionPath}": where("${getQueryConstraintFieldName(
          filterConstraint,
        )}", "${filterConstraint._op ?? "<unknown>"}", undefined) is not allowed.`,
      );
    }
  }
}

function dataWithDocumentId<T>(snapshot: QueryDocumentSnapshot<T>): T {
  const data = snapshot.data();

  if (data && typeof data === "object" && "id" in data && data.id) {
    return data;
  }

  return {
    ...(data as object),
    id: snapshot.id,
  } as T;
}

const docDataPoint = <T>(_firestore: Firestore, docPath: string) =>
  doc(_firestore, docPath).withConverter(converter<T>());
const collectionDataPoint = <T>(
  _firestore: Firestore,
  collectionPath: string,
) => collection(_firestore, collectionPath).withConverter(converter<T>());
const collectionGroupDataPoint = <T>(
  _firestore: Firestore,
  collectionPath: string,
  _limit: number,
  queryConstraints?: QueryConstraint[],
) => {
  assertValidQueryConstraints(collectionPath, queryConstraints);

  return queryConstraints
    ? query(
        collectionGroup(_firestore, collectionPath),
        limit(_limit),
        ...queryConstraints,
      ).withConverter(converter<T>())
    : query(
        collectionGroup(_firestore, collectionPath),
        orderBy("createdAt", "desc"),
        limit(_limit),
      ).withConverter(converter<T>());
};
const limitedQueryCollectionDataPoint = <T>(
  _firestore: Firestore,
  collectionPath: string,
  _limit: number,
  latestDoc: DocumentSnapshot<T> | null | undefined,
  queryConstraints?: QueryConstraint[],
  startDate?: Timestamp,
  endDate?: Timestamp,
  ranked?: boolean,
) => {
  assertValidQueryConstraints(collectionPath, queryConstraints);

  // Separate equality and inequality constraints for optimal ordering
  const equalityConstraints =
    queryConstraints?.filter(
      (c) =>
        c.type === "where" &&
        ![">=", "<=", ">", "<", "!="].some((op) =>
          // Check if constraint contains range operators
          JSON.stringify(c).includes(op),
        ),
    ) || [];

  const inequalityConstraints =
    queryConstraints?.filter(
      (c) =>
        c.type === "where" &&
        [">=", "<=", ">", "<", "!="].some((op) =>
          JSON.stringify(c).includes(op),
        ),
    ) || [];

  const orderByConstraint = queryConstraints?.find(
    (constraint) => constraint.type === "orderBy",
  );

  // Pass-through support for cursor/limit constraints (e.g., startAfter, endBefore, limitToLast)
  // We intentionally exclude where/orderBy from this set as they are handled above
  const extraConstraints = (queryConstraints || []).filter(
    (c) => c.type !== "where" && c.type !== "orderBy",
  );
  const cursorConstraints = extraConstraints.filter(
    (c) => c.type === "startAfter" || c.type === "endBefore",
  );
  // Support both limit and limitToLast; if multiple provided, prefer the last one
  const limitConstraints = extraConstraints.filter(
    (c) => c.type === "limit" || c.type === "limitToLast",
  );
  const effectiveLimitConstraint =
    limitConstraints.length > 0
      ? limitConstraints[limitConstraints.length - 1]
      : undefined;
  const hasCursorConstraints = cursorConstraints.length > 0;

  if (latestDoc) {
    if (startDate && endDate) {
      if (ranked) {
        return query(collection(_firestore, collectionPath)).withConverter(
          converter<T>(),
        );
      }
      // Optimal order: equality → inequality → orderBy → cursor(s) → limit
      return query(
        collection(_firestore, collectionPath),
        ...equalityConstraints,
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
        ...inequalityConstraints,
        orderByConstraint ? orderByConstraint : orderBy("createdAt", "desc"),
        ...(hasCursorConstraints ? cursorConstraints : [startAfter(latestDoc)]),
        ...(effectiveLimitConstraint
          ? [effectiveLimitConstraint]
          : [limit(_limit)]),
      ).withConverter(converter<T>());
    } else {
      return query(
        collection(_firestore, collectionPath),
        ...equalityConstraints,
        ...inequalityConstraints,
        orderByConstraint ? orderByConstraint : orderBy("createdAt", "desc"),
        ...(hasCursorConstraints ? cursorConstraints : [startAfter(latestDoc)]),
        ...(effectiveLimitConstraint
          ? [effectiveLimitConstraint]
          : [limit(_limit)]),
      ).withConverter(converter<T>());
    }
  } else {
    if (startDate && endDate) {
      return query(
        collection(_firestore, collectionPath),
        ...equalityConstraints,
        where("createdAt", ">=", startDate),
        where("createdAt", "<=", endDate),
        ...inequalityConstraints,
        orderByConstraint ? orderByConstraint : orderBy("createdAt", "desc"),
        ...cursorConstraints,
        ...(effectiveLimitConstraint
          ? [effectiveLimitConstraint]
          : [limit(_limit)]),
      ).withConverter(converter<T>());
    } else {
      return query(
        collection(_firestore, collectionPath),
        ...equalityConstraints,
        ...inequalityConstraints,
        orderByConstraint ? orderByConstraint : orderBy("createdAt", "desc"),
        ...cursorConstraints,
        ...(effectiveLimitConstraint
          ? [effectiveLimitConstraint]
          : [limit(_limit)]),
      ).withConverter(converter<T>());
    }
  }
};
// const searchQueryCollectionDataPoint = <T>(collectionPath: string, searchKey: string) => query(collection(firestore, collectionPath), where('id', '>=', searchKey), where('id', '<', searchKey+'z'), limit(3)).withConverter(converter<T>())
const searchQueryCollectionDataPoint = <T>(
  _firestore: Firestore,
  collectionPath: string,
  searchKey: string,
  queryConstraints?: QueryConstraint[],
) => {
  assertValidQueryConstraints(collectionPath, queryConstraints);

  return queryConstraints
    ? query(
        collection(_firestore, collectionPath),
        where("keywords", "array-contains", searchKey.toLowerCase()),
        limit(99),
        ...queryConstraints,
      ).withConverter(converter<T>())
    : query(
        collection(_firestore, collectionPath),
        where("keywords", "array-contains", searchKey.toLowerCase()),
        limit(99),
      ).withConverter(converter<T>());
};

export const db = {
  collection: <T>(_firestore: Firestore, collectionPath: string) =>
    collectionDataPoint<T>(_firestore, collectionPath),
  collectionGroup: <T>(
    _firestore: Firestore,
    collectionPath: string,
    limit: number,
    queryConstraints?: QueryConstraint[],
  ) =>
    collectionGroupDataPoint<T>(
      _firestore,
      collectionPath,
      limit,
      queryConstraints,
    ),
  doc: <T>(_firestore: Firestore, collectionPath: string, docId: string) =>
    docDataPoint<T>(_firestore, `${collectionPath}/${docId}`),
  query: <T>(
    _firestore: Firestore,
    collectionPath: string,
    limit: number,
    latestResult?: DocumentSnapshot<T> | null | undefined,
    queryConstraints?: QueryConstraint[],
    startDate?: string,
    endDate?: string,
    ranked?: boolean,
  ) =>
    limitedQueryCollectionDataPoint<T>(
      _firestore,
      collectionPath,
      limit,
      latestResult,
      queryConstraints,
      startDate ? Timestamp.fromDate(new Date(startDate)) : undefined,
      endDate ? Timestamp.fromDate(new Date(endDate)) : undefined,
      ranked,
    ),
  search: <T>(
    _firestore: Firestore,
    collectionPath: string,
    searchKey: string,
    queryConstraints?: QueryConstraint[],
  ) =>
    searchQueryCollectionDataPoint<T>(
      _firestore,
      collectionPath,
      searchKey,
      queryConstraints,
    ),
};

export const tenant = {
  shouldScopeQueries: (context: TenantContext) =>
    context.deploymentMode === "saas" || context.requireTenantId,
  where: (context: TenantContext) =>
    where(
      "tenantId",
      "==",
      requireTenantContextTenantId(context, "Firestore tenant query"),
    ),
  queryConstraints: (
    context: TenantContext,
    queryConstraints: QueryConstraint[] = [],
  ) =>
    tenant.shouldScopeQueries(context)
      ? [tenant.where(context), ...queryConstraints]
      : queryConstraints,
  collectionGroup: <T>(
    _firestore: Firestore,
    collectionPath: string,
    limit: number,
    context: TenantContext,
    queryConstraints?: QueryConstraint[],
  ) =>
    db.collectionGroup<T>(
      _firestore,
      collectionPath,
      limit,
      tenant.queryConstraints(context, queryConstraints),
    ),
  query: <T>(
    _firestore: Firestore,
    collectionPath: string,
    limit: number,
    context: TenantContext,
    latestResult?: DocumentSnapshot<T> | null | undefined,
    queryConstraints?: QueryConstraint[],
    startDate?: string,
    endDate?: string,
    ranked?: boolean,
  ) =>
    db.query<T>(
      _firestore,
      collectionPath,
      limit,
      latestResult,
      tenant.queryConstraints(context, queryConstraints),
      startDate,
      endDate,
      ranked,
    ),
  search: <T>(
    _firestore: Firestore,
    collectionPath: string,
    searchKey: string,
    context: TenantContext,
    queryConstraints?: QueryConstraint[],
  ) =>
    db.search<T>(
      _firestore,
      collectionPath,
      searchKey,
      tenant.queryConstraints(context, queryConstraints),
    ),
  resolveDocumentTenantId,
  withTenantId: <T extends object>(
    data: T & { tenantId?: string | null },
    context: TenantContext,
    operationName?: string,
  ) => withTenantId(data, context, operationName),
};

export const get = async <T>(query: Query<T>) => {
  try {
    const querySnap = await getDocs(query);
    if (!querySnap.empty) {
      return [
        querySnap.docs.map(dataWithDocumentId),
        querySnap.docs[querySnap.docs.length - 1] as DocumentSnapshot<T>,
        querySnap.docs.map((snap) => snap.ref as DocumentReference<T>),
      ] as const;
    } else {
      console.info(`No more results in this query`);
    }
  } catch (error) {
    console.error("Firestore get query failed", error);
    throw error;
  }
};

export const getDoc = async <T>(docRef: DocumentReference<T>) => {
  try {
    const docSnap = await firestoreGetDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as T;
    }

    console.info("Firestore document not found", { path: docRef.path });
    return undefined;
  } catch (error) {
    console.error("Firestore getDoc failed", { path: docRef.path, error });
    throw error;
  }
};

export const create = async <T>(
  _firestore: Firestore,
  data: T & {
    number?: number;
    keywords?: string[] | string;
    customer?: string | NestedCustomer;
    paymentType?: PaymentMethodId;
  },
  ref?: DocumentReference<T>,
  collectionRef?: CollectionReference<T>,
  counterRef?: CollectionReference<T>,
  order?: boolean,
  imageList?: ImageListType,
  createCheckoutSession?: (
    orderData: Order,
  ) => Promise<{ id: string; url: string }>,
  upload?: (imageList: { file: File; url: string }[]) => Promise<void>,
  tenantContext?: TenantContext,
): Promise<string | undefined> => {
  try {
    const dataForWrite = tenantContext
      ? withTenantId(data, tenantContext, "Firestore create")
      : data;
    let newDocRefId: string = "";
    await runTransaction(_firestore, async (transaction) => {
      let count: number = 0;
      let docSnap: Promise<DocumentSnapshot<T>>;
      let transactionData = dataForWrite;
      let numberCounterRef: DocumentReference<NumberCounterDocument> | null =
        null;
      let nextNumber: number | null = null;

      if (order && isUndefined(dataForWrite.paymentType)) {
        throw new Error("Nie podano metody płatności!");
      }

      if (counterRef && dataForWrite.number !== undefined) {
        numberCounterRef = resolveNumberCounterDocumentRef(counterRef);
      }

      if (numberCounterRef) {
        const counterSnapshot = await transaction.get(numberCounterRef);
        const counterNextNumber = counterSnapshot.data()?.nextNumber;
        const collectionNextNumber = await resolveNextNumberFromCollection(
          counterRef as CollectionReference<T & NumberedCreateData>,
        );

        let allocatedNumber = collectionNextNumber;
        if (counterSnapshot.exists()) {
          if (!isValidNumberCounterValue(counterNextNumber)) {
            throw new Error(
              `Number counter ${numberCounterRef.path} has a non-numeric nextNumber; refusing to allocate.`,
            );
          }

          allocatedNumber = Math.max(counterNextNumber, collectionNextNumber);
        }

        if (!isValidNumberCounterValue(allocatedNumber)) {
          throw new Error(
            `Number counter ${numberCounterRef.path} has a non-numeric nextNumber; refusing to allocate.`,
          );
        }

        nextNumber = allocatedNumber + 1;
        transactionData = withAssignedDocumentNumber(
          dataForWrite,
          allocatedNumber,
        );
      } else if (counterRef) {
        count = (await getCountFromServer(counterRef)).data().count;

        if (dataForWrite.number !== undefined) {
          transactionData = withAssignedDocumentNumber(dataForWrite, count);
        } else {
          console.info(`Obiekt nie zawiera parametru "number" aby go dodać!`);
        }
      } else if (dataForWrite.number === undefined) {
        console.info(`Obiekt nie zawiera parametru "number" aby go dodać!`);
      }

      if (ref) {
        newDocRefId = ref.id;
        docSnap = transaction.get(ref);
        if ((await docSnap).exists()) {
          throw new Error("Dokument o podanym identyfikatorze już istnieje!");
        } else {
          if (numberCounterRef && nextNumber !== null) {
            transaction.set(
              numberCounterRef,
              removeUndefined(
                createNumberCounterWrite(nextNumber, tenantContext),
              ),
              { merge: true },
            );
          }
          transaction.set(ref, removeUndefined(transactionData));
        }
      } else if (!isUndefined(collectionRef)) {
        const newDocRef = doc(collectionRef);
        const newDocRefPath = newDocRef.path;
        newDocRefId = newDocRef.id;
        if (numberCounterRef && nextNumber !== null) {
          transaction.set(
            numberCounterRef,
            removeUndefined(
              createNumberCounterWrite(nextNumber, tenantContext),
            ),
            { merge: true },
          );
        }
        transaction.set(
          newDocRef,
          removeUndefined({
            ...transactionData,
            id: newDocRefId,
          } as T & { id: string }),
        );
        if (
          order &&
          !isUndefined(transactionData?.customer) &&
          isNestedCustomer(transactionData.customer) &&
          !isUndefined(transactionData.customer?.id) &&
          transactionData.customer.id
        ) {
          transaction.update(
            db.doc<Customer>(
              _firestore,
              "/customers",
              transactionData.customer.id,
            ),
            {
              orders: arrayUnion(newDocRef.id),
            },
          );
        }
        if (
          order &&
          transactionData.paymentType === PaymentType.STRIPE &&
          createCheckoutSession
        ) {
          const orderData: Order = transactionData as unknown as Order;
          orderData.id = newDocRefId;
          orderData.path = newDocRefPath;
          const checkoutSession = await createCheckoutSession(orderData);
          if (!checkoutSession?.url || !checkoutSession?.id) {
            throw new Error(
              "checkoutSession.url or checkoutSession.id is undefined",
            );
          }
          const id = checkoutSession.id;
          const url = checkoutSession.url;
          const checkoutSessionUpdate: UpdateData<Order> = {
            checkoutSession: {
              id,
              url,
            },
          };
          transaction.update(
            newDocRef as unknown as DocumentReference<Order>,
            removeUndefined(checkoutSessionUpdate),
          );
        }
        if (imageList && upload) {
          await upload(
            imageList
              .map((image) => {
                if (!image.file) return undefined;
                return {
                  file: image.file,
                  url: `/images/${newDocRefId}/${image.file?.name}`,
                };
              })
              .filter(
                (image): image is { file: File; url: string } =>
                  image !== undefined,
              ),
          );
        }
      }
    });
    console.info("Dokument dodany!");
    return newDocRefId;
  } catch (error) {
    console.error("Firestore create failed", error);
    throw error;
  }
};

export const update = async <T extends object>(
  data: T,
  ref: DocumentReference<T> | DocumentReference<unknown>,
  tenantContext?: TenantContext,
) => {
  try {
    const dataForWrite = tenantContext
      ? withTenantId(data, tenantContext, "Firestore update")
      : data;
    await updateDoc(
      ref as unknown as DocumentReference<DocumentData>,
      removeUndefined(dataForWrite) as unknown as UpdateData<DocumentData>,
    );
    console.info("Dokument zaktualizowany!");
  } catch (error) {
    console.error("Firestore update failed", { path: ref.path, error });
    throw error;
  }
};

export const remove = async <T>(ref: DocumentReference<T>) => {
  try {
    await deleteDoc(ref);
    console.info("Dokument usunięty!");
  } catch (error) {
    console.error("Firestore delete failed", { path: ref.path, error });
    throw error;
  }
};

export async function getPromotions(firestore: Firestore, product: Product) {
  const result = await get<Promotion>(
    db.query<Promotion>(firestore, `/promotions`, 99, undefined, [
      where("active", "==", true),
      where("isAutomatic", "==", true),
      where(
        "applicationMethod.targetType",
        "==",
        ApplicationMethodTargetTypeEnum.ITEMS,
      ),
    ]),
  );
  if (!result) return [];
  const [promotions] = result;
  const _promotions: Promotion[] = [];
  for (const promotion of promotions) {
    const _promotion = promotion;
    if (!promotion.active) continue;
    if (!promotion.rules || promotion.rules.length <= 0) continue;
    const isMatching = validatePromotionRules(
      promotion.rules,
      product.id,
      product.category.id,
      CurrencyEnum.PLN,
    );
    if (isMatching) {
      if (promotion.campaignId) {
        const campaignRef = db.doc<Campaign>(
          firestore,
          "campaigns",
          promotion.campaignId,
        );
        const getDoc = (await import("firebase/firestore")).getDoc;
        const campaign = (await getDoc(campaignRef)).data();
        if (campaign) {
          _promotion.campaign = campaign;
        }
      }
      if (validatePromotion(_promotion, _promotion.campaign))
        _promotions.push(_promotion);
    }
  }
  return _promotions;
}

export async function getPromotion(firestore: Firestore, code: string) {
  try {
    const query = db.query<Promotion>(firestore, "promotions", 1, undefined, [
      where("code", "==", code),
      where("active", "==", true),
    ]);
    const snapData = await getDocs(query);
    if (snapData.empty) {
      throw `Promotion with code ${code} not found`;
    }
    const promotions = snapData.docs.map((doc) => doc.data());
    return promotions[0];
  } catch (error) {
    console.error(error);
  }
}

export async function getPromotionByCampaignId(
  firestore: Firestore,
  campaignId: string,
) {
  try {
    const query = db.query<Promotion>(firestore, "promotions", 1, undefined, [
      where("campaignId", "==", campaignId),
      where("active", "==", true),
    ]);
    const snapData = await getDocs(query);
    if (snapData.empty) {
      throw `Promotion with campaignId ${campaignId} not found`;
    }
    const promotions = snapData.docs.map((doc) => doc.data());
    return promotions[0];
  } catch (error) {
    console.error(error);
  }
}

export async function getCampaign(firestore: Firestore, id: string) {
  try {
    const docRef = db.doc<Campaign>(firestore, "campaigns", id);
    const campaign = await firestoreGetDoc(docRef);
    if (!campaign.exists()) {
      throw `Campaign with id ${id} not found`;
    }
    return campaign.data();
  } catch (error) {
    console.error(error);
  }
}

export async function getProductById(
  firestore: Firestore,
  id: string,
): Promise<Product | undefined> {
  try {
    const q = db.collectionGroup<Product>(firestore, "products", 1, [
      where("id", "==", id),
    ]);
    const snapData = await getDocs(q);
    if (snapData.empty) {
      throw `Product with id ${id} not found`;
    }
    const productDoc = snapData.docs[0];
    const product = productDoc.data();
    return {
      ...product,
      channelId: product.channelId ?? productDoc.ref.parent.parent?.id,
    };
  } catch (error) {
    console.error(error);
    return undefined;
  }
}

export async function getProductsByIds(
  firestore: Firestore,
  id: string[],
  omitPrices: boolean,
): Promise<Product[]> {
  try {
    const collectionGroup = db.collectionGroup<Product>(
      firestore,
      "products",
      99,
      [
        where("active", "==", true),
        where("availability.published", "==", true),
        where("id", "in", id),
      ],
    );
    const snapData = await getDocs(collectionGroup);
    if (snapData.empty) {
      throw `Products with ids ${id} not found`;
    }
    let products = snapData.docs.map((productDoc) => {
      const product = productDoc.data() as Product;

      return {
        ...product,
        channelId: product.channelId ?? productDoc.ref.parent.parent?.id,
      };
    });

    if (omitPrices) {
      products = products.map((product) => {
        product.prices = [];
        return product;
      });
    }

    return products;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getSuppliersByIds(
  firestore: Firestore,
  id: string[],
): Promise<Supplier[]> {
  try {
    const collectionGroup = db.collectionGroup<Supplier>(
      firestore,
      "suppliers",
      99,
      [where("id", "in", id)],
    );
    const snapData = await getDocs(collectionGroup);
    if (snapData.empty) {
      throw `Suppliers with ids ${id} not found`;
    }
    return snapData.docs.map((doc) => doc.data() as Supplier);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * Get suppliers that are linked to a specific attribute option
 */
export async function getSuppliersByAttributeOption(
  firestore: Firestore,
  attributeId: string,
  optionValue: string,
): Promise<Supplier[]> {
  try {
    const collectionGroup = db.collectionGroup<Supplier>(
      firestore,
      "suppliers",
      99,
      [
        where("linkedAttributeOptions", "array-contains", {
          attributeId,
          optionValue,
        }),
      ],
    );
    const snapData = await getDocs(collectionGroup);
    return snapData.docs.map((doc) => doc.data() as Supplier);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * Get all suppliers that have any linked attribute options for a specific attribute
 */
export async function getSuppliersByAttributeId(
  firestore: Firestore,
  attributeId: string,
): Promise<Supplier[]> {
  try {
    const collectionGroup = db.collection<Supplier>(firestore, "suppliers");
    const snapData = await getDocs(collectionGroup);

    const suppliers = snapData.docs.map((doc) => doc.data() as Supplier);
    return suppliers.filter((supplier) =>
      supplier.linkedAttributeOptions?.some(
        (option) => option.attributeId === attributeId,
      ),
    );
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getSupplier(firestore: Firestore, id: string) {
  try {
    const docRef = db.doc<Supplier>(firestore, "suppliers", id);
    const supplier = await firestoreGetDoc(docRef);
    if (!supplier.exists()) {
      throw `Supplier with id ${id} not found`;
    }
    return supplier.data();
  } catch (error) {
    console.error(error);
  }
}

export async function createSupplier(
  supplier: string,
  keywords: string[],
  member: NestedMember,
  contact?: Contact,
  address?: Address | null,
) {
  try {
    if (!firestore) {
      initFirestore();
    }
    const collectionRef = db.collection(firestore, "suppliers");
    const docRef = doc(collectionRef);
    const supplierData: Supplier = {
      id: docRef.id,
      name: supplier,
      companyName: supplier,
      contacts: [],
      addresses: [],
      specialNotes: "",
      linkedProductsIds: [],
      isPreferred: false,
      keywords: keywords,
      createdBy: member,
      createdAt: Timestamp.now(),
      updatedBy: member,
      updatedAt: Timestamp.now(),
      active: true,
    };
    if (contact) {
      supplierData.contacts?.push(contact);
    }
    if (address) {
      supplierData.addresses?.push(address);
    }
    await create(firestore, supplierData, docRef);
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getOrdersByIds(
  firestore: Firestore,
  id: string[],
): Promise<Order[]> {
  try {
    const collectionGroup = db.collectionGroup<Order>(firestore, "orders", 99, [
      where("id", "in", id),
    ]);
    const snapData = await getDocs(collectionGroup);
    if (snapData.empty) {
      throw `Orders with ids ${id} not found`;
    }
    return snapData.docs.map((doc) => doc.data() as Order);
  } catch (error) {
    console.error(error);
    return [];
  }
}

/**
 * Link a supplier to an attribute option
 */
export async function linkSupplierToAttributeOption(
  firestore: Firestore,
  attributeId: string,
  optionValue: string,
  supplierId: string,
  updatedBy: NestedMember,
): Promise<void> {
  try {
    if (!firestore) {
      initFirestore();
    }

    const supplierRef = db.doc<Supplier>(firestore, "suppliers", supplierId);
    const supplierDoc = await firestoreGetDoc(supplierRef);

    if (!supplierDoc.exists()) {
      throw `Supplier with id ${supplierId} not found`;
    }

    const supplier = supplierDoc.data()!;
    const currentOptions = supplier.linkedAttributeOptions || [];

    // Check if this option is already linked
    const isAlreadyLinked = currentOptions.some(
      (option) =>
        option.attributeId === attributeId &&
        option.optionValue === optionValue,
    );

    if (!isAlreadyLinked) {
      const updatedOptions = [...currentOptions, { attributeId, optionValue }];

      await updateDoc(supplierRef, {
        linkedAttributeOptions: updatedOptions,
        updatedBy,
        updatedAt: Timestamp.now(),
      });
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
}

/**
 * Unlink a supplier from an attribute option
 */
export async function unlinkSupplierFromAttributeOption(
  firestore: Firestore,
  attributeId: string,
  optionValue: string,
  supplierId: string,
  updatedBy: NestedMember,
): Promise<void> {
  try {
    if (!firestore) {
      initFirestore();
    }

    const supplierRef = db.doc<Supplier>(firestore, "suppliers", supplierId);
    const supplierDoc = await firestoreGetDoc(supplierRef);

    if (!supplierDoc.exists()) {
      throw `Supplier with id ${supplierId} not found`;
    }

    const supplier = supplierDoc.data()!;
    const currentOptions = supplier.linkedAttributeOptions || [];

    // Remove the specific option
    const updatedOptions = currentOptions.filter(
      (option) =>
        !(
          option.attributeId === attributeId &&
          option.optionValue === optionValue
        ),
    );

    await updateDoc(supplierRef, {
      linkedAttributeOptions: updatedOptions,
      updatedBy,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getCustomersByIds(
  firestore: Firestore,
  id: string[],
): Promise<Customer[]> {
  try {
    const collectionGroup = db.collectionGroup<Customer>(
      firestore,
      "customers",
      99,
      [where("id", "in", id)],
    );
    const snapData = await getDocs(collectionGroup);
    if (snapData.empty) {
      throw `Customers with ids ${id} not found`;
    }
    return snapData.docs.map((doc) => doc.data() as Customer);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getOrdersByDate(
  startDate: Timestamp,
  endDate: Timestamp,
  channelId: string,
): Promise<Order[]> {
  try {
    const collectionGroup = db.collectionGroup<Order>(firestore, "orders", 99, [
      where("active", "==", true),
      where("channelId", "==", channelId),
      where("createdAt", ">=", startDate),
      where("createdAt", "<=", endDate),
    ]);

    const snapData = await getDocs(collectionGroup);
    if (snapData.empty) {
      throw `Orders with dates between ${startDate.toDate()} and ${endDate.toDate()} not found`;
    }
    return snapData.docs.map((doc) => doc.data() as Order);
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getCustomer(firestore: Firestore, id: string) {
  try {
    const docRef = db.doc<Customer>(firestore, "customers", id);
    const customer = await firestoreGetDoc(docRef);
    if (!customer.exists()) {
      throw `Customer with id ${id} not found`;
    }
    return customer.data();
  } catch (error) {
    console.error(error);
  }
}

export async function getB2BInquiries(firestore: Firestore) {
  try {
    const query = db.collection(firestore, "b2bInquiries");
    const b2bInquiries = await getDocs(query);
    if (b2bInquiries.empty) {
      throw `No B2B Inquiries found`;
    } else {
      return b2bInquiries.docs.map((doc) => doc.data() as B2BInquiry);
    }
  } catch (error) {
    console.error(error);
  }
}

export async function getImpositionWorkflows(firestore: Firestore) {
  try {
    const query = db.collection(firestore, "impositionWorkflows");
    const impositionWorkflows = await getDocs(query);
    if (impositionWorkflows.empty) {
      throw `No Imposition Workflows found`;
    } else {
      return impositionWorkflows.docs.map((doc) => {
        const data = doc.data() as Partial<ImpositionWorkflowData> &
          Omit<ImpositionWorkflowData, "id">;
        return {
          ...data,
          id: data.id || doc.id,
        };
      });
    }
  } catch (error) {
    console.error(error);
  }
}

export async function getNewsletter(userId: string) {
  try {
    if (!userId) {
      throw `User id is undefined`;
    }
    if (!firestore) {
      initFirestore();
    }
    const doc = db.doc<Newsletter>(firestore, "newsletter", userId);
    const newsletter = await firestoreGetDoc(doc);
    return newsletter.data() as Newsletter;
  } catch (error) {
    console.error(error);
    return;
  }
}

export async function seoSlugExists(
  channelId: string,
  seoSlug: string,
  productId: string,
): Promise<boolean> {
  try {
    const normalizedSeoSlug = seoSlug.trim();

    if (!normalizedSeoSlug) {
      return false;
    }

    if (!firestore) {
      initFirestore();
    }
    const query = db.query<Product>(
      firestore,
      "/channels/" + channelId + "/products",
      2,
      undefined,
      [where("seo.slug", "==", normalizedSeoSlug)],
    );
    const snapData = await getDocs(query);

    return snapData.docs.some((doc) => doc.id !== productId);
  } catch (error) {
    console.error(error);
    return true;
  }
}

export async function createCustomer(
  customer: string,
  keywords: string[],
  member: NestedMember,
  contact?: Contact,
  shippingAddress?: Address | null,
  billingAddress?: Address | null,
  tenantContext?: TenantContext,
): Promise<string | undefined> {
  try {
    if (!firestore) {
      initFirestore();
    }
    const collectionRef = db.collection(firestore, "customers");
    const docRef = doc(collectionRef);
    const customerData: Customer = {
      id: docRef.id,
      name: customer,
      personName: customer,
      email: contact?.email ?? "",
      nip: billingAddress?.nip ?? "",
      allowedBankPayments: false,
      allowedOnPickupPayments: false,
      allowedDefferedPayments: false,
      contacts: [],
      addresses: [],
      specialNotes: "",
      orders: [],
      loyaltyPoints: 0,
      storeCreditBalance: 0,
      discount: 0,
      b2b: false,
      linkedProductsIds: [],
      keywords: keywords,
      createdBy: member,
      createdAt: Timestamp.now(),
      updatedBy: member,
      updatedAt: Timestamp.now(),
      active: true,
    };
    if (contact) {
      customerData.contacts?.push(contact);
    }
    if (shippingAddress) {
      customerData.addresses?.push(shippingAddress);
    }
    if (billingAddress) {
      customerData.addresses?.push(billingAddress);
    }
    const createdCustomerId = await create(
      firestore,
      customerData,
      docRef,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      tenantContext,
    );
    return createdCustomerId ?? docRef.id;
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function createContact(customerId: string, contact: Contact) {
  try {
    if (!firestore) {
      initFirestore();
    }
    const doc = db.doc<Customer>(firestore, "customers", customerId);
    await updateDoc(doc, {
      contacts: arrayUnion(contact),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function createAddress(
  customerId: string,
  address: Address | null,
) {
  try {
    if (!firestore) {
      initFirestore();
    }
    if (!address) {
      throw "Address is undefined";
    }
    const doc = db.doc<Customer>(firestore, "customers", customerId);
    await updateDoc(doc, {
      addresses: arrayUnion(address),
    });
  } catch (error) {
    console.error(error);
    throw error;
  }
}

export async function getPageMetadata(
  _firestore: Firestore,
  route: string,
  lng: Locale,
  channelId?: string,
): Promise<dbMetadata> {
  try {
    if (!channelId) {
      throw "Channel id is undefined";
    }

    const metadataRef = db.doc<dbMetadata>(
      _firestore,
      lng === DEFAULT_LOCALE
        ? `/channels/${channelId}/metadata`
        : `/channels/${channelId}/metadata/${route}/translations`,
      lng === DEFAULT_LOCALE ? route : lng,
    );

    const metadataSnapshot = await firestoreGetDoc(metadataRef);

    if (!metadataSnapshot.exists()) {
      return {
        id: "",
        title: "",
        description: "",
        keywords: "",
      };
    }

    const metadata = metadataSnapshot.data();

    if (!metadata) {
      return {
        id: "",
        title: "",
        description: "",
        keywords: "",
      };
    }

    return metadata;
  } catch (error) {
    console.error(error);
    return {
      id: "",
      title: "",
      description: "",
      keywords: "",
    };
  }
}

export async function getPageContent(
  _firestore: Firestore,
  route: string,
  lng: Locale,
  channelId?: string,
): Promise<dbPageContent> {
  try {
    if (!channelId) {
      throw "Channel id is undefined";
    }

    const metadata = await getDoc(
      db.doc<dbPageContent>(
        _firestore,
        lng === DEFAULT_LOCALE
          ? `/channels/${channelId}/pages`
          : `/channels/${channelId}/pages/${route}/translations`,
        lng === DEFAULT_LOCALE ? route : lng,
      ),
    );

    if (!metadata) {
      return {
        id: "",
        content: [],
      };
    }

    return metadata;
  } catch (error) {
    console.error(error);
    return {
      id: "",
      content: [],
    };
  }
}

export async function getNotes(
  _firestore: Firestore,
  entityId: string,
): Promise<Note[]> {
  try {
    if (!entityId) {
      throw "Entity id is undefined";
    }

    const notesQuery = query(
      collection(_firestore, "/notes"),
      where("entityId", "==", entityId),
      limit(99),
    );

    const querySnapshot = await getDocs(notesQuery);
    const notes = querySnapshot.docs.map((doc) => doc.data() as Note);

    if (isEmpty(notes)) {
      return [];
    }

    return notes;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getNotesByPrefix(
  _firestore: Firestore,
  entityIdPrefix: string,
): Promise<Note[]> {
  try {
    if (!entityIdPrefix) {
      throw "Entity id prefix is undefined";
    }

    const prefix = entityIdPrefix;
    const endPrefix = prefix + "\uf8ff";

    const notesQuery = query(
      collection(_firestore, "/notes"),
      where("entityId", ">=", prefix),
      where("entityId", "<", endPrefix),
      orderBy("entityId"),
      limit(99),
    );

    const querySnapshot = await getDocs(notesQuery);
    const notes = querySnapshot.docs.map((doc) => doc.data() as Note);

    return notes;
  } catch (error) {
    console.error(error);
    return [];
  }
}

export async function getComplaints(
  _firestore: Firestore,
  complaints: string[],
  channelId: string,
): Promise<Complaint[]> {
  try {
    if (!channelId) {
      throw "Channel id is undefined";
    }

    const query = await getDocs(
      db.query<DocumentData>(
        _firestore,
        `channels/${channelId}/complaints`,
        99,
        undefined,
        [where("id", "in", complaints)],
      ),
    );
    const _complaints = query.docs.map((doc) => doc.data() as Complaint);
    console.info("Loaded complaints", { count: _complaints.length });
    if (isEmpty(_complaints)) {
      return [];
    }

    return _complaints || "";
  } catch (error) {
    console.error(error);
    return [];
  }
}
