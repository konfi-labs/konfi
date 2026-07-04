import { useT } from "@/i18n/client";
import { auth, firestore, storage } from "@/lib/firebase/clientApp";
import {
  assertSaasRuntimeModuleAction,
  assertSaasRuntimeQuotaAction,
  recordSaasRuntimeQuotaUsageAction,
} from "@/actions/saas-runtime-quotas";
import {
  IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE,
  IMPOSITION_UPLOAD_PREFIX,
  isCreateImpositionResponse,
  isImpositionProgressStreamEvent,
  type CreateImpositionRequest,
  type CreateImpositionResponse,
  type ImpositionProgressStreamEvent,
} from "@/lib/imposition/types";
import {
  formatImpositionWarning,
  isImpositionWarning,
} from "@/lib/imposition/warnings";
import { parseSpacingValues } from "@/lib/imposition/workspace";
import { resolveImpositionSourceSizing } from "@/lib/imposition/source-sizing";
import { VStack } from "@chakra-ui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import { toaster } from "@konfi/components";
import { create, db, getImpositionWorkflows, remove } from "@konfi/firebase";
import {
  getImpositionTotalFileSize,
  IMPOSITION_MAX_FILES,
  IMPOSITION_MAX_FILE_SIZE_BYTES,
  IMPOSITION_MAX_FILE_SIZE_MB,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES,
  IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
  backPageRotation,
  bindingEdge,
  bleedType,
  CreateImpositionWorkflow,
  duplexMode,
  layoutType,
  paperOrientation,
} from "@konfi/types";
import { getPaperDimensions, ImposeSchema } from "@konfi/utils";
import {
  buildImposeRequestPayload,
  resolveImposeSheetDimensions,
  resolveImposeItemDimensions,
} from "@/lib/imposition/impose-payload";
import { useChannels } from "context/channels";
import { isNull, sortBy } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import useSWR from "swr";
import { InferType } from "yup";
import {
  completeImpositionJob,
  failImpositionJob,
  ImposeJobsList,
  startImpositionJob,
  updateImpositionJobProgress,
} from "./impose-jobs-list";
import { ImposeWorkspace } from "./ImposeWorkspace";
import { uploadGeneratedImpositionArchive } from "./generated-archive-storage";
import { imposeFilesToArchive } from "@konfi/wasm/browser";

type Input = InferType<typeof ImposeSchema>;

async function fetchImpositionWorkflows() {
  try {
    return getImpositionWorkflows(firestore);
  } catch (error) {
    console.error(error);
  }
}

interface ImposeFormProps {
  initialTemplate?: CreateImpositionWorkflow;
  initialTemplateKey?: string;
}

