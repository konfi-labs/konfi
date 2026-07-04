import { execFile } from "child_process";
import { dialog, Notification, shell } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { randomUUID } from "crypto";
import { promisify } from "util";
import { resolveBundledExecutable } from "../utils/ghostscript";
import { secureHandle } from "../security/ipc-guard";
import {
  isRegisteredConversionOutput,
  registerConversionOutput,
  registerStagedPdfUpload,
  resolveStagedPdfUpload,
} from "../utils/file-conversion-registry";

const execFileAsync = promisify(execFile);

const supportedPdfOutputFormats = ["tiff", "png", "jpg", "pdf"] as const;
type PdfOutputFormat = (typeof supportedPdfOutputFormats)[number];

const TEMP_UPLOAD_DIR_NAME = "konfi-pdf-uploads";

const isPdfOutputFormat = (value: unknown): value is PdfOutputFormat =>
  typeof value === "string" &&
  supportedPdfOutputFormats.includes(value as PdfOutputFormat);

const notifyConversion = (title: string, body: string) => {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
};

const compareGeneratedRasterFiles =
  (baseName: string, format: Exclude<PdfOutputFormat, "pdf">) =>
    (left: string, right: string) => {
      const leftPage = generatedRasterPageNumber(left, baseName, format);
      const rightPage = generatedRasterPageNumber(right, baseName, format);

      if (leftPage !== rightPage) return leftPage - rightPage;
      return left.localeCompare(right);
    };

