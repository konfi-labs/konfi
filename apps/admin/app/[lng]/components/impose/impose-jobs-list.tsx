"use client";

import { useT } from "@/i18n/client";
import { storage } from "@/lib/firebase/clientApp";
import {
  createActiveImpositionJob,
  createFailedImpositionJob,
  createStoredImpositionJob,
  normalizeStoredImpositionJobs,
  sortImpositionJobsByCreatedAt,
  type ActiveImpositionJob,
  type FailedImpositionJob,
  type ImpositionJob,
  type StoredImpositionJob,
} from "@/lib/imposition/local-jobs";
import type { CreateImpositionResponse } from "@/lib/imposition/types";
import {
  Badge,
  Box,
  Button,
  HStack,
  IconButton,
  Progress,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { useCallback, useEffect, useState } from "react";

const IMPOSE_JOBS_STORAGE_KEY = "__imposition_completed_jobs__";
const IMPOSE_JOBS_CHANGED_EVENT = "impose-jobs-changed";
const volatileJobsById = new Map<
  string,
  ActiveImpositionJob | FailedImpositionJob
>();

type ActiveJobUpdate = {
  currentFileIndex?: number;
  currentFileName?: string;
  progressPercent?: number | null;
  status?: ActiveImpositionJob["status"];
};

function dispatchJobsChangedEvent(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent(IMPOSE_JOBS_CHANGED_EVENT));
  } catch {
    // Ignore storage event dispatch issues.
  }
}

