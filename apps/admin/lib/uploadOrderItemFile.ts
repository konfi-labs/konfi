import { getOrderItemFolderName } from "@/lib/order-item-folder";
import {
  tenantStoragePaths,
  upload as firebaseUpload,
  type TenantContext,
} from "@konfi/firebase";
import { OrderItem } from "@konfi/types";

export interface UploadOrderItemFileParams {
  file: File;
  orderItem: OrderItem;
  orderId: string;
  customerId: string;
  channelId: string;
  orderNumber: number;
  tenantContext: TenantContext;
  baseFolderPath?: string;
  onProgress?: (progress: number) => void;
}

export interface UploadResult {
  success: boolean;
  message: string;
  filePath?: string;
  thumbnailPath?: string;
}

/**
 * Detect if file is PDF
 */
function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Detect if file is an image
 */
function isImage(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|bmp|tiff|tif)$/i.test(file.name)
  );
}

/**
 * Upload a file for an order item with automatic thumbnail generation
 */
export async function uploadOrderItemFile(
  params: UploadOrderItemFileParams,
): Promise<UploadResult> {
  const {
    file,
    orderItem,
    orderId,
    customerId,
    channelId,
    orderNumber,
    tenantContext,
    baseFolderPath,
    onProgress,
  } = params;

  try {
    // Validate file
    if (!file) {
      return {
        success: false,
        message: "No file provided",
      };
    }

    // Check file size (max 100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        success: false,
        message: `File is too large. Maximum size is 100MB.`,
      };
    }

    const itemName = getOrderItemFolderName(orderItem);
    const fileName = file.name;
    const itemId = orderItem.id;

    onProgress?.(10);

    // Step 1: Copy file to local order folder (if baseFolderPath is provided and Electron is available)
    let localFilePath: string | null = null;
    if (
      baseFolderPath &&
      typeof window !== "undefined" &&
      window.konfiDesktop?.orders
    ) {
      try {
        const copyResult =
          await window.konfiDesktop.orders.copyUploadedFileToItem(file, {
            baseFolderPath,
            orderNumber,
            itemFolder: itemName,
            fileName,
          });

        if (copyResult.success && copyResult.path) {
          localFilePath = copyResult.path;
          console.log("File copied to local folder:", localFilePath);
        } else {
          console.warn("Failed to copy to local folder:", copyResult.message);
          return {
            success: false,
            message: `Failed to copy file to local folder: ${copyResult.message}`,
          };
        }
      } catch (error) {
        console.error("Error copying to local folder:", error);
        return {
          success: false,
          message:
            error instanceof Error
              ? error.message
              : "Failed to copy file to local folder",
        };
      }
    } else {
      return {
        success: false,
        message: "Desktop app required for file upload",
      };
    }

    onProgress?.(40);

    // Step 2: Generate and upload thumbnail only
    let thumbnailPath: string | null = null;

    if (
      typeof window !== "undefined" &&
      window.konfiDesktop?.orders &&
      localFilePath
    ) {
      try {
        const fileNameWithoutExt = fileName.substring(
          0,
          fileName.lastIndexOf("."),
        );
        const thumbnailFileName = `thumb_${fileNameWithoutExt}.png`;

        if (isPdf(file)) {
          // Continue below.
        } else if (isImage(file)) {
          // Continue below.
        } else {
          console.log(
            "Skipping thumbnail generation for non-PDF/non-image file",
          );
        }

        onProgress?.(70);

        if (isPdf(file) || isImage(file)) {
          const previewResult =
            await window.konfiDesktop.orders.generatePreview({
              baseFolderPath,
              orderNumber,
              relativePath: `${itemName}/${fileName}`,
              options: { width: 200, height: 200 },
            });

          if (previewResult.success && previewResult.previewUrl) {
            try {
              const response = await fetch(previewResult.previewUrl);
              const thumbnailBlob = await response.blob();

              if (thumbnailBlob.size === 0) {
                console.warn("Thumbnail file is empty or could not be read");
              } else {
                const thumbnailFile = new File(
                  [thumbnailBlob],
                  thumbnailFileName,
                  { type: "image/png" },
                );

                // Upload to the tenant-aware thumb_orders path using item ID.
                thumbnailPath = tenantStoragePaths.orderItemThumbnailFile(
                  tenantContext,
                  channelId,
                  customerId,
                  orderId,
                  itemId,
                  thumbnailFileName,
                );

                await firebaseUpload([
                  {
                    file: thumbnailFile,
                    url: thumbnailPath,
                  },
                ]);

                console.log("Thumbnail uploaded:", thumbnailPath);
              }
            } catch (readError) {
              console.error("Error reading thumbnail file:", readError);
              // Don't fail the whole upload if thumbnail reading fails
            } finally {
              if (previewResult.previewId) {
                void window.konfiDesktop.orders.releasePreview(
                  previewResult.previewId,
                );
              }
            }
          } else if (!previewResult.success) {
            console.warn(
              "Failed to generate thumbnail:",
              previewResult.message,
            );
            // Don't fail the whole upload if thumbnail fails
          }
        }
      } catch (error) {
        console.error("Error generating/uploading thumbnail:", error);
        // Don't fail the whole upload if thumbnail fails
      }
    }

    onProgress?.(100);

    return {
      success: true,
      message:
        "File uploaded successfully to local folder" +
        (thumbnailPath ? " and thumbnail uploaded to Firebase" : ""),
      filePath: localFilePath || undefined,
      thumbnailPath: thumbnailPath || undefined,
    };
  } catch (error) {
    console.error("Error uploading file:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