const ImposeForm = ({
  initialTemplate,
  initialTemplateKey,
}: ImposeFormProps = {}) => {
  const { channel } = useChannels();
  const { t } = useT(["impose", "translation"]);
  const schemaYupResolver = yupResolver(ImposeSchema);
  const form = useForm({
    defaultValues: initialValuesImpose(),
    resolver: schemaYupResolver,
  });
  const { reset } = form;
  const loadedInitialTemplateKeyRef = useRef<string | null>(null);
  const watchSaveAsTemplate = form.watch("saveAsTemplate");
  const watchTemplateName = form.watch("templateName");
  const watchBleedType = form.watch("bleedType");
  const watchSourceSizing = form.watch("sourceSizing");
  const label = useMemo(() => {
    if (watchSaveAsTemplate && !isEmpty(watchTemplateName)) {
      return t("impose.createAndSaveTemplate", {
        defaultValue: "Create imposition and save template",
      });
    }

    return t("actions.createImposition", { defaultValue: "Create imposition" });
  }, [t, watchSaveAsTemplate, watchTemplateName]);
  const {
    data: templatesData,
    mutate,
    isLoading,
  } = useSWR("impositionWorkflows", fetchImpositionWorkflows);
  const sortedData = useMemo(
    () => sortBy(templatesData ?? [], ["name"]),
    [templatesData],
  );
  const templatesLoading = isLoading && templatesData === undefined;
  const [uploadGeneratedToStorage, setUploadGeneratedToStorage] =
    useState(false);

  useEffect(() => {
    if (!initialTemplate) return;

    const templateKey = initialTemplateKey ?? initialTemplate.id;
    if (loadedInitialTemplateKeyRef.current === templateKey) return;

    loadedInitialTemplateKeyRef.current = templateKey;
    reset(initialValuesImpose(initialTemplate));
  }, [initialTemplate, initialTemplateKey, reset]);

  // Keep numeric dimensions in sync when custom sizes are disabled to avoid NaN validation
  const watchCustomSheetSize = form.watch("customSheetSize");
  const watchSheetSizeName = form.watch("sheetSizeName");
  const watchSheetOrientation = form.watch("sheetOrientation");
  const watchCustomItemSize = form.watch("customItemSize");
  const watchItemSizeName = form.watch("itemSizeName");
  const watchItemOrientation = form.watch("itemOrientation");

  useEffect(() => {
    const resolvedSourceSizing = resolveImpositionSourceSizing({
      bleedType: watchBleedType,
      sourceSizing: watchSourceSizing,
    });

    if (watchSourceSizing !== resolvedSourceSizing) {
      form.setValue("sourceSizing", resolvedSourceSizing, {
        shouldDirty: false,
        shouldValidate: false,
      });
    }
  }, [form, watchBleedType, watchSourceSizing]);

  useEffect(() => {
    // When NOT using custom sheet size, ensure numeric fields are populated from selected paper size
    if (!watchCustomSheetSize && watchSheetSizeName && watchSheetOrientation) {
      try {
        const dims = getPaperDimensions(
          watchSheetSizeName,
          watchSheetOrientation as "PORTRAIT" | "LANDSCAPE",
        );
        if (dims?.width && dims?.height) {
          form.setValue("customSheetSizeWidth", Math.round(dims.width), {
            shouldValidate: false,
            shouldDirty: false,
          });
          form.setValue("customSheetSizeHeight", Math.round(dims.height), {
            shouldValidate: false,
            shouldDirty: false,
          });
        }
      } catch {
        // silent – schema will still validate
      }
    }
  }, [watchCustomSheetSize, watchSheetSizeName, watchSheetOrientation, form]);

  useEffect(() => {
    // When NOT using custom item size, ensure numeric fields are populated from selected paper size
    if (!watchCustomItemSize && watchItemSizeName && watchItemOrientation) {
      try {
        const dims = getPaperDimensions(
          watchItemSizeName,
          watchItemOrientation as "PORTRAIT" | "LANDSCAPE",
        );
        if (dims?.width && dims?.height) {
          form.setValue("customItemSizeWidth", Math.round(dims.width), {
            shouldValidate: false,
            shouldDirty: false,
          });
          form.setValue("customItemSizeHeight", Math.round(dims.height), {
            shouldValidate: false,
            shouldDirty: false,
          });
        }
      } catch {
        // silent – schema will still validate
      }
    }
  }, [watchCustomItemSize, watchItemSizeName, watchItemOrientation, form]);

  const removeTemplate = useCallback(
    async (id: string) => {
      try {
        const promise = remove(db.doc(firestore, `/impositionWorkflows`, id));
        toaster.promise(promise, {
          loading: {
            title: t("template.deleting", {
              defaultValue: "Deleting template",
            }),
            description: t("template.deleting_description", {
              defaultValue: "Deleting imposition template...",
            }),
          },
          success: {
            title: t("template.deleted", { defaultValue: "Template deleted" }),
            description: t("template.deleted_description", {
              defaultValue: "Successfully deleted imposition template",
            }),
          },
          error: {
            title: t("error.template_delete", {
              defaultValue: "Error deleting template",
            }),
            description: t("error.template_delete_description", {
              defaultValue: "Failed to delete imposition template",
            }),
          },
        });
        await promise;
        mutate();
      } catch (error) {
        console.error(error);
      }
    },
    [mutate, t],
  );

  // Reset the entire form to the template values in one typed call
  const loadTemplate = useCallback(
    (impositionWorkflow: CreateImpositionWorkflow) => {
      form.reset(initialValuesImpose(impositionWorkflow));
      toaster.success({
        title: t("template.applied", {
          defaultValue: "Template applied",
        }),
        description: t("template.appliedDescription", {
          defaultValue: '"{{name}}" has been loaded into the form.',
          name: impositionWorkflow.name,
        }),
      });
    },
    [form, t],
  );

  if (isNull(channel)) return null;

  return (
    <VStack w="100%" align="stretch" gap={4}>
      <ImposeWorkspace
        methods={form}
        templates={sortedData}
        isLoading={templatesLoading}
        submitLabel={label}
        isSubmitting={form.formState.isSubmitting}
        uploadGeneratedToStorage={uploadGeneratedToStorage}
        onUploadGeneratedToStorageChange={setUploadGeneratedToStorage}
        onLoadTemplate={loadTemplate}
        onRemoveTemplate={removeTemplate}
        onCreateImposition={async (values) => {
          await handleImpose(values, mutate, t, {
            uploadGeneratedToStorage,
          });
        }}
        onSaveTemplateOnly={async () => {
          await saveImpositionWorkflow(form.getValues(), mutate, t);
        }}
      />
      <ImposeJobsList />
    </VStack>
  );
};

