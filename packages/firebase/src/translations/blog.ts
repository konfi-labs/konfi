import {
  BlogCategoryTranslation,
  BlogPostTranslation,
  BlogTagTranslation,
  Locale,
} from "@konfi/types";
import {
  deleteDoc,
  Firestore,
  getDoc,
  getDocs,
  Timestamp,
  where,
} from "firebase/firestore";
import { create, db, update } from "../firestore";

// Blog Post Translation Functions
export async function getBlogPostTranslations(
  firestore: Firestore,
  postId: string,
  locale?: Locale,
): Promise<BlogPostTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<BlogPostTranslation>(
      firestore,
      `/blogPosts/${postId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => ({
      ...(doc.data() as BlogPostTranslation),
      id: doc.id,
    }));
  } catch (error) {
    console.error("Error fetching blog post translations:", error);
    return [];
  }
}

export async function getBlogPostTranslation(
  firestore: Firestore,
  postId: string,
  locale: Locale,
): Promise<BlogPostTranslation | undefined> {
  try {
    const docRef = db.doc<BlogPostTranslation>(
      firestore,
      `/blogPosts/${postId}/translations`,
      locale,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return { ...(snapData.data() as BlogPostTranslation), id: snapData.id };
    }
  } catch (error) {
    console.error("Error fetching blog post translation:", error);
    return undefined;
  }
}

export async function createBlogPostTranslation(
  firestore: Firestore,
  postId: string,
  translation: Omit<BlogPostTranslation, "id" | "createdAt" | "updatedAt">,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<BlogPostTranslation>(
      firestore,
      `/blogPosts/${postId}/translations`,
      translation.locale,
    );
    const translationData: Omit<BlogPostTranslation, "id"> = {
      ...translation,
      createdAt: Timestamp.now(),
      createdBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      updatedBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
    };
    await create<Omit<BlogPostTranslation, "id">>(
      firestore,
      translationData,
      docRef,
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating blog post translation:", error);
    throw error;
  }
}

export async function updateBlogPostTranslation(
  firestore: Firestore,
  postId: string,
  locale: Locale,
  translation: Partial<
    Omit<BlogPostTranslation, "id" | "createdAt" | "createdBy" | "locale">
  >,
): Promise<void> {
  try {
    if (!translation.updatedBy) {
      throw new Error("Missing By field");
    }
    const docRef = db.doc<BlogPostTranslation>(
      firestore,
      `/blogPosts/${postId}/translations`,
      locale,
    );
    await update<Partial<BlogPostTranslation>>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
        updatedBy: {
          id: translation.updatedBy.id,
          name: translation.updatedBy.name,
        },
      },
      docRef,
    );
  } catch (error) {
    console.error("Error updating blog post translation:", error);
    throw error;
  }
}

export async function deleteBlogPostTranslation(
  firestore: Firestore,
  postId: string,
  locale: Locale,
): Promise<void> {
  try {
    const docRef = db.doc<BlogPostTranslation>(
      firestore,
      `/blogPosts/${postId}/translations`,
      locale,
    );
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting blog post translation:", error);
    throw error;
  }
}

// Blog Category Translation Functions
export async function getBlogCategoryTranslations(
  firestore: Firestore,
  categoryId: string,
  locale?: Locale,
): Promise<BlogCategoryTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<BlogCategoryTranslation>(
      firestore,
      `/blogCategories/${categoryId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => ({
      ...(doc.data() as BlogCategoryTranslation),
      id: doc.id,
    }));
  } catch (error) {
    console.error("Error fetching blog category translations:", error);
    return [];
  }
}

export async function getBlogCategoryTranslation(
  firestore: Firestore,
  categoryId: string,
  locale: Locale,
): Promise<BlogCategoryTranslation | undefined> {
  try {
    const docRef = db.doc<BlogCategoryTranslation>(
      firestore,
      `/blogCategories/${categoryId}/translations`,
      locale,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return {
        ...(snapData.data() as BlogCategoryTranslation),
        id: snapData.id,
      };
    }
  } catch (error) {
    console.error("Error fetching blog category translation:", error);
    return undefined;
  }
}

export async function createBlogCategoryTranslation(
  firestore: Firestore,
  categoryId: string,
  translation: Omit<BlogCategoryTranslation, "id" | "createdAt" | "updatedAt">,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<BlogCategoryTranslation>(
      firestore,
      `/blogCategories/${categoryId}/translations`,
      translation.locale,
    );
    const translationData: Omit<BlogCategoryTranslation, "id"> = {
      ...translation,
      createdAt: Timestamp.now(),
      createdBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      updatedBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
    };
    await create<Omit<BlogCategoryTranslation, "id">>(
      firestore,
      translationData,
      docRef,
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating blog category translation:", error);
    throw error;
  }
}

