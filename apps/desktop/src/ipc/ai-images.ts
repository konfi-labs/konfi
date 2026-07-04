import { app, shell } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import { secureHandle } from "../security/ipc-guard";

interface ImageMetadata {
  prompt: string;
  model: string;
  aspectRatio?: string;
  negativePrompt?: string;
  timestamp: string;
}

interface SaveImageResult {
  success: boolean;
  path?: string;
  message?: string;
}

// Configuration file path
const CONFIG_DIR = path.join(app.getPath("userData"), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "ai-images.json");

// Default save path
const getDefaultSavePath = () => {
  return path.join(app.getPath("pictures"), "Konfi AI");
};

// Load save path from config
const loadSavePath = async (): Promise<string> => {
  try {
    await fs.access(CONFIG_FILE);
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(data);
    return config.savePath || getDefaultSavePath();
  } catch {
    return getDefaultSavePath();
  }
};

// Save path to config
const saveSavePath = async (savePath: string): Promise<void> => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(
      CONFIG_FILE,
      JSON.stringify({ savePath }, null, 2),
      "utf-8",
    );
  } catch (error) {
    console.error("Error saving AI images path config:", error);
    throw error;
  }
};

// Sanitize filename to remove invalid characters
const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*]/g, "") // Remove invalid chars
    .replace(/\s+/g, "_") // Replace spaces with underscores
    .trim()
    .substring(0, 100); // Limit length
};

// Generate filename with metadata
const generateFilename = (metadata: ImageMetadata): string => {
  const timestamp = new Date(metadata.timestamp).getTime();
  const promptSnippet = sanitizeFilename(metadata.prompt.substring(0, 50));
  const model = sanitizeFilename(metadata.model.replace(/[^a-zA-Z0-9-]/g, "_"));

  return `${timestamp}_${model}_${promptSnippet}.png`;
};

// Generate date-based folder path (YYYY/MM-DD)
const getDateFolder = (timestamp: string): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return path.join(String(year), `${month}-${day}`);
};

export const setupAiImagesHandlers = () => {
  // Save generated image with metadata
  secureHandle(
    "ai:saveGeneratedImage",
    async (
      _event,
      imageData: string,
      metadata: ImageMetadata,
    ): Promise<SaveImageResult> => {
      try {
        // Get save path
        const basePath = await loadSavePath();

        // Create date-based folder structure
        const dateFolder = getDateFolder(metadata.timestamp);
        const savePath = path.join(basePath, dateFolder);

        // Ensure directory exists
        await fs.mkdir(savePath, { recursive: true });

        // Generate filename
        const filename = generateFilename(metadata);
        const filePath = path.join(savePath, filename);

        // Convert base64 to buffer
        const base64Data = imageData.includes(",")
          ? imageData.split(",")[1]
          : imageData;
        const buffer = Buffer.from(base64Data, "base64");

        // Save image file
        await fs.writeFile(filePath, buffer);

        // Save metadata as JSON sidecar file
        const metadataPath = filePath.replace(/\.png$/, ".json");
        await fs.writeFile(
          metadataPath,
          JSON.stringify(metadata, null, 2),
          "utf-8",
        );

        console.log("Saved AI-generated image:", filePath);

        return {
          success: true,
          path: filePath,
          message: "Image saved successfully",
        };
      } catch (error) {
        console.error("Error saving AI-generated image:", error);
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  // Get current save path
  secureHandle("ai:getAiImagesSavePath", async () => {
    return await loadSavePath();
  });

  // Set new save path
  secureHandle("ai:setAiImagesSavePath", async (_event, newPath: string) => {
    try {
      // Validate path exists or can be created
      await fs.mkdir(newPath, { recursive: true });
      await saveSavePath(newPath);
      return true;
    } catch (error) {
      console.error("Error setting AI images save path:", error);
      return false;
    }
  });

  // Open AI images folder
  secureHandle("ai:openAiImagesFolder", async () => {
    try {
      const savePath = await loadSavePath();
      await fs.mkdir(savePath, { recursive: true });
      await shell.openPath(savePath);
      return true;
    } catch (error) {
      console.error("Error opening AI images folder:", error);
      return false;
    }
  });
};
