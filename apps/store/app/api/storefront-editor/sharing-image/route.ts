import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import {
  uploadStorefrontFavicon,
  uploadStorefrontOpenGraphImage,
} from "@/lib/storefront-editor/assets";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type SharingImageKind = "favicon" | "openGraph";

const getSharingImageFile = async (
  request: Request,
): Promise<{ file: File; kind: SharingImageKind } | null> => {
  try {
    const formData = await request.formData();
    const file = formData.get("image");
    const kind = formData.get("kind");

    if (
      !(file instanceof File) ||
      (kind !== "favicon" && kind !== "openGraph")
    ) {
      return null;
    }

    return { file, kind };
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

  const upload = await getSharingImageFile(request);

  if (!upload) {
    return NextResponse.json(
      { error: "Sharing image file is required." },
      {
        status: 400,
      },
    );
  }

  try {
    const uploadedImage =
      upload.kind === "favicon"
        ? await uploadStorefrontFavicon({
            channelId: runtimeConfig.channelId,
            file: upload.file,
            tenantId,
            uid: session.uid,
          })
        : await uploadStorefrontOpenGraphImage({
            channelId: runtimeConfig.channelId,
            file: upload.file,
            tenantId,
            uid: session.uid,
          });

    return NextResponse.json({
      imageUrl: uploadedImage.imageUrl,
      ok: true,
    });
  } catch (error) {
    console.error("Error uploading storefront sharing image:", error);
    return NextResponse.json(
      { error: "Sharing image upload failed." },
      {
        status: 400,
      },
    );
  }
}
