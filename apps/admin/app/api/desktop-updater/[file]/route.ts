import { requireAdminAuth } from "@/actions/auth-utils";
import {
  DesktopUpdaterError,
  fetchLatestDesktopReleaseAsset,
} from "@/lib/desktop-updater";
import { connection, type NextRequest } from "next/server";

interface RouteParams {
  params: Promise<{ file: string; }>;
}

const decodeFileName = (rawFileName: string) => {
  try {
    return decodeURIComponent(rawFileName);
  } catch {
    return rawFileName;
  }
};

const handleAssetRequest = async (
  request: NextRequest,
  { params }: RouteParams,
) => {
  await connection();

  try {
    await requireAdminAuth();

    const rawFileName = (await params).file;
    const fileName = decodeFileName(rawFileName).trim();

    if (!fileName) {
      return Response.json(
        { error: "Desktop updater file name is required." },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 400,
        },
      );
    }

    return await fetchLatestDesktopReleaseAsset(fileName, request.headers);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unauthorized: Admin access required")
    ) {
      return Response.json(
        { error: "Unauthorized: Admin access required" },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: 401,
        },
      );
    }

    if (error instanceof DesktopUpdaterError) {
      return Response.json(
        { error: error.message },
        {
          headers: {
            "Cache-Control": "no-store",
          },
          status: error.status,
        },
      );
    }

    console.error("Desktop updater asset proxy failed:", error);

    return Response.json(
      { error: "Failed to fetch desktop updater asset." },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 500,
      },
    );
  }
};

export async function GET(request: NextRequest, context: RouteParams) {
  return handleAssetRequest(request, context);
}

export async function HEAD(request: NextRequest, context: RouteParams) {
  const response = await handleAssetRequest(request, context);

  return new Response(null, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });
}
