import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import { uploadStorefrontLogo } from "@/lib/storefront-editor/assets";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const getLogoFile = async (request: Request) => {
  try {
    const formData = await request.formData();
    const file = formData.get("logo");

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

  const file = await getLogoFile(request);

  if (!file) {
    return NextResponse.json(
      { error: "Logo file is required." },
      {
        status: 400,
      },
    );
  }

  try {
    const uploadedLogo = await uploadStorefrontLogo({
      channelId: runtimeConfig.channelId,
      file,
      tenantId,
      uid: session.uid,
    });

    return NextResponse.json({
      logoUrl: uploadedLogo.logoUrl,
      ok: true,
    });
  } catch (error) {
    console.error("Error uploading storefront logo:", error);
    return NextResponse.json(
      { error: "Logo upload failed." },
      {
        status: 400,
      },
    );
  }
}