export const initialValuesImpose = (
  impositionWorkflow?: CreateImpositionWorkflow,
) => {
  const resolvedBleedType =
    impositionWorkflow?.bleedType ?? bleedType.BLEED_INCLUDED;
  const values: Input = {
    customSheetSize: impositionWorkflow?.customSheetSize ?? false,
    automaticSheetOrientation:
      impositionWorkflow?.automaticSheetOrientation ?? true,
    sheetOrientation:
      impositionWorkflow?.sheetOrientation ?? paperOrientation.PORTRAIT,
    sheetSizeName: impositionWorkflow?.sheetSizeName,
    customItemSize: impositionWorkflow?.customItemSize ?? false,
    automaticItemOrientation:
      impositionWorkflow?.automaticItemOrientation ?? true,
    itemOrientation:
      impositionWorkflow?.itemOrientation ?? paperOrientation.PORTRAIT,
    itemSizeName: impositionWorkflow?.itemSizeName,
    automaticNumberOfHorizontalItems:
      impositionWorkflow?.automaticNumberOfHorizontalItems ?? true,
    automaticNumberOfVerticalItems:
      impositionWorkflow?.automaticNumberOfVerticalItems ?? true,
    automaticSpacingHorizontal:
      impositionWorkflow?.automaticSpacingHorizontal ?? true,
    spacingHorizontal: impositionWorkflow?.spacingHorizontal
      ? impositionWorkflow.spacingHorizontal.join(",")
      : "",
    automaticSpacingVertical:
      impositionWorkflow?.automaticSpacingVertical ?? true,
    spacingVertical: impositionWorkflow?.spacingVertical
      ? impositionWorkflow.spacingVertical.join(",")
      : "",
    bleed: impositionWorkflow?.bleed ?? 3,
    bleedType: resolvedBleedType,
    sourceSizing: resolveImpositionSourceSizing({
      bleedType: resolvedBleedType,
      sourceSizing: impositionWorkflow?.sourceSizing,
    }),
    cropMarks: impositionWorkflow?.cropMarks ?? true,
    layout: impositionWorkflow?.layout ?? layoutType.STEP_AND_REPEAT,
    pagesPerSignature: impositionWorkflow?.pagesPerSignature ?? 4,
    bindingEdge: impositionWorkflow?.bindingEdge ?? bindingEdge.LEFT,
    duplexMode: impositionWorkflow?.duplexMode ?? duplexMode.SIMPLEX,
    backPageRotation:
      impositionWorkflow?.backPageRotation ?? backPageRotation.ROTATION_0,
    frontBackAlignment: impositionWorkflow?.frontBackAlignment ?? false,
    mirrorBack: impositionWorkflow?.mirrorBack ?? false,
    files: [],
    saveAsTemplate: false,
  };

  if (
    impositionWorkflow?.customSheetSizeHeight &&
    impositionWorkflow?.customSheetSizeWidth
  ) {
    values.customSheetSizeHeight = impositionWorkflow.customSheetSizeHeight;
    values.customSheetSizeWidth = impositionWorkflow.customSheetSizeWidth;
  }
  // Even when not using custom sizes, if template provided calculated dimensions, prefill them
  if (
    !impositionWorkflow?.customSheetSize &&
    impositionWorkflow?.customSheetSizeWidth &&
    impositionWorkflow?.customSheetSizeHeight
  ) {
    values.customSheetSizeWidth = impositionWorkflow.customSheetSizeWidth;
    values.customSheetSizeHeight = impositionWorkflow.customSheetSizeHeight;
  }

  if (
    impositionWorkflow?.customItemSizeHeight &&
    impositionWorkflow?.customItemSizeWidth
  ) {
    values.customItemSizeHeight = impositionWorkflow.customItemSizeHeight;
    values.customItemSizeWidth = impositionWorkflow.customItemSizeWidth;
  }
  if (
    !impositionWorkflow?.customItemSize &&
    impositionWorkflow?.customItemSizeWidth &&
    impositionWorkflow?.customItemSizeHeight
  ) {
    values.customItemSizeWidth = impositionWorkflow.customItemSizeWidth;
    values.customItemSizeHeight = impositionWorkflow.customItemSizeHeight;
  }

  if (impositionWorkflow?.numItemsHorizontal) {
    values.numItemsHorizontal = impositionWorkflow.numItemsHorizontal;
  }

  if (impositionWorkflow?.numItemsVertical) {
    values.numItemsVertical = impositionWorkflow.numItemsVertical;
  }

  return values;
};

