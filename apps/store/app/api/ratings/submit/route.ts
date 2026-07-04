import {
  getAdminAuth,
  getAdminDb,
  getStoreRuntimeConfigForRequest,
  getTenantContextForRequest,
} from "@/lib/firebase/serverApp";
import {
  getStoreVertexClient,
  getStoreVertexThinkingProviderOptions,
} from "@/lib/ai/server-vertex";
import { MODELS, tenantFirestorePaths } from "@konfi/firebase";
import type { Classification, Rating } from "@konfi/types";
import { AggregateField, FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";

const AUTH_HEADER_PREFIX = "Bearer ";
const ACTIVE_CLASSIFICATION_CONFIDENCE = 0.95;

const ratingSubmitSchema = z.object({
  channelId: z.string().trim().min(1),
  productId: z.string().trim().min(1),
  ratingId: z.string().trim().min(1),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(5000).optional(),
});

const classificationSchema = z.object({
  label: z.enum(["Positive", "Neutral", "Negative"]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "Confidence level of the classification from 0 to 1, for example 0.95 means 95% confidence level.",
    ),
});

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith(AUTH_HEADER_PREFIX)) {
    return null;
  }

  return authHeader.slice(AUTH_HEADER_PREFIX.length);
}

function getRatingDocumentId(userId: string): string {
  return Buffer.from(userId).toString("base64url");
}

function isPublishedRating(params: {
  classification?: Classification;
  rating: number;
}) {
  if (!params.classification) {
    return params.rating >= 2;
  }

  return (
    (params.classification.label === "Positive" ||
      params.classification.label === "Neutral") &&
    params.rating >= 2 &&
    params.classification.confidence >= ACTIVE_CLASSIFICATION_CONFIDENCE
  );
}

async function classifyRatingComment(
  comment: string,
): Promise<Classification | undefined> {
  const vertex = await getStoreVertexClient();
  const { output } = await generateText({
    model: vertex(MODELS.GEMINI_3_FLASH_LITE),
    providerOptions: getStoreVertexThinkingProviderOptions({
      thinkingLevel: "minimal",
    }),
    output: Output.object({ schema: classificationSchema }),
    instructions:
      "You are Konfi. Classify the customer's product review as Positive, Neutral, or Negative.",
    prompt: comment,
  });

  return output;
}

export async function POST(request: NextRequest) {
  const idToken = getBearerToken(request);
  if (!idToken) {
    return NextResponse.json(
      { message: "User must be authenticated." },
      { status: 401 },
    );
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const parsedBody = ratingSubmitSchema.safeParse(await request.json());

    if (!parsedBody.success) {
      return NextResponse.json(
        { message: "Invalid rating payload." },
        { status: 400 },
      );
    }

    const { channelId, comment, productId, rating, ratingId } = parsedBody.data;
    const runtimeConfig = await getStoreRuntimeConfigForRequest();

    if (!runtimeConfig || runtimeConfig.channelId !== channelId) {
      return NextResponse.json(
        { message: "Rating channel is not available for this store." },
        { status: 403 },
      );
    }

    if (ratingId !== getRatingDocumentId(decodedToken.uid)) {
      return NextResponse.json(
        { message: "Rating does not belong to the authenticated user." },
        { status: 403 },
      );
    }

    const tenantContext = await getTenantContextForRequest();
    const productRef = getAdminDb().doc(
      tenantFirestorePaths.productDoc(tenantContext, channelId, productId),
    );
    const ratingRef = productRef.collection("ratings").doc(ratingId);
    const ratingSnapshot = await ratingRef.get();

    if (!ratingSnapshot.exists) {
      return NextResponse.json(
        { message: "Rating request was not found." },
        { status: 404 },
      );
    }

    const existingRating = ratingSnapshot.data() as Rating | undefined;
    if (
      !existingRating ||
      existingRating.userId !== decodedToken.uid ||
      existingRating.productId !== productId
    ) {
      return NextResponse.json(
        { message: "Rating does not belong to the authenticated user." },
        { status: 403 },
      );
    }

    let classification: Classification | undefined;
    if (comment) {
      try {
        classification = await classifyRatingComment(comment);
      } catch (error) {
        console.error("Failed to classify rating comment:", error);
      }
    }

    await ratingRef.update({
      rating,
      isRated: true,
      active:
        comment && !classification
          ? false
          : isPublishedRating({
              classification,
              rating,
            }),
      ...(comment ? { comment } : {}),
      ...(classification
        ? {
            classification: {
              label: classification.label,
              confidence: classification.confidence,
            },
          }
        : comment
          ? {}
          : {
              comment: FieldValue.delete(),
              classification: FieldValue.delete(),
            }),
    });

    const averageSnapshot = await productRef
      .collection("ratings")
      .where("active", "==", true)
      .aggregate({
        averageRating: AggregateField.average("rating"),
      })
      .get();
    const averageRating = averageSnapshot.data().averageRating;

    await productRef.set(
      {
        averageRating:
          typeof averageRating === "number"
            ? Number(averageRating.toFixed(1))
            : FieldValue.delete(),
      },
      { merge: true },
    );

    return NextResponse.json({ message: "Rating submitted" });
  } catch (error) {
    console.error("Failed to submit rating:", error);
    return NextResponse.json(
      { message: "Failed to submit rating." },
      { status: 500 },
    );
  }
}
