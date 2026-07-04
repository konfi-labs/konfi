import { AdminAuthError, getAuthenticatedAdminUid } from "@/actions/auth-utils";
import {
  downloadImpositionArchiveFromStorage,
  getImpositionArchiveDownloadMetadata,
} from "@/lib/imposition/storage.server";
import { connection } from "next/server";

function createJsonErrorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

function getStoragePathFromRequest(request: Request): string {
  const storagePath = new URL(request.url).searchParams.get("path")?.trim();

  if (!storagePath) {
    throw new Error("Imposition archive path is required.");
  }

  return storagePath;
}

function createArchiveHeaders(archive: {
  contentDisposition: string;
  contentLength?: string;
  contentType: string;
}): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Disposition": archive.contentDisposition,
    "Content-Type": archive.contentType,
  });

  if (archive.contentLength) {
    headers.set("Content-Length", archive.contentLength);
  }

  return headers;
}

function resolveErrorStatus(error: Error): number {
  if (error instanceof AdminAuthError) {
    return error.statusCode;
  }

  if (
    error.message === "Imposition archive path is required." ||
    error.message === "Invalid imposition archive path."
  ) {
    return 400;
  }

  if (error.message === "Imposition archive was not found.") {
    return 404;
  }

  return 500;
}

function resolveErrorMessage(error: Error): string {
  if (resolveErrorStatus(error) === 500) {
    return "Failed to download imposition archive.";
  }

  return error.message;
}

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    const accountId = await getAuthenticatedAdminUid();
    const storagePath = getStoragePathFromRequest(request);
    const archive = await downloadImpositionArchiveFromStorage({
      accountId,
      storagePath,
    });
    const body = new ArrayBuffer(archive.bytes.byteLength);
    new Uint8Array(body).set(archive.bytes);

    return new Response(body, {
      headers: createArchiveHeaders(archive),
      status: 200,
    });
  } catch (error) {
    console.error("[Impose Archive Download Route Error]:", error);

    if (error instanceof Error) {
      return createJsonErrorResponse(
        resolveErrorMessage(error),
        resolveErrorStatus(error),
      );
    }

    return createJsonErrorResponse(
      "Failed to download imposition archive.",
      500,
    );
  }
}

export async function HEAD(request: Request): Promise<Response> {
  await connection();

  try {
    const accountId = await getAuthenticatedAdminUid();
    const storagePath = getStoragePathFromRequest(request);
    const archive = await getImpositionArchiveDownloadMetadata({
      accountId,
      storagePath,
    });

    return new Response(null, {
      headers: createArchiveHeaders(archive),
      status: 200,
    });
  } catch (error) {
    console.error("[Impose Archive Download Route Error]:", error);

    if (error instanceof Error) {
      return createJsonErrorResponse(
        resolveErrorMessage(error),
        resolveErrorStatus(error),
      );
    }

    return createJsonErrorResponse(
      "Failed to download imposition archive.",
      500,
    );
  }
}