/**
 * Transform form data to the format expected by the API.
 * Delegates all dimension resolution and boolean normalization to the shared
 * impose-payload helper so that submit and preview stay in sync.
 */
const transformFormDataForAPI = (data: Input) => ({
  ...data,
  ...buildImposeRequestPayload(data),
});

async function getErrorMessageFromResponse(
  response: Response,
): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const payload = (await response.json()) as { error?: string };
      return payload.error?.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  const text = (await response.text()).trim();
  return text || undefined;
}

function sanitizeStorageFilename(filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safeFilename.length > 0 ? safeFilename : "upload.bin";
}

function createUploadId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function inferUploadContentType(file: File): string {
  const normalizedType = file.type.trim().toLowerCase();

  if (normalizedType === "image/jpg") {
    return "image/jpeg";
  }

  if (normalizedType) {
    return normalizedType;
  }

  const filename = file.name.toLowerCase();

  if (filename.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (filename.endsWith(".png")) {
    return "image/png";
  }

  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
    return "image/jpeg";
  }

  if (filename.endsWith(".tif") || filename.endsWith(".tiff")) {
    return "image/tiff";
  }

  if (filename.endsWith(".webp")) {
    return "image/webp";
  }

  return "application/octet-stream";
}

type UploadImpositionProgress = {
  progressPercent: number;
  totalFiles: number;
};

type UploadedImpositionSource = CreateImpositionRequest["uploads"][number];

async function uploadImpositionSource({
  dateSegment,
  emitProgress,
  file,
  index,
  transferredBytesByPath,
}: {
  dateSegment: string;
  emitProgress: () => void;
  file: File;
  index: number;
  transferredBytesByPath: Map<string, number>;
}): Promise<UploadedImpositionSource> {
  const { ref, uploadBytesResumable } = await import("firebase/storage");
  const accountId = auth.currentUser?.uid;

  if (!accountId) {
    throw new Error("Authenticated admin user is required.");
  }

  const filename = file.name?.trim() || `upload-${index + 1}`;
  const safeFilename = sanitizeStorageFilename(filename);
  const storagePath = `${IMPOSITION_UPLOAD_PREFIX}/accounts/${accountId}/${dateSegment}/${createUploadId()}-${safeFilename}`;
  const contentType = inferUploadContentType(file);

  transferredBytesByPath.set(storagePath, 0);

  await assertSaasRuntimeModuleAction({
    module: "imposition",
    operation: "admin.imposition.source-upload",
  });
  await assertSaasRuntimeQuotaAction({
    operation: "admin.imposition.source-upload",
    requested: file.size,
    resource: "storageBytes",
  });

  await new Promise<void>((resolve, reject) => {
    const uploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
      contentType,
      customMetadata: {
        accountId,
        originalFilename: filename,
      },
    });

    uploadTask.on(
      "state_changed",
      (snapshot) => {
        transferredBytesByPath.set(storagePath, snapshot.bytesTransferred);
        emitProgress();
      },
      (error) => {
        reject(error);
      },
      () => {
        transferredBytesByPath.set(storagePath, file.size);
        emitProgress();
        resolve();
      },
    );
  });
  await recordSaasRuntimeQuotaUsageAction({
    operation: "admin.imposition.source-upload",
    requested: file.size,
    resource: "storageBytes",
  });

  return {
    contentType,
    filename,
    size: file.size,
    storagePath,
  };
}