function loadStoredImpositionJobs(): StoredImpositionJob[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(IMPOSE_JOBS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    return normalizeStoredImpositionJobs(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function saveStoredImpositionJobs(jobs: StoredImpositionJob[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const normalizedJobs = normalizeStoredImpositionJobs(jobs);
    localStorage.setItem(
      IMPOSE_JOBS_STORAGE_KEY,
      JSON.stringify(normalizedJobs),
    );
  } catch {
    return;
  }

  dispatchJobsChangedEvent();
}

function removeStoredImpositionJob(storagePath: string): StoredImpositionJob[] {
  const nextJobs = loadStoredImpositionJobs().filter(
    (job) => job.storagePath !== storagePath,
  );

  saveStoredImpositionJobs(nextJobs);

  return nextJobs;
}

function downloadStoredImpositionJob(job: StoredImpositionJob): void {
  const anchor = document.createElement("a");

  anchor.href = job.downloadUrl;
  anchor.setAttribute("download", job.filename);
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function isStorageObjectNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "storage/object-not-found"
  );
}

function normalizeProgressPercent(
  value: number | null | undefined,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}

function getVisibleJobs(): ImpositionJob[] {
  return sortImpositionJobsByCreatedAt([
    ...volatileJobsById.values(),
    ...loadStoredImpositionJobs(),
  ]);
}

function removeVolatileImpositionJob(jobId: string): void {
  volatileJobsById.delete(jobId);
  dispatchJobsChangedEvent();
}

function getStatusColorPalette(job: ImpositionJob): string {
  switch (job.status) {
    case "completed":
      return "success";
    case "failed":
      return "red";
    case "preparing":
      return "orange";
    case "finalizing":
      return "purple";
    case "processing":
    case "uploading":
    default:
      return "blue";
  }
}

function getStatusLabel(
  job: ImpositionJob,
  t: ReturnType<typeof useT>["t"],
): string {
  switch (job.status) {
    case "completed":
      return t("impose.status.done", { defaultValue: "done" });
    case "failed":
      return t("impose.status.error", { defaultValue: "error" });
    case "uploading":
      return t("impose.status.uploading", { defaultValue: "uploading" });
    case "preparing":
      return t("impose.status.preparing", { defaultValue: "preparing" });
    case "finalizing":
      return t("impose.status.finalizing", { defaultValue: "saving" });
    case "processing":
    default:
      return t("impose.status.processing", { defaultValue: "processing" });
  }
}

function getProgressLabel(
  job: ImpositionJob,
  t: ReturnType<typeof useT>["t"],
): string | undefined {
  switch (job.status) {
    case "uploading":
      return t("impose.progress.uploadingFiles", {
        defaultValue: "Uploading {{count}} files...",
        count: job.totalFiles,
      });
    case "preparing":
      return t("impose.progress.preparing", {
        defaultValue: "Preparing files...",
      });
    case "processing":
      return t("impose.progress.processingFiles", {
        defaultValue: "Processing file {{current}} of {{total}}",
        current: job.currentFileIndex ?? Math.min(job.totalFiles, 1),
        total: job.totalFiles,
      });
    case "finalizing":
      return t("impose.progress.savingResult", {
        defaultValue: "Saving result...",
      });
    default:
      return undefined;
  }
}

export function startImpositionJob(params: {
  filename: string;
  totalFiles: number;
}): ActiveImpositionJob {
  const job = createActiveImpositionJob(params);

  volatileJobsById.set(job.id, job);
  dispatchJobsChangedEvent();

  return job;
}

export function updateImpositionJobProgress(
  jobId: string,
  update: ActiveJobUpdate,
): void {
  const current = volatileJobsById.get(jobId);

  if (!current || current.status === "failed") {
    return;
  }

  const nextJob: ActiveImpositionJob = {
    ...current,
    currentFileIndex: update.currentFileIndex,
    currentFileName: update.currentFileName?.trim() || undefined,
    progressPercent: normalizeProgressPercent(update.progressPercent),
    status: update.status ?? current.status,
  };

  const hasChanged =
    nextJob.status !== current.status ||
    nextJob.progressPercent !== current.progressPercent ||
    nextJob.currentFileIndex !== current.currentFileIndex ||
    nextJob.currentFileName !== current.currentFileName;

  if (!hasChanged) {
    return;
  }

  volatileJobsById.set(jobId, nextJob);
  dispatchJobsChangedEvent();
}

export function completeImpositionJob(
  jobId: string,
  response: CreateImpositionResponse,
): void {
  const current = volatileJobsById.get(jobId);

  volatileJobsById.delete(jobId);

  const nextJobs = normalizeStoredImpositionJobs([
    createStoredImpositionJob(response, {
      createdAt: current?.createdAt,
      id: current?.id,
      totalFiles: current?.totalFiles,
    }),
    ...loadStoredImpositionJobs(),
  ]);

  saveStoredImpositionJobs(nextJobs);
}

export function failImpositionJob(jobId: string, errorMessage: string): void {
  const current = volatileJobsById.get(jobId);

  if (!current) {
    return;
  }

  volatileJobsById.set(jobId, createFailedImpositionJob(current, errorMessage));
  dispatchJobsChangedEvent();
}

export function ImposeJobsList() {
  const { t, i18n } = useT(["impose", "translation"]);
  const [jobs, setJobs] = useState<ImpositionJob[]>([]);

  const refreshJobs = useCallback(() => {
    setJobs(getVisibleJobs());
  }, []);

  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === IMPOSE_JOBS_STORAGE_KEY) {
        refreshJobs();
      }
    };

    const handleJobsChanged = () => {
      refreshJobs();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      IMPOSE_JOBS_CHANGED_EVENT,
      handleJobsChanged as EventListener,
    );

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        IMPOSE_JOBS_CHANGED_EVENT,
        handleJobsChanged as EventListener,
      );
    };
  }, [refreshJobs]);

  const handleDownload = useCallback(
    (job: StoredImpositionJob) => {
      try {
        downloadStoredImpositionJob(job);
      } catch (error) {
        console.error("Failed to download imposition artifact", error);
        toaster.error({
          title: t("error.download_failed", {
            defaultValue: "Download failed",
          }),
          description: t("error.try_again", {
            defaultValue: "Please try again",
          }),
        });
      }
    },
    [t],
  );

  const handleDelete = useCallback(
    async (job: ImpositionJob) => {
      if (job.status === "failed") {
        removeVolatileImpositionJob(job.id);
        setJobs(getVisibleJobs());
        return;
      }

      if (job.status !== "completed") {
        return;
      }

      const deleteJob = async () => {
        try {
          const { deleteObject, ref } = await import("firebase/storage");
          await deleteObject(ref(storage, job.storagePath));
        } catch (error) {
          if (!isStorageObjectNotFoundError(error)) {
            throw error;
          }
        }

        removeStoredImpositionJob(job.storagePath);
        setJobs(getVisibleJobs());
      };

      const deletePromise = deleteJob();

      toaster.promise(deletePromise, {
        loading: {
          title: t("common.deleting", { defaultValue: "Deleting" }),
          description: t("impose.deleting_job", {
            defaultValue: "Removing job and artifacts...",
          }),
        },
        success: {
          title: t("common.deleted", { defaultValue: "Deleted" }),
          description: t("impose.deleted_job", {
            defaultValue: "Job and artifacts removed",
          }),
        },
        error: {
          title: t("error.delete_failed", {
            defaultValue: "Delete failed",
          }),
          description: t("error.try_again", {
            defaultValue: "Please try again",
          }),
        },
      });

      try {
        await deletePromise;
      } catch (error) {
        console.error("Failed to delete imposition artifact", error);
      }
    },
    [t],
  );

  if (jobs.length === 0) {
    return null;
  }

  return (
    <VStack gap={2} mt={4} align="stretch">
      <Text fontSize="sm" color={{ base: "gray.600", _dark: "gray.400" }}>
        {t("impose.jobs", { defaultValue: "Jobs" })}
      </Text>
      <Box
        borderWidth="1px"
        borderRadius="3xl"
        p={3}
        bg={{ base: "white", _dark: "gray.900" }}
      >
        <VStack gap={2} align="stretch">
          {jobs.map((job) => {
            const createdAtLabel =
              job.createdAt > 0
                ? new Date(job.createdAt).toLocaleString(i18n.language)
                : undefined;

            return (
              <HStack key={job.id} justify="space-between" align="start">
                <HStack gap={3} align="start" minW={0} flex={1}>
                  <Badge
                    colorPalette={getStatusColorPalette(job)}
                    flexShrink={0}
                  >
                    {getStatusLabel(job, t)}
                  </Badge>
                  <VStack gap={1} align="start" minW={0} flex={1}>
                    <Text
                      fontSize="xs"
                      lineClamp={1}
                      color={{ base: "gray.700", _dark: "gray.300" }}
                    >
                      {job.filename}
                    </Text>
                    {job.status !== "completed" && job.status !== "failed" && (
                      <VStack gap={1} align="stretch" w="full">
                        {getProgressLabel(job, t) && (
                          <Text
                            fontSize="2xs"
                            color={{ base: "gray.600", _dark: "gray.400" }}
                          >
                            {getProgressLabel(job, t)}
                          </Text>
                        )}
                        {job.currentFileName && (
                          <Text
                            fontSize="2xs"
                            lineClamp={1}
                            color={{ base: "gray.600", _dark: "gray.400" }}
                          >
                            {job.currentFileName}
                          </Text>
                        )}
                        {typeof job.progressPercent === "number" ? (
                          <HStack gap={2} w="full">
                            <Progress.Root
                              value={job.progressPercent}
                              size="xs"
                              w="full"
                              colorPalette="primary"
                              borderRadius="full"
                            >
                              <Progress.Track borderRadius="full">
                                <Progress.Range />
                              </Progress.Track>
                            </Progress.Root>
                            <Text
                              fontSize="2xs"
                              flexShrink={0}
                              color={{ base: "gray.600", _dark: "gray.400" }}
                            >
                              {job.progressPercent}%
                            </Text>
                          </HStack>
                        ) : (
                          <HStack gap={2}>
                            <Spinner size="xs" color="fg.muted" />
                          </HStack>
                        )}
                      </VStack>
                    )}
                    {job.status === "failed" && (
                      <Text
                        fontSize="2xs"
                        lineClamp={2}
                        color={{ base: "red.600", _dark: "red.300" }}
                      >
                        {job.errorMessage}
                      </Text>
                    )}
                    {createdAtLabel && (
                      <Text
                        fontSize="2xs"
                        color={{ base: "gray.600", _dark: "gray.400" }}
                      >
                        {createdAtLabel}
                      </Text>
                    )}
                  </VStack>
                </HStack>
                <HStack flexShrink={0}>
                  {job.status === "completed" && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => handleDownload(job)}
                    >
                      <MaterialSymbol>download</MaterialSymbol>
                      {t("common.download", { defaultValue: "Download" })}
                    </Button>
                  )}
                  {job.status !== "uploading" &&
                    job.status !== "preparing" &&
                    job.status !== "processing" &&
                    job.status !== "finalizing" && (
                      <IconButton
                        aria-label={t("impose.deleteJobAria", {
                          defaultValue: "Delete job",
                        })}
                        size="xs"
                        colorPalette="red"
                        variant="outline"
                        onClick={() => handleDelete(job)}
                      >
                        <MaterialSymbol>delete</MaterialSymbol>
                      </IconButton>
                    )}
                </HStack>
              </HStack>
            );
          })}
        </VStack>
      </Box>
    </VStack>
  );
}