export async function updateBlogCategoryTranslation(
  firestore: Firestore,
  categoryId: string,
  locale: Locale,
  translation: Partial<
    Omit<BlogCategoryTranslation, "id" | "createdAt" | "createdBy" | "locale">
  >,
): Promise<void> {
  try {
    if (!translation.updatedBy) {
      throw new Error("Missing By field");
    }
    const docRef = db.doc<BlogCategoryTranslation>(
      firestore,
      `/blogCategories/${categoryId}/translations`,
      locale,
    );
    await update<Partial<BlogCategoryTranslation>>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
        updatedBy: {
          id: translation.updatedBy.id,
          name: translation.updatedBy.name,
        },
      },
      docRef,
    );
  } catch (error) {
    console.error("Error updating blog category translation:", error);
    throw error;
  }
}

export async function deleteBlogCategoryTranslation(
  firestore: Firestore,
  categoryId: string,
  locale: Locale,
): Promise<void> {
  try {
    const docRef = db.doc<BlogCategoryTranslation>(
      firestore,
      `/blogCategories/${categoryId}/translations`,
      locale,
    );
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting blog category translation:", error);
    throw error;
  }
}

// Blog Tag Translation Functions
export async function getBlogTagTranslations(
  firestore: Firestore,
  tagId: string,
  locale?: Locale,
): Promise<BlogTagTranslation[]> {
  try {
    const constraints = locale ? [where("locale", "==", locale)] : [];
    const translationsRef = db.query<BlogTagTranslation>(
      firestore,
      `/blogTags/${tagId}/translations`,
      99,
      undefined,
      constraints,
    );
    const snapData = await getDocs(translationsRef);
    return snapData.docs.map((doc) => ({
      ...(doc.data() as BlogTagTranslation),
      id: doc.id,
    }));
  } catch (error) {
    console.error("Error fetching blog tag translations:", error);
    return [];
  }
}

export async function getBlogTagTranslation(
  firestore: Firestore,
  tagId: string,
  locale: Locale,
): Promise<BlogTagTranslation | undefined> {
  try {
    const docRef = db.doc<BlogTagTranslation>(
      firestore,
      `/blogTags/${tagId}/translations`,
      locale,
    );
    const snapData = await getDoc(docRef);
    if (!snapData.exists()) {
      return undefined;
    } else {
      return { ...(snapData.data() as BlogTagTranslation), id: snapData.id };
    }
  } catch (error) {
    console.error("Error fetching blog tag translation:", error);
    return undefined;
  }
}

export async function createBlogTagTranslation(
  firestore: Firestore,
  tagId: string,
  translation: Omit<BlogTagTranslation, "id" | "createdAt" | "updatedAt">,
): Promise<string | undefined> {
  try {
    const docRef = db.doc<BlogTagTranslation>(
      firestore,
      `/blogTags/${tagId}/translations`,
      translation.locale,
    );
    const translationData: Omit<BlogTagTranslation, "id"> = {
      ...translation,
      createdAt: Timestamp.now(),
      createdBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
      updatedAt: Timestamp.now(),
      updatedBy: {
        id: translation.createdBy.id,
        name: translation.createdBy.name,
      },
    };
    await create<Omit<BlogTagTranslation, "id">>(
      firestore,
      translationData,
      docRef,
    );
    return docRef.id;
  } catch (error) {
    console.error("Error creating blog tag translation:", error);
    throw error;
  }
}

export async function updateBlogTagTranslation(
  firestore: Firestore,
  tagId: string,
  locale: Locale,
  translation: Partial<
    Omit<BlogTagTranslation, "id" | "createdAt" | "createdBy" | "locale">
  >,
): Promise<void> {
  try {
    if (!translation.updatedBy) {
      throw new Error("Missing By field");
    }
    const docRef = db.doc<BlogTagTranslation>(
      firestore,
      `/blogTags/${tagId}/translations`,
      locale,
    );
    await update<Partial<BlogTagTranslation>>(
      {
        ...translation,
        updatedAt: Timestamp.now(),
        updatedBy: {
          id: translation.updatedBy.id,
          name: translation.updatedBy.name,
        },
      },
      docRef,
    );
  } catch (error) {
    console.error("Error updating blog tag translation:", error);
    throw error;
  }
}

export async function deleteBlogTagTranslation(
  firestore: Firestore,
  tagId: string,
  locale: Locale,
): Promise<void> {
  try {
    const docRef = db.doc<BlogTagTranslation>(
      firestore,
      `/blogTags/${tagId}/translations`,
      locale,
    );
    await deleteDoc(docRef);
  } catch (error) {
    console.error("Error deleting blog tag translation:", error);
    throw error;
  }
}