async function uploadImpositionSources(
  files: File[],
  onProgress?: (progress: UploadImpositionProgress) => void,
) {
  const dateSegment = new Date().toISOString().split("T")[0];
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const transferredBytesByPath = new Map<string, number>();

  const emitProgress = () => {
    const transferredBytes = Array.from(transferredBytesByPath.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const progressPercent =
      totalBytes > 0 ? Math.round((transferredBytes / totalBytes) * 100) : 100;

    onProgress?.({
      progressPercent,
      totalFiles: files.length,
    });
  };

  return await Promise.all(
    files.map((file, index) =>
      uploadImpositionSource({
        dateSegment,
        emitProgress,
        file,
        index,
        transferredBytesByPath,
      }),
    ),
  );
}

function isImpositionProgressStreamResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";

  return contentType.includes(IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE);
}

function parseImpositionProgressEventBlock(
  block: string,
): ImpositionProgressStreamEvent | undefined {
  const lines = block.split(/\r?\n/);
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return undefined;
  }

  const payload = JSON.parse(dataLines.join("\n")) as unknown;

  if (!isImpositionProgressStreamEvent(payload)) {
    throw new Error("Received an invalid imposition progress event.");
  }

  return payload;
}

async function readImpositionProgressStream(
  response: Response,
  onEvent: (event: ImpositionProgressStreamEvent) => void,
): Promise<CreateImpositionResponse> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Imposition progress stream is unavailable.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: CreateImpositionResponse | undefined;

  while (true) {
    const { done, value } = await reader.read();

    buffer += decoder.decode(value ?? new Uint8Array(), {
      stream: !done,
    });

    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      if (!block.trim()) {
        continue;
      }

      const event = parseImpositionProgressEventBlock(block);

      if (!event) {
        continue;
      }

      onEvent(event);

      if (event.type === "result") {
        finalResult = event.result;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    const event = parseImpositionProgressEventBlock(buffer.trim());

    if (event) {
      onEvent(event);

      if (event.type === "result") {
        finalResult = event.result;
      }

      if (event.type === "error") {
        throw new Error(event.error);
      }
    }
  }

  if (!finalResult) {
    throw new Error("Failed to create imposition.");
  }

  return finalResult;
}

async function cleanupUploadedSources(
  uploads: CreateImpositionRequest["uploads"],
): Promise<void> {
  if (uploads.length === 0) {
    return;
  }

  const { deleteObject, ref } = await import("firebase/storage");

  await Promise.allSettled(
    uploads.map(async (upload) => {
      try {
        await deleteObject(ref(storage, upload.storagePath));
      } catch (error) {
        console.warn("Failed to remove temporary impose upload", error);
      }
    }),
  );
}

async function parseCreateImpositionResponse(
  response: Response,
): Promise<CreateImpositionResponse | undefined> {
  try {
    const payload = (await response.json()) as unknown;
    return isCreateImpositionResponse(payload) ? payload : undefined;
  } catch {
    return undefined;
  }
}

