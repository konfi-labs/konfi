import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { uploadStorefrontContentImage } from "@/lib/storefront-editor/assets";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const getImageFile = async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    return file instanceof File ? file : null;
  } catch {
    return null;
  }
};

export async function POST(request: Request) {
  const token = (await cookies()).get(STOREFRONT_EDITOR_COOKIE)?.value;
  const session = verifyStorefrontEditorToken(token);

  if (!session) {
    return NextResponse.json(
      { error: "Preview session expired." },
      {
        status: 401,
      },
    );
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();
  const tenantId = runtimeConfig?.tenantContext.tenantId;

  if (
    !runtimeConfig ||
    !tenantId ||
    runtimeConfig.channelId !== session.channelId ||
    tenantId !== session.tenantId
  ) {
    return NextResponse.json(
      { error: "Preview tenant mismatch." },
      {
        status: 403,
      },
    );
  }

  const file = await getImageFile(request);

  if (!file) {
    return NextResponse.json(
      { error: "Image file is required." },
      {
        status: 400,
      },
    );
  }

  try {
    const uploadedImage = await uploadStorefrontContentImage({
      channelId: runtimeConfig.channelId,
      file,
      tenantId,
      uid: session.uid,
    });

    return NextResponse.json({
      imageUrl: uploadedImage.imageUrl,
      ok: true,
    });
  } catch (error) {
    console.error("Error uploading storefront content image:", error);
    return NextResponse.json(
      { error: "Image upload failed." },
      {
        status: 400,
      },
    );
  }
}
