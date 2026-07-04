"use client";

const CART_THUMBNAIL_MAX_DIMENSION = 200;
let pdfWorkerSrc: string | undefined;

export function getCartThumbnailRenderSize({
  maxDimension = CART_THUMBNAIL_MAX_DIMENSION,
  sourceHeight,
  sourceWidth,
}: {
  maxDimension?: number;
  sourceHeight: number;
  sourceWidth: number;
}) {
  const safeMaxDimension = Math.max(1, Math.round(maxDimension));
  const safeSourceWidth = Math.max(1, sourceWidth);
  const safeSourceHeight = Math.max(1, sourceHeight);
  const scale = Math.min(
    safeMaxDimension / safeSourceWidth,
    safeMaxDimension / safeSourceHeight,
  );

  return {
    height: Math.max(1, Math.round(safeSourceHeight * scale)),
    width: Math.max(1, Math.round(safeSourceWidth * scale)),
  };
}

function createCartThumbnailFileName(fileName: string) {
  const extensionStart = fileName.lastIndexOf(".");
  const baseName =
    extensionStart >= 0 ? fileName.slice(0, extensionStart) : fileName;

  return `thumb_${baseName}.png`;
}

async function loadImageFromFile(file: File) {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new window.Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => {
        reject(
          new Error(`Failed to load image ${file.name} for thumbnailing.`),
        );
      };
      nextImage.src = objectUrl;
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function isPdfFile(file: File) {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

async function createThumbnailFileFromCanvas(
  canvas: HTMLCanvasElement,
  fileName: string,
): Promise<File> {
  const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Failed to create thumbnail blob for ${fileName}.`));
          return;
        }

        resolve(blob);
      },
      "image/png",
      1,
    );
  });

  return new File([thumbnailBlob], createCartThumbnailFileName(fileName), {
    type: "image/png",
  });
}

async function createCartImageThumbnail(file: File): Promise<File | null> {
  if (!file.type.startsWith("image/")) {
    return null;
  }

  const image = await loadImageFromFile(file);
  const thumbnailSize = getCartThumbnailRenderSize({
    sourceHeight: image.naturalHeight,
    sourceWidth: image.naturalWidth,
  });
  const canvas = document.createElement("canvas");
  canvas.width = thumbnailSize.width;
  canvas.height = thumbnailSize.height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not create a canvas context for cart thumbnailing.");
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return createThumbnailFileFromCanvas(canvas, file.name);
}

async function createCartPdfThumbnail(file: File): Promise<File | null> {
  if (!isPdfFile(file)) {
    return null;
  }

  const { GlobalWorkerOptions, getDocument } = await import("pdfjs-dist");
  const workerSrc = getPdfWorkerSrc();
  if (GlobalWorkerOptions.workerSrc !== workerSrc) {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = getDocument({ data: bytes });
  const pdf = await loadingTask.promise;

  try {
    const page = await pdf.getPage(1);

    try {
      const baseViewport = page.getViewport({ scale: 1 });
      const thumbnailSize = getCartThumbnailRenderSize({
        sourceHeight: baseViewport.height,
        sourceWidth: baseViewport.width,
      });
      const scale = Math.min(
        thumbnailSize.width / baseViewport.width,
        thumbnailSize.height / baseViewport.height,
      );
      const viewport = page.getViewport({ scale });
      const renderCanvas = document.createElement("canvas");
      const renderContext = renderCanvas.getContext("2d");

      if (!renderContext) {
        throw new Error(
          "Could not create a canvas context for PDF thumbnailing.",
        );
      }

      renderCanvas.width = Math.max(1, Math.ceil(viewport.width));
      renderCanvas.height = Math.max(1, Math.ceil(viewport.height));

      await page.render({
        background: "rgb(255, 255, 255)",
        canvas: renderCanvas,
        canvasContext: renderContext,
        viewport,
      }).promise;

      return createThumbnailFileFromCanvas(renderCanvas, file.name);
    } finally {
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }
}

function getPdfWorkerSrc() {
  pdfWorkerSrc ??= new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  return pdfWorkerSrc;
}

export async function createCartThumbnail(file: File): Promise<File | null> {
  const imageThumbnail = await createCartImageThumbnail(file);

  if (imageThumbnail) {
    return imageThumbnail;
  }

  return createCartPdfThumbnail(file);
}