function getImpositionSelectionError(
  files: readonly File[],
  t: TFunction,
): string | undefined {
  if (files.length > IMPOSITION_MAX_FILES) {
    return t("impose.errors.tooManyFiles", {
      defaultValue:
        "You can upload up to {{maxFiles}} files in a single imposition batch.",
      maxFiles: IMPOSITION_MAX_FILES,
    });
  }

  const oversizedFile = files.find(
    (file) => file.size > IMPOSITION_MAX_FILE_SIZE_BYTES,
  );

  if (oversizedFile) {
    return t("impose.errors.fileTooLarge", {
      defaultValue:
        "{{filename}} exceeds the {{maxFileSize}} MB per-file limit.",
      filename: oversizedFile.name,
      maxFileSize: IMPOSITION_MAX_FILE_SIZE_MB,
    });
  }

  const totalFileSize = getImpositionTotalFileSize(files);

  if (totalFileSize > IMPOSITION_MAX_TOTAL_FILE_SIZE_BYTES) {
    return t("impose.errors.totalBatchTooLarge", {
      defaultValue:
        "The selected files total {{selectedSize}} MB, but the batch limit is {{maxTotalSize}} MB.",
      maxTotalSize: IMPOSITION_MAX_TOTAL_FILE_SIZE_MB,
      selectedSize: Math.ceil(totalFileSize / (1024 * 1024)),
    });
  }

  return undefined;
}

function triggerArchiveDownload(downloadUrl: string, filename: string) {
  const anchor = document.createElement("a");

  anchor.href = downloadUrl;
  anchor.setAttribute("download", filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  if (downloadUrl.startsWith("blob:")) {
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 5_000);
  }
}

