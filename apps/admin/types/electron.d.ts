export interface PdfConversionOptions {
  pages?: number | number[] | "all";
  density?: number;
  format?: "tiff" | "png" | "jpg" | "pdf";
  width?: number;
  height?: number;
  compression?: "none" | "lzw" | "jpeg" | "packbits";
}

export interface PdfConversionResult {
  success: boolean;
  files: string[];
  message: string;
}

export interface PdfInfoResult {
  success: boolean;
  pageCount: number;
  widthPoints: number;
  heightPoints: number;
  widthInches: number;
  heightInches: number;
  fileSizeBytes: number;
}

export interface SystemRequirementsResult {
  hasGhostscript: boolean;
  isReady: boolean;
  message: string;
}

export interface FileCopyResult {
  success: boolean;
  message: string;
  path: string | null;
}

export interface OrderFileEntry {
  name: string;
  path: string;
  relativePath: string;
  size: number;
  modified: number;
  extension: string;
  kind: "image" | "pdf" | "other";
}

export interface OrderFolderFileEntry extends OrderFileEntry {
  id: string;
}

export interface OrderFolderEntry {
  id: string;
  name: string;
  relativePath: string;
  children: OrderFolderNode[];
}

export type OrderFolderNode =
  | (OrderFolderFileEntry & { type: "file" })
  | (OrderFolderEntry & { type: "folder" });

export interface OrderFilesListResult {
  success: boolean;
  files?: OrderFileEntry[];
  message?: string;
}

export interface OrderFolderFilesListResult {
  success: boolean;
  files?: OrderFolderFileEntry[];
  tree?: OrderFolderNode[];
  message?: string;
}

export interface PreviewResult {
  success: boolean;
  previewId?: string;
  previewUrl?: string;
  message?: string;
}

export interface SaveImageResult {
  success: boolean;
  path?: string;
  message?: string;
}

export interface ImageMetadata {
  prompt: string;
  model: string;
  aspectRatio?: string;
  negativePrompt?: string;
  timestamp: string;
}

export interface StagedPdfResult {
  success: boolean;
  uploadId?: string;
  fileName?: string;
  message?: string;
}

export interface KonfiDesktopAPI {
  orders: {
    pickOrderRoot: () => Promise<string | null>;
    listItemFiles: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      itemFolder: string;
    }) => Promise<OrderFilesListResult>;
    listOrderFiles: (payload: {
      baseFolderPath: string;
      orderNumber: number;
    }) => Promise<OrderFolderFilesListResult>;
    openOrderFolder: (payload: {
      baseFolderPath: string;
      orderNumber: number;
    }) => Promise<boolean>;
    openContainingFolder: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
    }) => Promise<boolean>;
    flattenPdf: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
      options?: {
        pages?: number | number[] | "all";
        density?: number;
        format?: "pdf";
      };
    }) => Promise<PdfConversionResult>;
    generatePreview: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
      options?: { width?: number; height?: number };
    }) => Promise<PreviewResult>;
    releasePreview: (previewId: string | null) => Promise<boolean>;
    startDrag: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePaths: string[];
      iconPreviewId?: string | null;
    }) => Promise<boolean>;
    copyUploadedFileToItem: (
      file: File,
      payload: {
        baseFolderPath: string;
        orderNumber: number;
        itemFolder: string;
        fileName?: string;
      },
    ) => Promise<FileCopyResult>;
  };
  fileConversion: {
    checkSystemRequirements: () => Promise<SystemRequirementsResult>;
    stageUploadedPdf: (file: File) => Promise<StagedPdfResult>;
    inspectPdf: (uploadId: string) => Promise<PdfInfoResult>;
    pickOutputDirectory: () => Promise<string | null>;
    convertPdf: (
      uploadId: string,
      outputDir: string,
      options?: PdfConversionOptions,
    ) => Promise<PdfConversionResult>;
    revealOutput: (filePath: string) => Promise<boolean>;
  };
  aiImages: {
    saveGeneratedImage: (
      imageData: string,
      metadata: ImageMetadata,
    ) => Promise<SaveImageResult>;
    getSaveDirectory: () => Promise<string>;
    pickSaveDirectory: () => Promise<boolean>;
    openSaveDirectory: () => Promise<boolean>;
  };
  runtime: {
    platform: string;
    checkForUpdates: () => Promise<void>;
    getVersion: () => Promise<string>;
  };
  appearance: {
    toggleDarkMode: () => Promise<boolean>;
    getDarkMode: () => Promise<boolean>;
    onDarkModeChange: (callback: (isDark: boolean) => void) => () => void;
    reload: () => Promise<void>;
    getZoomFactor: () => Promise<number>;
    setZoomFactor: (zoomFactor: number) => Promise<number>;
    zoomIn: () => Promise<number>;
    zoomOut: () => Promise<number>;
    resetZoom: () => Promise<number>;
  };
}

declare global {
  interface Window {
    konfiDesktop?: KonfiDesktopAPI;
  }
}
