import { contextBridge, ipcRenderer } from "electron";

const fileToBuffer = async (file: File) => file.arrayBuffer();

const konfiDesktop = {
  orders: {
    pickOrderRoot: () => ipcRenderer.invoke("fs:selectDirectory"),
    listItemFiles: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      itemFolder: string;
    }) => ipcRenderer.invoke("orderFiles:list", payload),
    listOrderFiles: (payload: { baseFolderPath: string; orderNumber: number }) =>
      ipcRenderer.invoke("orderFiles:listOrderFiles", payload),
    openOrderFolder: (payload: { baseFolderPath: string; orderNumber: number }) =>
      ipcRenderer.invoke("orderFiles:openOrderFolder", payload),
    openContainingFolder: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
    }) => ipcRenderer.invoke("orderFiles:openContainingFolder", payload),
    flattenPdf: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
      options?: {
        pages?: number | number[] | "all";
        density?: number;
        format?: "pdf";
      };
    }) => ipcRenderer.invoke("orderFiles:flattenPdf", payload),
    generatePreview: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePath: string;
      options?: { width?: number; height?: number };
    }) => ipcRenderer.invoke("orderFiles:generatePreview", payload),
    releasePreview: (previewId: string | null) =>
      ipcRenderer.invoke("orderFiles:releasePreview", previewId),
    startDrag: (payload: {
      baseFolderPath: string;
      orderNumber: number;
      relativePaths: string[];
      iconPreviewId?: string | null;
    }) => ipcRenderer.invoke("orderFiles:startDrag", payload),
    copyUploadedFileToItem: async (
      file: File,
      payload: {
        baseFolderPath: string;
        orderNumber: number;
        itemFolder: string;
        fileName?: string;
      },
    ) =>
      ipcRenderer.invoke("orderFiles:copyUploadedFileToItem", {
        fileBuffer: await fileToBuffer(file),
        fileName: payload.fileName ?? file.name,
        baseFolderPath: payload.baseFolderPath,
        orderNumber: payload.orderNumber,
        itemFolder: payload.itemFolder,
      }),
  },
  fileConversion: {
    checkSystemRequirements: () =>
      ipcRenderer.invoke("pdf:checkSystemRequirements"),
    stageUploadedPdf: async (file: File) =>
      ipcRenderer.invoke(
        "fileConversion:stageUploadedPdf",
        await fileToBuffer(file),
        file.name,
      ),
    inspectPdf: (uploadId: string) =>
      ipcRenderer.invoke("fileConversion:inspectPdf", uploadId),
    pickOutputDirectory: () =>
      ipcRenderer.invoke("fileConversion:pickOutputDirectory"),
    convertPdf: (
      uploadId: string,
      outputDir: string,
      options?: {
        pages?: number | number[] | "all";
        density?: number;
        format?: "tiff" | "png" | "jpg" | "pdf";
        width?: number;
        height?: number;
        compression?: "none" | "lzw" | "jpeg" | "packbits";
      },
    ) => ipcRenderer.invoke("fileConversion:convertPdf", uploadId, outputDir, options),
    revealOutput: (filePath: string) =>
      ipcRenderer.invoke("fileConversion:revealOutput", filePath),
  },
  aiImages: {
    saveGeneratedImage: (
      imageData: string,
      metadata: {
        prompt: string;
        model: string;
        aspectRatio?: string;
        negativePrompt?: string;
        timestamp: string;
      },
    ) => ipcRenderer.invoke("ai:saveGeneratedImage", imageData, metadata),
    getSaveDirectory: () =>
      ipcRenderer.invoke("ai:getAiImagesSavePath") as Promise<string>,
    pickSaveDirectory: async () => {
      const directory = (await ipcRenderer.invoke(
        "fs:selectDirectory",
      )) as string | null;
      if (!directory) return false;
      return ipcRenderer.invoke("ai:setAiImagesSavePath", directory) as Promise<boolean>;
    },
    openSaveDirectory: () =>
      ipcRenderer.invoke("ai:openAiImagesFolder") as Promise<boolean>,
  },
  runtime: {
    platform: process.platform,
    checkForUpdates: () =>
      ipcRenderer.invoke("updater:checkForUpdates") as Promise<void>,
    getVersion: () =>
      ipcRenderer.invoke("updater:getVersion") as Promise<string>,
  },
  appearance: {
    toggleDarkMode: () => ipcRenderer.invoke("dark-mode:toggle"),
    getDarkMode: () => ipcRenderer.invoke("dark-mode:get"),
    onDarkModeChange: (callback: (isDark: boolean) => void) => {
      const listener = (_event: unknown, isDark: boolean) => callback(isDark);
      ipcRenderer.on("dark-mode:changed", listener);
      return () => ipcRenderer.removeListener("dark-mode:changed", listener);
    },
    reload: () => ipcRenderer.invoke("window:reload"),
    getZoomFactor: () => ipcRenderer.invoke("window:getZoomFactor"),
    setZoomFactor: (zoomFactor: number) =>
      ipcRenderer.invoke("window:setZoomFactor", zoomFactor),
    zoomIn: () => ipcRenderer.invoke("window:zoomIn"),
    zoomOut: () => ipcRenderer.invoke("window:zoomOut"),
    resetZoom: () => ipcRenderer.invoke("window:resetZoom"),
  },
};

contextBridge.exposeInMainWorld("konfiDesktop", konfiDesktop);