export const handleImpose = async (
  data: Input,
  mutate: () => void,
  t: TFunction,
  options?: {
    uploadGeneratedToStorage?: boolean;
  },
) => {
  let jobId: string | undefined;
  let uploads: CreateImpositionRequest["uploads"] = [];
  let shouldCleanupUploads = false;

  try {
    if (!data.files || data.files.length === 0) {
      toaster.error({
        title: t("error.impose_error", { defaultValue: "Imposition error" }),
        description: t("error.no_files_for_imposition", {
          defaultValue: "No files for imposition",
        }),
      });
      return;
    }

    const selectionError = getImpositionSelectionError(data.files, t);

    if (selectionError) {
      toaster.error({
        title: t("error.impose_error", { defaultValue: "Imposition error" }),
        description: selectionError,
      });
      return;
    }

    const job = startImpositionJob({
      filename: data.files[0]?.name?.trim() || "imposition",
      totalFiles: data.files.length,
    });

    jobId = job.id;

    const transformedData = transformFormDataForAPI(data);
    const { files, ...requestData } = transformedData;
    void files;
    const inputFiles = data.files;
    const shouldUploadGeneratedToStorage = Boolean(
      options?.uploadGeneratedToStorage,
    );

    const isAiBleed = data.bleedType === bleedType.DIFFERENTIAL_DIFFUSION;

    if (!isAiBleed) {
      updateImpositionJobProgress(job.id, {
        status: "preparing",
        progressPercent: null,
      });

      // Pass File objects directly — browser.js reads each file's bytes
      // lazily inside the processing loop so only one file's input is in
      // memory at a time, preventing the browser memory-pressure warning.
      const archive = await imposeFilesToArchive({
        request: requestData,
        files: inputFiles,
        onProgress: (progress) => {
          updateImpositionJobProgress(job.id, {
            status: "processing",
            progressPercent: Math.round(
              (progress.completedFiles / progress.totalFiles) * 100,
            ),
            currentFileIndex: progress.fileIndex,
            currentFileName: progress.filename,
          });
        },
      });

      let uploadedArchive:
        | {
            downloadUrl: string;
            storagePath: string;
          }
        | undefined;

      if (shouldUploadGeneratedToStorage) {
        const output = Uint8Array.from(archive.bytes);
        uploadedArchive = await uploadGeneratedImpositionArchive({
          bytes: output,
          contentType: archive.contentType,
          filename: archive.filename,
        });
      }

      const output = Uint8Array.from(archive.bytes);
      const ownedBuffer = new ArrayBuffer(output.byteLength);
      new Uint8Array(ownedBuffer).set(output);

      const blobUrl = URL.createObjectURL(
        new Blob([ownedBuffer], { type: archive.contentType }),
      );

      const warnings = archive.warnings.filter(isImpositionWarning);

      completeImpositionJob(job.id, {
        contentType: archive.contentType,
        downloadUrl: uploadedArchive?.downloadUrl ?? blobUrl,
        filename: archive.filename,
        storagePath: uploadedArchive?.storagePath ?? "",
        warnings,
      });

      triggerArchiveDownload(blobUrl, archive.filename);

      toaster.success({
        title: t("impose.ready", { defaultValue: "Imposition ready" }),
        description: shouldUploadGeneratedToStorage
          ? t("impose.downloadingAndUploaded", {
              defaultValue:
                "Downloading file and uploading generated archive to storage...",
            })
          : t("impose.downloading", {
              defaultValue: "Downloading file...",
            }),
      });

      if (warnings.length > 0) {
        const warningMessages = warnings.map((warning) =>
          formatImpositionWarning(warning, t),
        );

        toaster.warning({
          title: t("impose.warnings.title", {
            defaultValue: "Imposition warnings",
          }),
          description: warningMessages.join(" • "),
        });
      }

      if (data.saveAsTemplate && !isEmpty(data.templateName)) {
        await saveImpositionWorkflow(data, mutate, t);
      }

      return;
    }

    updateImpositionJobProgress(job.id, {
      status: "uploading",
      progressPercent: 0,
    });

    uploads = await uploadImpositionSources(
      inputFiles,
      ({ progressPercent }) => {
        updateImpositionJobProgress(job.id, {
          status: "uploading",
          progressPercent,
        });
      },
    );

    shouldCleanupUploads = true;

    const requestPayload: CreateImpositionRequest = {
      data: requestData,
      uploads,
    };

    updateImpositionJobProgress(job.id, {
      status: "preparing",
      progressPercent: null,
    });

    const submitResponse = await fetch("/api/impose", {
      method: "POST",
      headers: {
        accept: IMPOSITION_PROGRESS_STREAM_CONTENT_TYPE,
        "content-type": "application/json",
        "x-imposition-progress": "1",
      },
      body: JSON.stringify(requestPayload),
    });

    if (!submitResponse.ok) {
      const errorMessage = await getErrorMessageFromResponse(submitResponse);

      throw new Error(
        errorMessage ||
          t("error.failed_to_create_imposition", {
            defaultValue: "Failed to create imposition",
          }),
      );
    }

    shouldCleanupUploads = false;

    const responsePayload = isImpositionProgressStreamResponse(submitResponse)
      ? await readImpositionProgressStream(submitResponse, (event) => {
          if (event.type !== "progress") {
            return;
          }

          updateImpositionJobProgress(job.id, {
            status: event.status,
            progressPercent: event.progressPercent,
            currentFileIndex: event.currentFileIndex,
            currentFileName: event.currentFileName,
          });
        })
      : await parseCreateImpositionResponse(submitResponse);

    if (!responsePayload) {
      throw new Error(
        t("error.failed_to_create_imposition", {
          defaultValue: "Failed to create imposition",
        }),
      );
    }

    completeImpositionJob(job.id, responsePayload);

    triggerArchiveDownload(
      responsePayload.downloadUrl,
      responsePayload.filename,
    );

    toaster.success({
      title: t("impose.ready", { defaultValue: "Imposition ready" }),
      description: shouldUploadGeneratedToStorage
        ? t("impose.downloadingAndUploaded", {
            defaultValue:
              "Downloading file and uploading generated archive to storage...",
          })
        : t("impose.downloading", {
            defaultValue: "Downloading file...",
          }),
    });

    if (responsePayload.warnings.length > 0) {
      const warningMessages = responsePayload.warnings.map((warning) =>
        formatImpositionWarning(warning, t),
      );

      toaster.warning({
        title: t("impose.warnings.title", {
          defaultValue: "Imposition warnings",
        }),
        description: warningMessages.join(" • "),
      });
    }

    if (data.saveAsTemplate && !isEmpty(data.templateName)) {
      await saveImpositionWorkflow(data, mutate, t);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (jobId) {
      failImpositionJob(jobId, errorMessage);
    }

    console.error(error);
    toaster.error({
      title: t("error.somethingWrong", {
        defaultValue: "Something went wrong",
      }),
      description: t("error.code", {
        defaultValue: "Error code: {{error}}",
        error: errorMessage,
      }),
    });
  } finally {
    if (shouldCleanupUploads) {
      await cleanupUploadedSources(uploads);
    }
  }
};

async function saveImpositionWorkflow(
  data: Input,
  mutate: () => void,
  t: TFunction,
) {
  try {
    const sheetDims = resolveImposeSheetDimensions(data);
    const itemDims = resolveImposeItemDimensions(data);
    const sheetWidth = sheetDims.width;
    const sheetHeight = sheetDims.height;
    const itemWidth = itemDims.width;
    const itemHeight = itemDims.height;
    const sheetSizeName = data.customSheetSize
      ? ""
      : (data.sheetSizeName ?? "");
    const itemSizeName = data.customItemSize
      ? ""
      : (data.itemSizeName ?? "");

    const impositionWorkflow: CreateImpositionWorkflow = {
      id: "",
      name: data.templateName ?? "",
      customSheetSize: data.customSheetSize,
      automaticSheetOrientation: data.automaticSheetOrientation,
      sheetOrientation: data.sheetOrientation,
      customItemSize: data.customItemSize,
      automaticItemOrientation: data.automaticItemOrientation,
      itemOrientation: data.itemOrientation,
      automaticNumberOfHorizontalItems: data.automaticNumberOfHorizontalItems,
      numItemsHorizontal: data.automaticNumberOfHorizontalItems
        ? 0
        : data.numItemsHorizontal,
      automaticNumberOfVerticalItems: data.automaticNumberOfVerticalItems,
      numItemsVertical: data.automaticNumberOfVerticalItems
        ? 0
        : data.numItemsVertical,
      automaticSpacingHorizontal: data.automaticSpacingHorizontal,
      spacingHorizontal: data.automaticSpacingHorizontal
        ? []
        : parseSpacingValues(data.spacingHorizontal),
      automaticSpacingVertical: data.automaticSpacingVertical,
      spacingVertical: data.automaticSpacingVertical
        ? []
        : parseSpacingValues(data.spacingVertical),
      bleed: data.bleed,
      bleedType: data.bleedType,
      sourceSizing: resolveImpositionSourceSizing({
        bleedType: data.bleedType,
        sourceSizing: data.sourceSizing,
      }),
      cropMarks: data.cropMarks,
      layout: data.layout,
      pagesPerSignature: data.pagesPerSignature,
      bindingEdge: data.bindingEdge,
      duplexMode: data.duplexMode,
      backPageRotation: data.backPageRotation,
      frontBackAlignment: data.frontBackAlignment,
      mirrorBack: data.mirrorBack,
      customSheetSizeWidth: sheetWidth,
      customSheetSizeHeight: sheetHeight,
      customItemSizeWidth: itemWidth,
      customItemSizeHeight: itemHeight,
      sheetSizeName,
      itemSizeName,
    };

    await assertSaasRuntimeModuleAction({
      module: "imposition",
      operation: "admin.imposition.template.create",
    });

    const promise = create(
      firestore,
      impositionWorkflow,
      undefined,
      db.collection(firestore, "/impositionWorkflows"),
    );

    toaster.promise(promise, {
      loading: {
        title: t("template.saving", { defaultValue: "Saving template" }),
        description: t("template.saving_description", {
          defaultValue: "Saving imposition template...",
        }),
      },
      success: {
        title: t("template.saved", { defaultValue: "Template saved" }),
        description: t("template.saved_description", {
          defaultValue: "Successfully saved imposition template",
        }),
      },
      error: {
        title: t("error.general", { defaultValue: "Error" }),
        description: t("error.template_save", {
          defaultValue: "Failed to save imposition template",
        }),
      },
    });

    await promise;
    mutate();
  } catch (error) {
    console.error(error);
  }
}

export default ImposeForm;