const generatedRasterPageNumber = (
  fileName: string,
  baseName: string,
  format: Exclude<PdfOutputFormat, "pdf">,
): number => {
  const prefix = `${baseName}-`;
  const suffix = `.${format}`;
  if (!fileName.startsWith(prefix) || !fileName.endsWith(suffix)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const pageText = fileName.slice(prefix.length, -suffix.length);
  const pageNumber = Number(pageText);
  return Number.isInteger(pageNumber) && pageNumber > 0
    ? pageNumber
    : Number.MAX_SAFE_INTEGER;
};

const isGeneratedRasterFile = (
  fileName: string,
  baseName: string,
  format: Exclude<PdfOutputFormat, "pdf">,
) => {
  const pageNumber = generatedRasterPageNumber(fileName, baseName, format);
  return pageNumber !== Number.MAX_SAFE_INTEGER;
};

// Helper to find Ghostscript executable
const findGhostscriptExecutable = async (
  isPackaged: boolean,
): Promise<string | null> => {
  // Try different Ghostscript command names
  const commands = ["gswin64c", "gswin32c", "gs"];

  for (const cmd of commands) {
    // First check bundled
    const bundled = await resolveBundledExecutable(cmd, isPackaged);
    if (bundled) return bundled;

    // Then check system PATH
    if (process.platform === "win32") {
      try {
        const { stdout } = await execFileAsync("where", [cmd], {
          shell: true,
          timeout: 5000,
        });
        const paths = stdout.trim().split(/\r?\n/).filter(Boolean);
        if (paths[0]) return paths[0];
      } catch {
        // continue
      }
    } else {
      try {
        const { stdout } = await execFileAsync("which", [cmd], {
          timeout: 5000,
        });
        const result = stdout.trim();
        if (result) return result;
      } catch {
        // continue
      }
    }
  }

  return null;
};

// Windows fallback resolver for well-known tools
const resolveWindowsToolPath = async (
  command: string,
): Promise<string | null> => {
  const programFiles = ["C:\\Program Files", "C:\\Program Files (x86)"].filter(
    Boolean,
  ) as string[];

  const pathExists = async (p: string) => {
    try {
      await fs.stat(p);
      return true;
    } catch {
      return false;
    }
  };

  // Helper to scan subdirectories matching a prefix and test candidate paths
  const findInPrefixedDirs = async (
    root: string,
    prefixes: string[],
    candidateRelPaths: string[],
  ): Promise<string | null> => {
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const dirs = entries
        .filter(
          (e) =>
            e.isDirectory() &&
            prefixes.some((pre) => e.name.toLowerCase().startsWith(pre)),
        )
        .map((e) => e.name);
      for (const dir of dirs) {
        for (const rel of candidateRelPaths) {
          const full = path.join(root, dir, rel);
          if (await pathExists(full)) return full;
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  // Ghostscript
  if (["gs", "gswin64c", "gswin32c"].includes(command)) {
    for (const pf of programFiles) {
      // Typical: C:\Program Files\gs\gs10.06.0\bin\gswin64c.exe
      const gsRoot = path.join(pf, "gs");
      if (await pathExists(gsRoot)) {
        const found = await findInPrefixedDirs(
          gsRoot,
          ["gs"], // gs<version>
          [
            path.join("bin", "gswin64c.exe"),
            path.join("bin", "gswin32c.exe"),
            path.join("bin", "gs.exe"),
          ],
        );
        if (found) return found;
      }
    }
  }

  return null;
};

const getPdfInfo = async (pdfPath: string) => {
  try {
    const stat = await fs.stat(pdfPath);
    const fileSizeBytes = stat.size;
    const buf = await fs.readFile(pdfPath);
    const content = buf.toString("latin1");

    let pageCount = 1;
    const countRegex = /\/Count\s+(\d{1,6})/g;
    let m: RegExpExecArray | null;
    while ((m = countRegex.exec(content)) !== null) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > pageCount) pageCount = n;
    }

    let widthPoints = 0;
    let heightPoints = 0;
    let foundBox = false;
    const boxTypes = ["MediaBox", "CropBox", "TrimBox", "ArtBox", "BleedBox"];
    const createBoxPatterns = (boxName: string) => [
      new RegExp(
        `/${boxName}\\s*\\[\\s*(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s*\\]`,
      ),
      new RegExp(
        `/${boxName}\\[(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\s+(-?\\d+(?:\\.\\d+)?)\\]`,
      ),
    ];

    for (const box of boxTypes) {
      if (foundBox) break;
      for (const pattern of createBoxPatterns(box)) {
        const match = pattern.exec(content);
        if (!match) continue;
        const x0 = parseFloat(match[1]);
        const y0 = parseFloat(match[2]);
        const x1 = parseFloat(match[3]);
        const y1 = parseFloat(match[4]);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        if (w > 0 && h > 0) {
          widthPoints = w;
          heightPoints = h;
          foundBox = true;
          break;
        }
      }
    }

    if (!foundBox) {
      return {
        success: false,
        pageCount,
        widthPoints: 0,
        heightPoints: 0,
        widthInches: 0,
        heightInches: 0,
        fileSizeBytes,
      };
    }

    return {
      success: true,
      pageCount,
      widthPoints,
      heightPoints,
      widthInches: widthPoints / 72,
      heightInches: heightPoints / 72,
      fileSizeBytes,
    };
  } catch (err) {
    console.error("Error reading PDF info:", err);
    return {
      success: false,
      pageCount: 0,
      widthPoints: 0,
      heightPoints: 0,
      widthInches: 0,
      heightInches: 0,
      fileSizeBytes: 0,
    };
  }
};

export interface PdfConversionOptions {
  pages?: number | number[] | "all";
  density?: number;
  format?: "tiff" | "png" | "jpg" | "pdf";
  width?: number;
  height?: number;
  compression?: "none" | "lzw" | "jpeg" | "packbits";
}

export const convertPdfFile = async (
  pdfPath: string,
  outputDir: string,
  options: PdfConversionOptions | undefined,
  isPackaged: boolean,
) => {
  try {
    const { pages = "all", density = 300, width, height } = options || {};
    const requestedFormat = options?.format ?? "tiff";

    if (!isPdfOutputFormat(requestedFormat)) {
      return {
        success: false,
        files: [],
        message: "Unsupported output format.",
      };
    }

    const format = requestedFormat;

    try {
      await fs.access(pdfPath);
    } catch {
      return {
        success: false,
        files: [],
        message: `PDF file not found: ${pdfPath}`,
      };
    }

    const gsPath = await findGhostscriptExecutable(isPackaged);
    if (!gsPath) {
      return {
        success: false,
        files: [],
        message:
          "Ghostscript executable not found. Bundled Ghostscript should be available in resources/ghostscript/bin/. This may indicate a packaging issue.",
      };
    }

    await fs.mkdir(outputDir, { recursive: true });

    const baseName = path.basename(pdfPath, path.extname(pdfPath));
    const outputPattern =
      format === "pdf"
        ? path.join(outputDir, `${baseName}-flattened.pdf`)
        : path.join(outputDir, `${baseName}-%d.${format}`);

    const deviceMap: Record<PdfOutputFormat, string> = {
      tiff: "tiffsep",
      png: "png16m",
      jpg: "jpeg",
      pdf: "pdfwrite",
    };
    const device = deviceMap[format];

    const gsArgs: string[] = [
      "-dNOPAUSE",
      "-dBATCH",
      "-dSAFER",
      "-sDEVICE=" + device,
      `-r${density}`,
      "-dUseCropBox",
      "-dPrinted=false",
      "-dPreserveAnnots=false",
      "-dMaxBitmap=500000000",
      "-dAlignToPixels=0",
      "-dGridFitTT=2",
      "-dAutoRotatePages=/None",
    ];

    if (format === "pdf") {
      gsArgs.push(
        "-dCompatibilityLevel=1.3",
        "-dPDFSETTINGS=/prepress",
        "-sColorConversionStrategy=LeaveColorUnchanged",
        "-dEmbedAllFonts=true",
        "-dSubsetFonts=true",
        "-dCompressFonts=true",
      );
    } else if (format === "tiff") {
      gsArgs.push(
        "-dNoSeparationFiles=true",
        "-dTextAlphaBits=4",
        "-dGraphicsAlphaBits=4",
      );
    } else {
      gsArgs.push("-dTextAlphaBits=4", "-dGraphicsAlphaBits=4");
    }

    if (width && height) {
      gsArgs.push(`-dDEVICEWIDTHPOINTS=${width}`);
      gsArgs.push(`-dDEVICEHEIGHTPOINTS=${height}`);
      gsArgs.push("-dFIXEDMEDIA");
    }

    if (pages !== "all") {
      if (typeof pages === "number") {
        gsArgs.push(`-dFirstPage=${pages}`);
        gsArgs.push(`-dLastPage=${pages}`);
      } else if (Array.isArray(pages) && pages.length > 0) {
        gsArgs.push(`-sPageList=${pages.join(",")}`);
      }
    }

    gsArgs.push(`-sOutputFile=${outputPattern}`);
    gsArgs.push(pdfPath);

    await execFileAsync(gsPath, gsArgs, {
      cwd: path.dirname(gsPath),
      windowsHide: true,
      env: process.env,
      timeout: 30 * 60 * 1000,
      maxBuffer: 200 * 1024 * 1024,
    });

    const files = await fs.readdir(outputDir);
    const generatedFiles =
      format === "pdf"
        ? files
          .filter((file) => file === `${baseName}-flattened.pdf`)
          .map((file) => path.join(outputDir, file))
        : files
          .filter((file) => isGeneratedRasterFile(file, baseName, format))
          .sort(compareGeneratedRasterFiles(baseName, format))
          .map((file) => path.join(outputDir, file));

    if (generatedFiles.length === 0) {
      return {
        success: false,
        files: [],
        message: "No files were generated. The PDF may be empty or corrupted.",
      };
    }

    return {
      success: true,
      files: generatedFiles,
      message:
        format === "pdf"
          ? "Successfully created flattened PDF"
          : `Successfully converted ${generatedFiles.length} page(s) to ${format.toUpperCase()}`,
    };
  } catch (error) {
    console.error("Error converting PDF:", error);

    let errorMessage = "Unknown error occurred";
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        errorMessage =
          "Ghostscript executable not found or cannot be executed. This may indicate a packaging issue with bundled resources.";
      } else if (
        error.message.includes("spawn") ||
        error.message.includes("EACCES")
      ) {
        errorMessage = `Cannot execute Ghostscript: ${error.message}. Check that the bundled binary has proper permissions.`;
      } else {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      files: [],
      message: errorMessage,
    };
  }
};

export const setupPdfHandlers = (isPackaged: boolean) => {
  secureHandle(
    "fileConversion:stageUploadedPdf",
    async (_event, fileBuffer: ArrayBuffer, fileName: string) => {
      try {
        if (!(fileBuffer instanceof ArrayBuffer)) {
          return { success: false, message: "Invalid file payload" };
        }
        const safeFileName = path.basename(fileName || "upload.pdf");
        if (!safeFileName.toLowerCase().endsWith(".pdf")) {
          return { success: false, message: "Only PDF files can be staged" };
        }

        const uploadDir = path.join(os.tmpdir(), TEMP_UPLOAD_DIR_NAME);
        await fs.mkdir(uploadDir, { recursive: true });
        const filePath = path.join(uploadDir, `${randomUUID()}-${safeFileName}`);
        await fs.writeFile(filePath, Buffer.from(fileBuffer));
        return {
          success: true,
          uploadId: registerStagedPdfUpload(filePath),
          fileName: safeFileName,
        };
      } catch (error) {
        return {
          success: false,
          message: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  secureHandle("fileConversion:pickOutputDirectory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  secureHandle("fileConversion:revealOutput", async (_event, filePath: string) => {
    if (!isRegisteredConversionOutput(filePath)) {
      return false;
    }
    const result = await shell.openPath(path.dirname(filePath));
    return result === "";
  });

  secureHandle("fileConversion:inspectPdf", async (_event, uploadId: string) => {
    const pdfPath = resolveStagedPdfUpload(uploadId);
    if (!pdfPath) {
      return {
        success: false,
        pageCount: 0,
        widthPoints: 0,
        heightPoints: 0,
        widthInches: 0,
        heightInches: 0,
        fileSizeBytes: 0,
      };
    }
    return getPdfInfo(pdfPath);
  });

  secureHandle(
    "fileConversion:convertPdf",
    async (
      _event,
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
    ) => {
      const pdfPath = resolveStagedPdfUpload(uploadId);
      if (!pdfPath) {
        return {
          success: false,
          files: [],
          message: "Unknown staged PDF upload.",
        };
      }
      const result = await convertPdfFile(pdfPath, outputDir, options, isPackaged);
      if (result.success) {
        result.files.forEach(registerConversionOutput);
        notifyConversion(
          "PDF conversion completed",
          result.files.length === 1
            ? `Saved ${path.basename(result.files[0])}.`
            : `Saved ${result.files.length} files.`,
        );
      } else {
        notifyConversion("PDF conversion failed", result.message ?? "Unknown error");
      }
      return result;
    },
  );

  // IPC Handler to get basic PDF info (page count, page size)
  secureHandle("pdf:getInfo", async (_event, pdfPath: string) => {
    return getPdfInfo(pdfPath);
  });

  // IPC Handler to check if Ghostscript is installed
  secureHandle("pdf:checkSystemRequirements", async () => {
    // Try PATH, Program Files, AND bundled resources
    const findExecutable = async (command: string): Promise<string | null> => {
      // 0) Prefer bundled copy if present
      const bundled = await resolveBundledExecutable(command, isPackaged);
      if (bundled) return bundled;

      if (process.platform === "win32") {
        // 1) Try PATH using 'where'
        try {
          const { stdout } = await execFileAsync("where", [command], {
            shell: true,
            timeout: 5000,
          });
          const paths = stdout
            .trim()
            .split(/\r?\n/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (paths[0]) return paths[0];
        } catch {
          // ignore
        }

        // 2) Try common install locations by product
        const resolved = await resolveWindowsToolPath(command);
        if (resolved) return resolved;

        return null;
      } else {
        // On Unix-like systems, use 'which'
        try {
          const { stdout } = await execFileAsync("which", [command], {
            timeout: 5000,
          });
          return stdout.trim() || null;
        } catch {
          return null;
        }
      }
    };

    const execAndReturn = async (
      command: string,
      args: string[],
    ): Promise<{ ok: boolean; stdout: string; }> => {
      try {
        const execPath = await findExecutable(command);
        if (!execPath) {
          console.log(
            `Command '${command}' not found in PATH or common locations`,
          );
          return { ok: false, stdout: "" };
        }
        console.log(`Found '${command}' at: ${execPath}`);

        const { stdout } = await execFileAsync(execPath, args, {
          cwd: path.dirname(execPath),
          timeout: 5000,
          windowsHide: true,
          env: process.env, // <- ensure augmented PATH is used
        });
        return { ok: true, stdout: stdout ?? "" };
      } catch (err) {
        console.log(
          `Command '${command} ${args.join(" ")}' failed:`,
          err instanceof Error ? err.message : String(err),
        );
        return { ok: false, stdout: "" };
      }
    };

    const checkCommand = async (
      command: string,
      args: string[],
    ): Promise<boolean> => {
      const { ok } = await execAndReturn(command, args);
      return ok;
    };

    // Check for Ghostscript (try multiple variations)
    const hasGS =
      (await checkCommand("gswin64c", ["--version"])) ||
      (await checkCommand("gswin32c", ["--version"])) ||
      (await checkCommand("gs", ["--version"]));
    console.log("Ghostscript installed:", hasGS);

    return {
      hasGhostscript: hasGS,
      isReady: hasGS,
      message: hasGS
        ? "Ghostscript detected (bundled)."
        : "PDF conversion requires Ghostscript. Bundled Ghostscript not found. This should not happen in production builds.\n\nFor development, ensure resources/ghostscript/ contains the binaries.",
    };
  });

  // IPC Handler for PDF to TIFF/PNG/JPG conversion using Ghostscript
  secureHandle(
    "pdf:convertToTiff",
    async (
      _event,
      pdfPath: string,
      outputDir: string,
      options?: PdfConversionOptions,
    ) => convertPdfFile(pdfPath, outputDir, options, isPackaged),
  );
};
