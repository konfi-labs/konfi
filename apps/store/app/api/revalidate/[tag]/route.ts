import { timingSafeEqual } from "crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

type Params = Promise<{ tag: string }>;

export async function POST(
  request: NextRequest,
  segmentData: { params: Params },
) {
  if (!process.env.REVALIDATE_SECRET) {
    return NextResponse.json(
      { error: "Revalidation secret is not set" },
      { status: 500 },
    );
  }

  const { tag } = await segmentData.params;

  const authHeader = request.headers.get("authorization");

  const expectedHeader = `Bearer ${process.env.REVALIDATE_SECRET}`;

  // It's important to use buffers for timingSafeEqual and to ensure they have the same length
  // to prevent the function from throwing an error and to avoid leaking length information.
  const expectedBuffer = Buffer.from(expectedHeader);
  const actualBuffer = Buffer.from(authHeader || "");

  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");

  if (path) {
    const decodedPath = decodeURIComponent(path);
    revalidatePath(decodedPath);
    return NextResponse.json({ revalidated: decodedPath });
  } else {
    revalidateTag(tag, "max");
    return NextResponse.json({ revalidated: tag });
  }
}
