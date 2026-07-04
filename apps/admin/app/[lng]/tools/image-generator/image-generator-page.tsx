"use client";

import {
  getProjectWideImageGenerationBudgetUsage,
  type AiImageGenerationBudgetUsage,
} from "@/actions/generate-images";
import {
  getImageGenerationWorkflowStatus,
  startImageGenerationWorkflow,
} from "@/actions/generate-images-workflow";
import { generateVideos } from "@/actions/generate-videos";
import { useAuth } from "@/context/auth";
import { useTenantContext } from "@/context/tenant";
import { useTenantModuleAccess } from "@/hooks/useTenantModuleAccess";
import { useT } from "@/i18n/client";
import {
  arePaidGatewayImageModelsVisible,
  isPaidGatewayImageModel,
} from "@/lib/ai/gateway-image-models";
import { isSharedSaasTenantRuntime } from "@/lib/tenant-runtime";
import {
  getEffectiveReferenceMimeType,
  getMaxReferenceImagesForModel,
} from "@/lib/utils/reference-image";
import {
  AbsoluteCenter,
  Alert,
  Box,
  Button,
  Card,
  Circle,
  Dialog,
  Flex,
  Float,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Image,
  Input,
  Menu,
  Portal,
  ProgressCircle,
  Skeleton,
  Spinner,
  Switch,
  Text,
  Textarea,
  useBreakpointValue,
  VStack,
} from "@chakra-ui/react";
import {
  AlertDialog,
  CloseButton,
  CustomHeading,
  Empty,
  MaterialSymbol,
  toaster,
} from "@konfi/components";
import { MODELS } from "@konfi/firebase";
import {
  GEMINI_REFERENCE_IMAGE_MIME_TYPES,
  GeneratedImage,
  GPT_IMAGE_2_DEFAULT_QUALITY,
  GPT_IMAGE_2_DEFAULT_SIZE,
  getAspectRatioForGptImage2Size,
  getGptImage2AspectRatioLabel,
  getGptImage2PriceUsdCents,
  getGptImage2SizeForAspectRatio,
  IMAGE_MODEL_CAPABILITIES,
  ImageGenerationRequest,
  type ImageGenerationQuality,
  VIDEO_MODEL_CAPABILITIES,
  isGatewayImageModel,
  isGptImage2GenerationSize,
  isGptImage2PresetSize,
  parseGptImage2Size,
  type VideoGenerationRequest,
  type VideoModel,
} from "@konfi/types";
import { Timestamp } from "firebase/firestore";
import type { ListResult, StorageReference } from "firebase/storage";
import {
  DragEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { ReferenceImageLibraryDialog } from "./ReferenceImageLibraryDialog";

const _MODELS = [
  {
    value: MODELS.NANO_BANANA_2_LITE,
    label: "Google Nano Banana 2 Lite",
  },
  {
    value: MODELS.NANO_BANANA_2,
    label: "Google Nano Banana 2",
  },
  { value: MODELS.FLUX_2_KLEIN, label: "Flux 2 Klein" },
  { value: MODELS.GPT_IMAGE_2, label: "OpenAI GPT Image 2" },
  { value: MODELS.QUIVER_ARROW, label: "Quiver Arrow SVG" },
  { value: MODELS.VEO_31, label: "Veo 3.1" },
  { value: MODELS.VEO_31_FAST, label: "Veo 3.1 Fast" },
] as const;

type ModelOption = (typeof _MODELS)[number];
type ModelValue = ModelOption["value"];

/**
 * Static estimated generation time per image (in milliseconds) for each model.
 * These are based on publicly available benchmarks and real-world usage:
 * - Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite): ~8-14s per image
 * - Gemini 3.1 Flash Image (Nano Banana 2): ~10-18s per image
 * - Flux 2 Klein: ~12-18s per image
 * - Quiver Arrow: SVG generation, usually short single-image runs
 * - Video models (Veo 3.1 variants): typically ~10-20s per video
 */
const MODEL_ESTIMATED_TIME_PER_IMAGE_MS: Record<ModelValue, number> = {
  [MODELS.NANO_BANANA_2_LITE]: 10_000,
  [MODELS.NANO_BANANA_2]: 12_000,
  [MODELS.FLUX_2_KLEIN]: 15_000,
  [MODELS.GPT_IMAGE_2]: 15_000,
  [MODELS.QUIVER_ARROW]: 8_000,
  [MODELS.VEO_31]: 20_000,
  [MODELS.VEO_31_FAST]: 20_000,
};

const MODEL_SELECTOR_OPTIONS: ReadonlyArray<{
  value: ModelValue;
  label: string;
}> = _MODELS.map((model) => ({
  value: model.value,
  label: model.label,
}));

function isVideoModelValue(model: string): model is VideoModel {
  return model in VIDEO_MODEL_CAPABILITIES;
}

function isGatewayModelValue(model: string): boolean {
  return (
    !isVideoModelValue(model) &&
    isGatewayImageModel(model as ImageGenerationRequest["model"])
  );
}

const REFERENCE_IMAGE_ACCEPT = [
  ...GEMINI_REFERENCE_IMAGE_MIME_TYPES,
  ".heic",
  ".heif",
].join(",");
const MAX_REFERENCE_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const REFERENCE_IMAGE_ALLOWED_MIME_TYPES = new Set<string>(
  GEMINI_REFERENCE_IMAGE_MIME_TYPES,
);

const ASPECT_RATIOS_NATIVE = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "3:4", label: "Portrait (3:4)" },
  { value: "4:3", label: "Landscape (4:3)" },
  { value: "9:16", label: "Portrait (9:16)" },
  { value: "16:9", label: "Landscape (16:9)" },
] as const;

const ASPECT_RATIOS_AUTO = [{ value: "AUTO", label: "Auto" }] as const;

const ASPECT_RATIOS_HINT = [
  ...ASPECT_RATIOS_NATIVE,
  { value: "3:2", label: "Photo (3:2)" },
  { value: "2:3", label: "Photo Portrait (2:3)" },
  { value: "5:4", label: "Medium format (5:4)" },
  { value: "4:5", label: "Medium format portrait (4:5)" },
  { value: "21:9", label: "Ultra-wide (21:9)" },
] as const;

const GPT_IMAGE_2_ASPECT_RATIOS = [
  { value: "1:1", label: "Square (1:1)" },
  { value: "2:3", label: "Portrait (2:3)" },
  { value: "3:2", label: "Landscape (3:2)" },
] as const;

const IMAGE_SIZES_NATIVE = [
  { value: "AUTO", label: "Auto" },
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
] as const;

const IMAGE_SIZES_1K_ONLY = [
  { value: "AUTO", label: "Auto" },
  { value: "1K", label: "1K" },
] as const;

const GPT_IMAGE_2_IMAGE_SIZES = [
  { value: "1024x1024", label: "1024 × 1024" },
  { value: "1024x1536", label: "1024 × 1536" },
  { value: "1536x1024", label: "1536 × 1024" },
] as const;

const GPT_IMAGE_2_QUALITY_OPTIONS = [
  {
    value: "low",
    labelKey: "imageGenerator.qualityLow",
    defaultLabel: "Low",
  },
  {
    value: "medium",
    labelKey: "imageGenerator.qualityMedium",
    defaultLabel: "Medium",
  },
] as const satisfies ReadonlyArray<{
  value: ImageGenerationQuality;
  labelKey: string;
  defaultLabel: string;
}>;

const IMAGE_SIZES_HINT = IMAGE_SIZES_NATIVE;

type UiAspectRatio =
  | "AUTO"
  | NonNullable<ImageGenerationRequest["aspectRatio"]>;
type UiImageSize = "AUTO" | NonNullable<ImageGenerationRequest["size"]>;

type ExamplePromptPreset = {
  id: string;
  title: string;
  prompt: string;
  description: string;
  descriptionKey: string;
  model: ImageGenerationRequest["model"];
  aspectRatio: UiAspectRatio;
  imageSize: UiImageSize;
  /** Optional preview image URL for the example */
  image?: string;
};

type GenerationDurationSample = {
  imageCount: number;
  durationMs: number;
};

const DEFAULT_PER_IMAGE_MS = 30_000;
const ETA_SAFETY_FACTOR = 1.2;
const MAX_ETA_SAMPLES = 8;
const TARGET_GRID_ITEMS_WITH_PLACEHOLDERS = 30;

const POLL_BACKOFF_MIN_DELAY_MS = 500;
const POLL_BACKOFF_MAX_DELAY_MS = 3000;
const POLL_BACKOFF_FACTOR = 1.5;
const POLL_BACKOFF_JITTER_RATIO = 0.2;
// For long-running generations we can avoid spamming the status endpoint immediately.
// We'll delay the *first* poll to roughly half of the estimated remaining time (capped).
const POLL_INITIAL_DELAY_CAP_MS = POLL_BACKOFF_MAX_DELAY_MS;

/** Maximum time to wait for workflow completion before timeout (15 minutes). */
const WORKFLOW_POLL_TIMEOUT_MS = 15 * 60 * 1000;

/** Maximum age of persisted workflows before they're considered expired (20 minutes). */
const PERSISTED_WORKFLOW_MAX_AGE_MS = 20 * 60 * 1000;

/**
 * localStorage key for persisting active workflow runs.
 * This allows workflow recovery when navigating away and back.
 */
const ACTIVE_WORKFLOWS_STORAGE_KEY = "konfi:image-generator:active-workflows";

/**
 * Data structure for persisted workflow runs.
 */
interface PersistedWorkflowRun {
  runId: string;
  jobId: string;
  model: ImageGenerationRequest["model"];
  numberOfImages: number;
  aspectRatio: UiAspectRatio;
  imageSize: UiImageSize;
  imageQuality?: ImageGenerationQuality;
  prompt: string;
  startedAt: number; // timestamp ms
  estimateMs: number;
}

const PRESET_TILE_ASPECT_RATIOS = [
  1,
  4 / 3,
  3 / 4,
  6 / 5,
  5 / 6,
  1.25,
  0.9,
] as const;

type AspectRatioLike =
  | UiAspectRatio
  | ImageGenerationRequest["aspectRatio"]
  | undefined;

function getAspectRatioNumber(aspectRatio: AspectRatioLike): number {
  if (!aspectRatio || aspectRatio === "AUTO") return 1;
  const parts = aspectRatio.split(":");
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 1;
  }
  return w / h;
}

type ImageWithAspectRatioAndSize = Pick<GeneratedImage, "aspectRatio" | "size">;

function getImageAspectRatioLabel(
  image: ImageWithAspectRatioAndSize,
): AspectRatioLike {
  if (image.aspectRatio) {
    return image.aspectRatio;
  }

  if (image.size && isGptImage2GenerationSize(image.size)) {
    return getGptImage2AspectRatioLabel(image.size) as AspectRatioLike;
  }

  return undefined;
}

function getImageAspectRatioNumber(image: ImageWithAspectRatioAndSize): number {
  return getAspectRatioNumber(getImageAspectRatioLabel(image));
}

function isSvgGeneratedImage(
  image: Pick<GeneratedImage, "model" | "storagePath">,
) {
  return (
    image.model === MODELS.QUIVER_ARROW ||
    image.storagePath?.toLowerCase().endsWith(".svg") === true
  );
}

function getGeneratedDownloadExtension(image: GeneratedImage): string {
  if (isVideoModelValue(image.model)) return "mp4";
  if (isSvgGeneratedImage(image)) return "svg";
  const extension = image.storagePath?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  return extension?.toLowerCase() ?? "png";
}

type SvgImageSource = {
  url: string;
  aspectRatio: number | null;
};

function parsePositiveSvgNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSvgAspectRatioFromText(svgText: string): number | null {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.querySelector("svg");
  if (!svg) return null;

  const viewBoxParts = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map((part) => Number.parseFloat(part));

  if (viewBoxParts && viewBoxParts.length === 4) {
    const width = viewBoxParts[2];
    const height = viewBoxParts[3];
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0
    ) {
      return width / height;
    }
  }

  const width = parsePositiveSvgNumber(svg.getAttribute("width"));
  const height = parsePositiveSvgNumber(svg.getAttribute("height"));
  return width && height ? width / height : null;
}

function SvgGeneratedImagePreview({
  image,
  objectFit = "contain",
  mode = "fill",
}: {
  image: Pick<GeneratedImage, "prompt" | "url">;
  objectFit?: "contain" | "cover";
  mode?: "fill" | "intrinsic";
}) {
  const [source, setSource] = useState<SvgImageSource | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    setSource(null);
    setFailed(false);

    void fetch(image.url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch SVG: ${response.status}`);
        }
        return response.text();
      })
      .then((svgText) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(
          new Blob([svgText], { type: "image/svg+xml" }),
        );
        setSource({
          url: objectUrl,
          aspectRatio: getSvgAspectRatioFromText(svgText),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [image.url]);

  const imageElement = (
    <Image
      src={source?.url ?? image.url}
      alt={image.prompt}
      width="100%"
      height={mode === "fill" ? "100%" : source ? "100%" : "auto"}
      objectFit={objectFit}
      bg="white"
      display="block"
    />
  );

  if (failed) {
    return imageElement;
  }

  if (!source) {
    return (
      <Flex
        align="center"
        justify="center"
        width="100%"
        height={mode === "fill" ? "100%" : undefined}
        aspectRatio={mode === "intrinsic" ? 1 : undefined}
        bg="white"
      >
        <Spinner size="sm" color="gray.500" />
      </Flex>
    );
  }

  if (mode === "intrinsic") {
    return (
      <Box
        width="100%"
        aspectRatio={source.aspectRatio ?? 1}
        overflow="hidden"
        bg="white"
      >
        {imageElement}
      </Box>
    );
  }

  return imageElement;
}

function formatEtaSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;

  if (mins <= 0) return `${secs}s`;
  if (secs <= 0) return `${mins}m`;
  return `${mins}m ${secs}s`;
}

function hashStringToUint32(value: string): number {
  // FNV-1a 32-bit
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function formatUsdCents(usdCents: number): string {
  const safe = Math.max(0, usdCents);
  return `$${(safe / 100).toFixed(2)}`;
}

function formatUsdCentsPrecise(usdCents: number): string {
  const safe = Math.max(0, usdCents);
  const formatted = (safe / 100).toFixed(3).replace(/0+$/, "");
  return `$${formatted.replace(/\.$/, "")}`;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function getJitteredDelayMs(baseDelayMs: number): number {
  const jitter = clampNumber(POLL_BACKOFF_JITTER_RATIO, 0, 0.95);
  const factor = 1 - jitter + Math.random() * (2 * jitter);
  return Math.max(0, Math.round(baseDelayMs * factor));
}

function getExponentialBackoffDelayMs(attempt: number): number {
  const safeAttempt = Math.max(0, Math.floor(attempt));
  const baseDelay = Math.round(
    POLL_BACKOFF_MIN_DELAY_MS * POLL_BACKOFF_FACTOR ** safeAttempt,
  );
  return clampNumber(
    baseDelay,
    POLL_BACKOFF_MIN_DELAY_MS,
    POLL_BACKOFF_MAX_DELAY_MS,
  );
}

function hasFileDragData(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

function compareGeneratedImages(
  first: GeneratedImage,
  second: GeneratedImage,
): number {
  const timestampDiff =
    second.timestamp.toMillis() - first.timestamp.toMillis();
  if (timestampDiff !== 0) return timestampDiff;
  return first.model.localeCompare(second.model);
}

function mergeGeneratedImagesById(
  previous: GeneratedImage[],
  nextImages: GeneratedImage[],
): GeneratedImage[] {
  if (nextImages.length === 0) {
    return previous;
  }

  const previousIds = new Set(previous.map((image) => image.id));
  const uniqueNextImages = nextImages.filter(
    (image) => !previousIds.has(image.id),
  );

  if (uniqueNextImages.length === 0) {
    return previous;
  }

  return [...previous, ...uniqueNextImages].sort(compareGeneratedImages);
}

async function listStorageFilesRecursively(
  folderRef: StorageReference,
  listAll: (reference: StorageReference) => Promise<ListResult>,
): Promise<StorageReference[]> {
  const result = await listAll(folderRef);
  const childFiles = await Promise.all(
    result.prefixes.map((prefix) =>
      listStorageFilesRecursively(prefix, listAll),
    ),
  );

  return [...result.items, ...childFiles.flat()];
}

/**
 * Load persisted active workflows from localStorage.
 */
function loadPersistedWorkflows(): PersistedWorkflowRun[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(ACTIVE_WORKFLOWS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Filter out any expired workflows
    const now = Date.now();
    return parsed.filter(
      (w: PersistedWorkflowRun) =>
        w.runId &&
        w.jobId &&
        typeof w.startedAt === "number" &&
        now - w.startedAt < PERSISTED_WORKFLOW_MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

/**
 * Save active workflows to localStorage.
 */
function savePersistedWorkflows(workflows: PersistedWorkflowRun[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      ACTIVE_WORKFLOWS_STORAGE_KEY,
      JSON.stringify(workflows),
    );
  } catch {
    // Ignore storage errors
  }
}

/**
 * Add a workflow to persisted storage.
 */
function addPersistedWorkflow(workflow: PersistedWorkflowRun): void {
  const existing = loadPersistedWorkflows();
  const updated = existing.filter((w) => w.runId !== workflow.runId);
  updated.push(workflow);
  savePersistedWorkflows(updated);
}

/**
 * Remove a workflow from persisted storage.
 */
function removePersistedWorkflow(runId: string): void {
  const existing = loadPersistedWorkflows();
  savePersistedWorkflows(existing.filter((w) => w.runId !== runId));
}

export default function ImageGeneratorPage() {
  const { t } = useT(["imageGenerator", "translation"]);
  const {
    isAllowed: canUseImageGeneration,
    isChecking: isCheckingImageGenerationAccess,
  } = useTenantModuleAccess("aiImage", { denyFreePlan: true });

  if (isCheckingImageGenerationAccess) {
    return (
      <>
        <CustomHeading
          heading={t("tools.imageGenerator", {
            defaultValue: "Image Generator",
          })}
          mb={"8"}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Alert.Root status="info">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("imageGenerator.checkingPlanAccess", {
                defaultValue: "Checking plan access…",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("imageGenerator.checkingPlanAccessDescription", {
                defaultValue:
                  "We are verifying whether this workspace can use image generation.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      </>
    );
  }

  if (!canUseImageGeneration) {
    return (
      <>
        <CustomHeading
          heading={t("tools.imageGenerator", {
            defaultValue: "Image Generator",
          })}
          mb={"8"}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              {t("imageGenerator.planDisabledTitle", {
                defaultValue: "Image generation is not available on this plan",
              })}
            </Alert.Title>
            <Alert.Description>
              {t("imageGenerator.planDisabledDescription", {
                defaultValue:
                  "AI image generation is available from the Starter plan.",
              })}
            </Alert.Description>
          </Alert.Content>
        </Alert.Root>
      </>
    );
  }

  return <ImageGeneratorWorkspace />;
}

function ImageGeneratorWorkspace() {
  const { t, i18n } = useT(["imageGenerator", "translation"]);
  const { user } = useAuth();
  const tenantContext = useTenantContext();
  const adminAccountId = user?.uid ?? null;
  const isSharedSaasRuntime = isSharedSaasTenantRuntime(tenantContext);
  const hidePaidGatewayModels = !arePaidGatewayImageModelsVisible();
  const canUsePaidGatewayImageModels =
    !isSharedSaasRuntime && !hidePaidGatewayModels;
  const modelSelectorOptions = useMemo(
    () =>
      MODEL_SELECTOR_OPTIONS.filter((model) => {
        if (isSharedSaasRuntime && isGatewayModelValue(model.value)) {
          return false;
        }
        if (
          hidePaidGatewayModels &&
          !isVideoModelValue(model.value) &&
          isPaidGatewayImageModel(
            model.value as ImageGenerationRequest["model"],
          )
        ) {
          return false;
        }
        return true;
      }),
    [hidePaidGatewayModels, isSharedSaasRuntime],
  );
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [activeGenerations, setActiveGenerations] = useState(0);
  const isGenerating = activeGenerations > 0;
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [generationUi, setGenerationUi] = useState<{
    jobId: string;
    model: ImageGenerationRequest["model"];
    numberOfImages: number;
    aspectRatio: UiAspectRatio;
    imageSize: UiImageSize;
  } | null>(null);
  const [durationSamplesByModel, setDurationSamplesByModel] = useState<
    Partial<Record<ImageGenerationRequest["model"], GenerationDurationSample[]>>
  >({});
  const [buttonCooldown, setButtonCooldown] = useState(false);
  const [selectedModel, setSelectedModel] = useState<
    ImageGenerationRequest["model"]
  >(MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"]);
  const [numberOfImages, setNumberOfImages] = useState(1);
  const [videoDuration, setVideoDuration] = useState(5);
  const [videoAudio, setVideoAudio] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<UiAspectRatio>("1:1");
  const [imageSize, setImageSize] = useState<UiImageSize>("AUTO");
  const [imageQuality, setImageQuality] = useState<ImageGenerationQuality>(
    GPT_IMAGE_2_DEFAULT_QUALITY,
  );
  const [gptImage2CustomSizeInput, setGptImage2CustomSizeInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [referenceImages, setReferenceImages] = useState<string[]>([]);
  const [isUploadingReferenceImages, setIsUploadingReferenceImages] =
    useState(false);
  const [isPromptDropActive, setIsPromptDropActive] = useState(false);
  const [fileUploadResetKey, setFileUploadResetKey] = useState(0);
  const [previewImage, setPreviewImage] = useState<GeneratedImage | null>(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<string | null>(null);
  const [isDesktopApp, setIsDesktopApp] = useState(false);
  const [localSavePath, setLocalSavePath] = useState<string | null>(null);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [budgetUsage, setBudgetUsage] =
    useState<AiImageGenerationBudgetUsage | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const referenceFileInputId = useId();
  const negativePromptRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const previewMediaRef = useRef<HTMLElement | null>(null);
  const dragStateRef = useRef({ isDragging: false, offsetX: 0, offsetY: 0 });
  const positionRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const zoomRef = useRef(1);
  const promptDragCounterRef = useRef(0);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latestEtaJobIdRef = useRef<string | null>(null);
  const etaIntervalsRef = useRef<Set<NodeJS.Timeout>>(new Set());
  const activeJobIdsRef = useRef<Set<string>>(new Set());
  const recoveredWorkflowsRef = useRef(false);

  const getEstimateMsForRun = useCallback(
    (model: ImageGenerationRequest["model"], count: number): number => {
      // Use static model-based estimate as the baseline
      const staticPerImageMs =
        MODEL_ESTIMATED_TIME_PER_IMAGE_MS[model as ModelValue] ??
        DEFAULT_PER_IMAGE_MS;

      // If we have historical samples, use them to refine the estimate
      const samples = durationSamplesByModel[model] ?? [];
      const perImageSampleMs = samples
        .map((s) =>
          s.imageCount > 0 ? s.durationMs / s.imageCount : staticPerImageMs,
        )
        .filter((v) => Number.isFinite(v) && v > 0);

      // Blend static estimate with historical data if available
      const avgPerImageMs =
        perImageSampleMs.length > 0
          ? perImageSampleMs.reduce((sum, v) => sum + v, 0) /
            perImageSampleMs.length
          : staticPerImageMs;

      // Use the average of static and historical (or just static if no history)
      const blendedPerImageMs =
        perImageSampleMs.length > 0
          ? (staticPerImageMs + avgPerImageMs) / 2
          : staticPerImageMs;

      return Math.ceil(
        blendedPerImageMs * Math.max(1, count) * ETA_SAFETY_FACTOR,
      );
    },
    [durationSamplesByModel],
  );

  useEffect(() => {
    const etaIntervals = etaIntervalsRef.current;
    const activeJobIds = activeJobIdsRef.current;

    return () => {
      if (cooldownTimeoutRef.current) {
        clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }

      for (const interval of etaIntervals) {
        clearInterval(interval);
      }
      etaIntervals.clear();

      activeJobIds.clear();
    };
  }, []);

  useEffect(() => {
    if (activeGenerations <= 0) {
      setGenerationUi(null);
      setEtaSeconds(null);
      latestEtaJobIdRef.current = null;
    }
  }, [activeGenerations]);

  // Recover active workflows on mount (for when user navigates away and back)
  useEffect(() => {
    if (recoveredWorkflowsRef.current) return;
    recoveredWorkflowsRef.current = true;

    // Track active recovered workflows for UI promotion when primary completes
    const activeRecoveredWorkflows: PersistedWorkflowRun[] = [];

    const promoteNextWorkflowToUi = () => {
      // Find the most recent still-active workflow to show in UI
      let nextPrimary: PersistedWorkflowRun | undefined;
      for (const workflow of activeRecoveredWorkflows) {
        if (!activeJobIdsRef.current.has(workflow.jobId)) {
          continue;
        }

        if (!nextPrimary || workflow.startedAt > nextPrimary.startedAt) {
          nextPrimary = workflow;
        }
      }

      if (nextPrimary) {
        setGenerationUi({
          jobId: nextPrimary.jobId,
          model: nextPrimary.model,
          numberOfImages: nextPrimary.numberOfImages,
          aspectRatio: nextPrimary.aspectRatio,
          imageSize: nextPrimary.imageSize,
        });
        setEtaSeconds(Math.ceil(nextPrimary.estimateMs / 1000));
        latestEtaJobIdRef.current = nextPrimary.jobId;
      }
    };

    const recoverWorkflows = async () => {
      const persisted = loadPersistedWorkflows();
      if (persisted.length === 0) return;

      // Sort by startedAt descending so the most recent workflow is processed first
      const sortedPersisted = [...persisted].sort(
        (a, b) => b.startedAt - a.startedAt,
      );

      // Check each persisted workflow's status
      let isPrimaryUiSet = false;
      for (const workflow of sortedPersisted) {
        try {
          const status = await getImageGenerationWorkflowStatus(
            workflow.runId,
            workflow.jobId,
          );

          if (status.status === "pending" || status.status === "running") {
            // Workflow is still running - track it and resume polling
            setActiveGenerations((c) => c + 1);
            activeJobIdsRef.current.add(workflow.jobId);
            activeRecoveredWorkflows.push(workflow);

            // Only set UI for the most recent (first) active workflow
            if (!isPrimaryUiSet) {
              setGenerationUi({
                jobId: workflow.jobId,
                model: workflow.model,
                numberOfImages: workflow.numberOfImages,
                aspectRatio: workflow.aspectRatio,
                imageSize: workflow.imageSize,
              });
              setEtaSeconds(Math.ceil(workflow.estimateMs / 1000));
              latestEtaJobIdRef.current = workflow.jobId;
              isPrimaryUiSet = true;
            }

            // Resume polling in background
            void resumeWorkflowPolling(workflow);
          } else {
            // Workflow completed or failed - remove from persistence
            removePersistedWorkflow(workflow.runId);
          }
        } catch {
          // Error checking status - remove from persistence
          removePersistedWorkflow(workflow.runId);
        }
      }

      // Show toast if multiple workflows are being recovered
      if (activeRecoveredWorkflows.length > 1) {
        toaster.info({
          title: t("imageGenerator.recoveringWorkflows", {
            defaultValue: "Recovering generations",
          }),
          description: t("imageGenerator.recoveringWorkflowsDescription", {
            defaultValue:
              "{{count}} image generations are being recovered in the background.",
            count: activeRecoveredWorkflows.length,
          }),
        });
      }
    };

    const resumeWorkflowPolling = async (workflow: PersistedWorkflowRun) => {
      const pollStartedAt = Date.now();
      let pollAttempt = 0;

      try {
        for (;;) {
          const status = await getImageGenerationWorkflowStatus(
            workflow.runId,
            workflow.jobId,
          );

          if (status.status === "completed") {
            const newImages: GeneratedImage[] = status.result.images.map(
              (img: { id: string; storagePath: string; url: string }) => ({
                id: img.id,
                storagePath: img.storagePath,
                url: img.url,
                prompt: workflow.prompt,
                model: workflow.model,
                size:
                  workflow.imageSize === "AUTO"
                    ? undefined
                    : (workflow.imageSize as GeneratedImage["size"]),
                aspectRatio:
                  workflow.aspectRatio === "AUTO"
                    ? workflow.imageSize !== "AUTO" &&
                      isGptImage2GenerationSize(workflow.imageSize)
                      ? getAspectRatioForGptImage2Size(workflow.imageSize)
                      : undefined
                    : (workflow.aspectRatio as GeneratedImage["aspectRatio"]),
                quality: workflow.imageQuality,
                timestamp: Timestamp.now(),
              }),
            );

            setImages((prev) => {
              return mergeGeneratedImagesById(prev, newImages);
            });

            toaster.success({
              title: t("common.success"),
              description: t("imageGenerator.generated", {
                count: newImages.length,
              }),
            });
            break;
          }

          if (status.status === "failed") {
            toaster.error({
              title: t("common.error"),
              description: status.error || t("error.failedToGenerate"),
            });
            break;
          }

          if (Date.now() - pollStartedAt > WORKFLOW_POLL_TIMEOUT_MS) {
            toaster.error({
              title: t("common.error"),
              description: t("error.failedToGenerate"),
            });
            break;
          }

          pollAttempt += 1;
          const backoffDelayMs = getExponentialBackoffDelayMs(pollAttempt);
          await sleepMs(getJitteredDelayMs(backoffDelayMs));
        }
      } finally {
        activeJobIdsRef.current.delete(workflow.jobId);
        removePersistedWorkflow(workflow.runId);

        // If this was the primary UI workflow, promote the next one
        if (latestEtaJobIdRef.current === workflow.jobId) {
          latestEtaJobIdRef.current = null;
          setEtaSeconds(null);
          promoteNextWorkflowToUi();
        }

        setActiveGenerations((c) => Math.max(0, c - 1));
      }
    };

    void recoverWorkflows();
  }, [t]);

  // Apply transform with RAF for smooth rendering
  const applyTransform = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!previewMediaRef.current) return;

      const { x, y } = positionRef.current;
      const zoom = zoomRef.current;
      previewMediaRef.current.style.transform = `scale(${zoom}) translate(${x / zoom}px, ${y / zoom}px)`;
      rafRef.current = null;
    });
  }, []);

  // Update position using refs
  const updatePosition = useCallback(
    (x: number, y: number) => {
      positionRef.current = { x, y };
      applyTransform();
    },
    [applyTransform],
  );

  // Update zoom using refs with debounced state update for UI
  const updateZoom = useCallback(
    (newZoom: number) => {
      zoomRef.current = newZoom;
      applyTransform();

      // Debounce state update for UI (zoom percentage display)
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      debounceTimeoutRef.current = setTimeout(() => {
        setImageZoom(newZoom);
      }, 100);
    },
    [applyTransform],
  );

  const handleDownload = useCallback(
    async (image: GeneratedImage) => {
      try {
        // Fetch the image as a blob to ensure proper download
        const response = await fetch(image.url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const ext = getGeneratedDownloadExtension(image);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `generated-${image.id}.${ext}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up the blob URL
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        console.error("Error downloading image:", error);
        toaster.error({
          title: t("imageGenerator.downloadFailed"),
          description: t("imageGenerator.downloadFailedDescription"),
        });
      }
    },
    [t],
  );

  const handleDelete = useCallback((imageId: string) => {
    setImageToDelete(imageId);
    setShowDeleteDialog(true);
  }, []);

  const deleteReferenceImageFromStorage = useCallback(async (url: string) => {
    try {
      const { ref, deleteObject } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase/clientApp");
      // Extract the storage path from Firebase download URL
      // URL format: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?...
      const match = url.match(/\/o\/([^?]+)/);
      if (!match) return;
      const storagePath = decodeURIComponent(match[1]);
      await deleteObject(ref(storage, storagePath));
    } catch (error) {
      console.error("Failed to delete reference image from storage:", error);
    }
  }, []);

  const clearReferenceImages = useCallback(() => {
    const toDelete = [...referenceImages];
    setReferenceImages([]);
    // File inputs won't emit change events when re-selecting the same file unless
    // their value is cleared. Remounting the hidden input resets it.
    setFileUploadResetKey((k) => k + 1);
    // Delete from storage in the background
    for (const url of toDelete) {
      void deleteReferenceImageFromStorage(url);
    }
  }, [referenceImages, deleteReferenceImageFromStorage]);

  const removeReferenceImageAt = useCallback(
    (index: number) => {
      const url = referenceImages[index];
      setReferenceImages((prev) => prev.filter((_, i) => i !== index));
      setFileUploadResetKey((k) => k + 1);
      if (url) {
        void deleteReferenceImageFromStorage(url);
      }
    },
    [referenceImages, deleteReferenceImageFromStorage],
  );

  const uploadReferenceFiles = useCallback(
    async (files: File[]): Promise<string[]> => {
      if (!adminAccountId) {
        throw new Error(
          t("auth.loginRequired", {
            defaultValue: "You must be logged in to upload reference images.",
          }),
        );
      }

      const { ref, uploadBytes, getDownloadURL } =
        await import("firebase/storage");
      const { storage } = await import("@/lib/firebase/clientApp");

      const dateStr = new Date().toISOString().split("T")[0];

      const urls = await Promise.all(
        files.map(async (file) => {
          const effectiveMimeType = getEffectiveReferenceMimeType(file);
          if (
            !effectiveMimeType ||
            !REFERENCE_IMAGE_ALLOWED_MIME_TYPES.has(effectiveMimeType)
          ) {
            throw new Error(
              `Unsupported reference image type (${file.type || "unknown"}). Allowed: ${GEMINI_REFERENCE_IMAGE_MIME_TYPES.join(", ")}.`,
            );
          }

          const uuid =
            typeof globalThis.crypto !== "undefined" &&
            "randomUUID" in globalThis.crypto &&
            typeof globalThis.crypto.randomUUID === "function"
              ? globalThis.crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `ai/reference/accounts/${adminAccountId}/${dateStr}/${uuid}-${safeName}`;
          const storageRef = ref(storage, storagePath);

          await uploadBytes(storageRef, file, {
            contentType: effectiveMimeType,
          });

          return getDownloadURL(storageRef);
        }),
      );

      return urls;
    },
    [adminAccountId, t],
  );

  const handleEdit = useCallback(
    async (image: GeneratedImage) => {
      try {
        // Fetch the image and upload it as a reference image.
        // IMPORTANT: avoid base64 in client->server payloads (1MB Server Action limit).
        const response = await fetch(image.url);
        const blob = await response.blob();

        const file = new File([blob], `reference-${image.id}.png`, {
          type: blob.type || "image/png",
        });
        const [url] = await uploadReferenceFiles([file]);
        setReferenceImages(url ? [url] : []);
        setFileUploadResetKey((k) => k + 1);

        setSelectedModel(
          (canUsePaidGatewayImageModels
            ? MODELS.FLUX_2_KLEIN
            : MODELS.NANO_BANANA_2) as ImageGenerationRequest["model"],
        );

        // Optionally set the prompt to help user continue
        if (textareaRef.current) {
          textareaRef.current.value = image.prompt;
        }
        textareaRef.current?.focus();

        // Close preview if open
        if (previewImage) {
          setPreviewImage(null);
          // Reset zoom/pan immediately (matches resetImageView behavior)
          updateZoom(1);
          updatePosition(0, 0);
        }

        toaster.success({
          title: t("imageGenerator.imageSetForEditing"),
          description: t("imageGenerator.imageSetForEditingDescription"),
        });
      } catch (error) {
        console.error("Error loading image for editing:", error);
        toaster.error({
          title: t("common.error"),
          description: t("imageGenerator.failedToLoadImage"),
        });
      }
    },
    [
      canUsePaidGatewayImageModels,
      previewImage,
      t,
      updatePosition,
      updateZoom,
      uploadReferenceFiles,
    ],
  );

  // Get current model capabilities
  const isVideoMode = useMemo(
    () => isVideoModelValue(selectedModel),
    [selectedModel],
  );

  const videoCapabilities = useMemo(
    () =>
      isVideoMode
        ? VIDEO_MODEL_CAPABILITIES[selectedModel as VideoModel]
        : null,
    [isVideoMode, selectedModel],
  );
  const isGptImage2Selected =
    !isVideoMode && selectedModel === MODELS.GPT_IMAGE_2;
  const isNanoBanana2LiteSelected =
    !isVideoMode && selectedModel === MODELS.NANO_BANANA_2_LITE;

  const modelCapabilities = useMemo(
    () =>
      IMAGE_MODEL_CAPABILITIES[selectedModel] ?? {
        supportsAspectRatio: false,
        supportsSize: false,
        supportsQuality: false,
        supportsNegativePrompt: false,
        supportsMultipleImages: false,
        maxImages: 1,
        supportsImageInput: false,
        maxReferenceImages: 0,
        supportedLanguages: ["en"],
      },
    [selectedModel],
  );

  const maxReferenceImagesForSelectedModel = useMemo(
    () =>
      isVideoMode && videoCapabilities
        ? videoCapabilities.maxImageInputs
        : getMaxReferenceImagesForModel(selectedModel),
    [isVideoMode, videoCapabilities, selectedModel],
  );

  const canAttachReferenceImages = useMemo(
    () =>
      isVideoMode
        ? Boolean(videoCapabilities?.supportsImageInput)
        : modelCapabilities.supportsImageInput,
    [
      isVideoMode,
      modelCapabilities.supportsImageInput,
      videoCapabilities?.supportsImageInput,
    ],
  );

  const handleReferenceFilesSelected = useCallback(
    async (incomingFiles: File[]) => {
      if (incomingFiles.length === 0 || !canAttachReferenceImages) {
        return;
      }

      if (isUploadingReferenceImages) {
        toaster.warning({
          title: t("common.warning"),
          description: t("imageGenerator.waitForUploads", {
            defaultValue:
              "Please wait for the reference image upload to finish.",
          }),
        });
        return;
      }

      if (!adminAccountId) {
        toaster.warning({
          title: t("common.warning"),
          description: t("auth.loginRequired", {
            defaultValue: "You must be logged in to upload reference images.",
          }),
        });
        return;
      }

      const oversizedFiles = incomingFiles.filter(
        (file) => file.size > MAX_REFERENCE_IMAGE_FILE_SIZE_BYTES,
      );
      const sizeAllowedFiles = incomingFiles.filter(
        (file) => file.size <= MAX_REFERENCE_IMAGE_FILE_SIZE_BYTES,
      );

      if (oversizedFiles.length > 0) {
        toaster.warning({
          title: t("imageGenerator.fileTooLarge", {
            defaultValue: "File too large",
          }),
          description: t("imageGenerator.fileTooLargeDescription", {
            defaultValue: "Please select an image smaller than 5MB",
          }),
        });
      }

      const invalidFiles = sizeAllowedFiles.filter((file) => {
        const effectiveMimeType = getEffectiveReferenceMimeType(file);
        return (
          !effectiveMimeType ||
          !REFERENCE_IMAGE_ALLOWED_MIME_TYPES.has(effectiveMimeType)
        );
      });

      const allowedFiles = sizeAllowedFiles.filter((file) => {
        const effectiveMimeType = getEffectiveReferenceMimeType(file);
        return (
          Boolean(effectiveMimeType) &&
          REFERENCE_IMAGE_ALLOWED_MIME_TYPES.has(effectiveMimeType)
        );
      });

      if (invalidFiles.length > 0) {
        toaster.warning({
          title: t("common.warning"),
          description: t("imageGenerator.invalidReferenceImageType", {
            defaultValue: `Some files were skipped because of an unsupported type. Allowed: ${GEMINI_REFERENCE_IMAGE_MIME_TYPES.join(", ")}.`,
          }),
        });
      }

      const remaining = Math.max(
        0,
        maxReferenceImagesForSelectedModel - referenceImages.length,
      );

      if (remaining <= 0) {
        toaster.warning({
          title: t("common.warning"),
          description: t("imageGenerator.tooManyReferenceImages", {
            defaultValue:
              "You have reached the maximum number of reference images.",
          }),
        });
        return;
      }

      const toUpload = allowedFiles.slice(0, remaining);

      if (toUpload.length === 0) {
        toaster.warning({
          title: t("common.warning"),
          description: t("imageGenerator.invalidReferenceImageType", {
            defaultValue: `Unsupported file type. Allowed: ${GEMINI_REFERENCE_IMAGE_MIME_TYPES.join(", ")}.`,
          }),
        });
        return;
      }

      if (toUpload.length < allowedFiles.length) {
        toaster.warning({
          title: t("common.warning"),
          description: t("imageGenerator.someFilesSkipped", {
            defaultValue:
              "Some files were skipped because of the attachment limit.",
          }),
        });
      }

      setIsUploadingReferenceImages(true);
      try {
        const urls = await uploadReferenceFiles(toUpload);
        setReferenceImages((prev) =>
          [...prev, ...urls].slice(0, maxReferenceImagesForSelectedModel),
        );
      } catch (error) {
        console.error("Error uploading reference image:", error);
        toaster.error({
          title: t("common.error"),
          description:
            error instanceof Error
              ? error.message
              : t("imageGenerator.failedToUploadImage", {
                  defaultValue: "Failed to upload image",
                }),
        });
      } finally {
        setIsUploadingReferenceImages(false);
      }
    },
    [
      adminAccountId,
      canAttachReferenceImages,
      isUploadingReferenceImages,
      maxReferenceImagesForSelectedModel,
      referenceImages.length,
      t,
      uploadReferenceFiles,
    ],
  );

  // If switching from a model with a higher limit to a lower limit, trim existing attachments.
  useEffect(() => {
    const supportsImage = isVideoMode
      ? videoCapabilities?.supportsImageInput
      : modelCapabilities.supportsImageInput;
    if (!supportsImage) return;
    if (referenceImages.length <= maxReferenceImagesForSelectedModel) return;

    // Delete trimmed images from storage
    const trimmed = referenceImages.slice(maxReferenceImagesForSelectedModel);
    for (const url of trimmed) {
      void deleteReferenceImageFromStorage(url);
    }
    setReferenceImages((prev) =>
      prev.slice(0, maxReferenceImagesForSelectedModel),
    );
    setFileUploadResetKey((k) => k + 1);
    toaster.warning({
      title: t("common.warning"),
      description: t("imageGenerator.someFilesSkipped", {
        defaultValue:
          "Some files were skipped because of the attachment limit.",
      }),
    });
  }, [
    isVideoMode,
    videoCapabilities?.supportsImageInput,
    modelCapabilities.supportsImageInput,
    maxReferenceImagesForSelectedModel,
    referenceImages.length,
    deleteReferenceImageFromStorage,
    referenceImages,
    t,
  ]);

  const availableAspectRatios = useMemo(() => {
    if (videoCapabilities) {
      return videoCapabilities.supportedAspectRatios.map((r) => ({
        value: r,
        label: r,
      }));
    }
    if (isGptImage2Selected) {
      return [...ASPECT_RATIOS_AUTO, ...GPT_IMAGE_2_ASPECT_RATIOS];
    }
    if (isNanoBanana2LiteSelected) {
      return [...ASPECT_RATIOS_AUTO, ...ASPECT_RATIOS_HINT];
    }
    const base = modelCapabilities.supportsAspectRatio
      ? ASPECT_RATIOS_NATIVE
      : ASPECT_RATIOS_HINT;
    return [...ASPECT_RATIOS_AUTO, ...base];
  }, [
    isGptImage2Selected,
    isNanoBanana2LiteSelected,
    modelCapabilities.supportsAspectRatio,
    videoCapabilities,
  ]);

  const availableImageSizes = useMemo(() => {
    if (isGptImage2Selected) {
      return [...ASPECT_RATIOS_AUTO, ...GPT_IMAGE_2_IMAGE_SIZES];
    }
    if (isNanoBanana2LiteSelected) {
      return IMAGE_SIZES_1K_ONLY;
    }
    return modelCapabilities.supportsSize
      ? IMAGE_SIZES_NATIVE
      : IMAGE_SIZES_HINT;
  }, [
    isGptImage2Selected,
    isNanoBanana2LiteSelected,
    modelCapabilities.supportsSize,
  ]);

  const autoLabel = t("imageGenerator.auto", { defaultValue: "Auto" });

  const gptImage2DerivedAspectRatioLabel = useMemo(() => {
    if (imageSize === "AUTO" || !isGptImage2GenerationSize(imageSize)) {
      return undefined;
    }

    return getGptImage2AspectRatioLabel(imageSize);
  }, [imageSize]);

  const isGptImage2CustomSizeSelected = useMemo(() => {
    return (
      isGptImage2Selected &&
      imageSize !== "AUTO" &&
      isGptImage2GenerationSize(imageSize) &&
      !isGptImage2PresetSize(imageSize)
    );
  }, [imageSize, isGptImage2Selected]);

  const resolvedGptImage2PricingSize = useMemo(() => {
    if (!isGptImage2Selected) {
      return GPT_IMAGE_2_DEFAULT_SIZE;
    }

    if (
      imageSize !== "AUTO" &&
      isGptImage2GenerationSize(imageSize) &&
      isGptImage2PresetSize(imageSize)
    ) {
      return imageSize;
    }

    return getGptImage2SizeForAspectRatio(
      aspectRatio === "AUTO" ? undefined : aspectRatio,
    );
  }, [aspectRatio, imageSize, isGptImage2Selected]);

  const imageQualityLabels = useMemo(
    () => ({
      low: t("imageGenerator.qualityLow", { defaultValue: "Low" }),
      medium: t("imageGenerator.qualityMedium", {
        defaultValue: "Medium",
      }),
    }),
    [t],
  );

  const gptImage2QualityOptions = useMemo(
    () =>
      GPT_IMAGE_2_QUALITY_OPTIONS.map((option) => ({
        ...option,
        label: imageQualityLabels[option.value],
        price:
          resolvedGptImage2PricingSize &&
          isGptImage2PresetSize(resolvedGptImage2PricingSize)
            ? formatUsdCentsPrecise(
                getGptImage2PriceUsdCents({
                  size: resolvedGptImage2PricingSize,
                  quality: option.value,
                }),
              )
            : t("imageGenerator.priceVaries", {
                defaultValue: "Varies",
              }),
      })),
    [imageQualityLabels, resolvedGptImage2PricingSize, t],
  );

  const selectedImageSizeLabel = useMemo(() => {
    return (
      availableImageSizes.find((size) => size.value === imageSize)?.label ??
      (imageSize === "AUTO" ? autoLabel : imageSize)
    );
  }, [autoLabel, availableImageSizes, imageSize]);

  const selectedAspectRatioLabel = useMemo(() => {
    if (aspectRatio !== "AUTO") {
      return aspectRatio;
    }

    if (isGptImage2CustomSizeSelected && gptImage2DerivedAspectRatioLabel) {
      return gptImage2DerivedAspectRatioLabel;
    }

    return autoLabel;
  }, [
    aspectRatio,
    autoLabel,
    gptImage2DerivedAspectRatioLabel,
    isGptImage2CustomSizeSelected,
  ]);

  const selectedImageQualityLabel = useMemo(() => {
    return (
      gptImage2QualityOptions.find((option) => option.value === imageQuality)
        ?.label ?? imageQualityLabels.medium
    );
  }, [gptImage2QualityOptions, imageQuality, imageQualityLabels]);

  // If we switch to a model that supports native aspect ratios, ensure the current selection is supported.
  useEffect(() => {
    if (videoCapabilities) {
      // For video models, ensure aspect ratio is one of the supported values
      if (!videoCapabilities.supportedAspectRatios.includes(aspectRatio)) {
        setAspectRatio(
          (videoCapabilities.supportedAspectRatios[0] ??
            "16:9") as UiAspectRatio,
        );
      }
      // Reset duration to the model's default
      setVideoDuration(videoCapabilities.defaultDurationSeconds);
      // Reset audio to off when switching models
      setVideoAudio(false);
      return;
    }
    if (isGptImage2Selected) {
      const supportedValues = GPT_IMAGE_2_ASPECT_RATIOS.map(
        (ratio) => ratio.value,
      );
      if (
        aspectRatio !== "AUTO" &&
        !supportedValues.includes(
          aspectRatio as (typeof supportedValues)[number],
        )
      ) {
        setAspectRatio("AUTO");
      }
      return;
    }
    if (!modelCapabilities.supportsAspectRatio) return;
    if (aspectRatio === "AUTO") return;
    const nativeValues = ASPECT_RATIOS_NATIVE.map((r) => r.value);
    if (!nativeValues.includes(aspectRatio as (typeof nativeValues)[number])) {
      setAspectRatio("1:1");
    }
  }, [
    aspectRatio,
    imageSize,
    isGptImage2Selected,
    modelCapabilities.supportsAspectRatio,
    videoCapabilities,
  ]);

  // If we switch to a model that supports explicit size, ensure the current selection is supported.
  useEffect(() => {
    if (isVideoMode) return;
    if (isGptImage2Selected) {
      if (imageSize === "AUTO") {
        const nextSize = getGptImage2SizeForAspectRatio(
          aspectRatio === "AUTO" ? undefined : aspectRatio,
        );
        if (nextSize) {
          setImageSize(nextSize);
        }
        return;
      }

      if (!isGptImage2GenerationSize(imageSize)) {
        setImageSize("AUTO");
        return;
      }

      const nextAspectRatio = getAspectRatioForGptImage2Size(imageSize);
      const nextPresetSize = nextAspectRatio
        ? getGptImage2SizeForAspectRatio(nextAspectRatio)
        : undefined;

      if (nextPresetSize && nextPresetSize === imageSize) {
        if (aspectRatio !== nextAspectRatio) {
          setAspectRatio(nextAspectRatio as UiAspectRatio);
        }
        return;
      }

      if (aspectRatio !== "AUTO") {
        setAspectRatio("AUTO");
      }
      return;
    }
    if (imageSize !== "AUTO" && isGptImage2GenerationSize(imageSize)) {
      setImageSize("AUTO");
      return;
    }
    if (!modelCapabilities.supportsSize) return;
    const nativeValues = availableImageSizes.map((s) => s.value);
    if (!nativeValues.includes(imageSize as (typeof nativeValues)[number])) {
      setImageSize("AUTO");
    }
  }, [
    availableImageSizes,
    aspectRatio,
    imageSize,
    isGptImage2Selected,
    isVideoMode,
    modelCapabilities.supportsSize,
  ]);

  useEffect(() => {
    if (!isGptImage2Selected) {
      setGptImage2CustomSizeInput("");
      return;
    }

    if (isGptImage2CustomSizeSelected) {
      setGptImage2CustomSizeInput(imageSize);
      return;
    }

    setGptImage2CustomSizeInput("");
  }, [imageSize, isGptImage2CustomSizeSelected, isGptImage2Selected]);

  const applyGptImage2CustomSize = useCallback(
    (rawValue: string) => {
      const trimmed = rawValue.trim();

      if (!trimmed) {
        setImageSize("AUTO");
        setAspectRatio("AUTO");
        setGptImage2CustomSizeInput("");
        return;
      }

      const parsed = parseGptImage2Size(trimmed);
      if (!parsed) {
        toaster.error({
          title: t("imageGenerator.invalidCustomSizeTitle", {
            defaultValue: "Invalid custom size",
          }),
          description: t("imageGenerator.invalidCustomSizeDescription", {
            defaultValue:
              "Use WIDTHxHEIGHT, multiples of 16, max 3840 per edge, ratio up to 3:1, and total pixels within GPT Image 2 limits.",
          }),
        });
        setGptImage2CustomSizeInput(
          isGptImage2CustomSizeSelected && imageSize !== "AUTO"
            ? imageSize
            : "",
        );
        return;
      }

      setImageSize(parsed.size);
      setAspectRatio("AUTO");
      setGptImage2CustomSizeInput(parsed.size);
    },
    [imageSize, isGptImage2CustomSizeSelected, t],
  );

  const handleGptImage2CustomSizeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      applyGptImage2CustomSize(gptImage2CustomSizeInput);
    },
    [applyGptImage2CustomSize, gptImage2CustomSizeInput],
  );

  // If we switch to a model that doesn't support multiple images, clamp the current selection.
  // (Also clamps to a model's maxImages if it supports multiple images.)
  useEffect(() => {
    const maxImages = modelCapabilities.supportsMultipleImages
      ? modelCapabilities.maxImages
      : 1;
    setNumberOfImages((prev) => clampNumber(prev, 1, Math.max(1, maxImages)));
  }, [modelCapabilities.maxImages, modelCapabilities.supportsMultipleImages]);

  useEffect(() => {
    const selectedModelUnavailable =
      (isSharedSaasRuntime && isGatewayModelValue(selectedModel)) ||
      (hidePaidGatewayModels &&
        isPaidGatewayImageModel(
          selectedModel as ImageGenerationRequest["model"],
        ));

    if (!selectedModelUnavailable) {
      return;
    }

    setSelectedModel(MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"]);
    setAspectRatio("1:1");
    setImageSize("AUTO");
    setImageQuality(GPT_IMAGE_2_DEFAULT_QUALITY);
    setGptImage2CustomSizeInput("");
  }, [hidePaidGatewayModels, isSharedSaasRuntime, selectedModel]);

  const examplePromptPresets = useMemo<ExamplePromptPreset[]>(
    () => [
      {
        id: "upscale-4k",
        title: "Upscale to 4K",
        prompt: "Upscale to 4K",
        description:
          "Best for turning a low-res image into a clean, print-ready 4K version (no hallucinated details).",
        descriptionKey: "imageGenerator.examplePresets.upscale4k.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "AUTO",
        imageSize: "4K",
        image: "/assets/image-generator-examples/upscale-4k.webp",
      },
      {
        id: "restore-photo-4k",
        title: "Restore photo (4K)",
        prompt:
          "Faithfully restore this image with high fidelity to modern photograph quality, in full color, upscale to 4K",
        description:
          "Repair damage + upscale in one go while keeping people and details true to the original.",
        descriptionKey:
          "imageGenerator.examplePresets.restorePhoto4k.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "AUTO",
        imageSize: "4K",
        image: "/assets/image-generator-examples/restore-photo-4k.webp",
      },
      {
        id: "tshirt-halftone",
        title: "B/W halftone mask (2K)",
        prompt:
          "Using the provided image as the source, generate a black-and-white halftone mask (matte) of the main subject. Output a STRICT 1-bit image using only pure black (#000000) and pure white (#FFFFFF) pixels (no gray, no colors, no transparency). Background must be solid black; the subject must be solid white. Create a halftone dot fade on the OUTER EDGES of the subject so it dissolves into the black background using only black/white dots (a dithered/halftone transition; dots get smaller/sparser toward the outside). Keep interior areas solid white (no halftone inside the main subject unless it already exists in the source). Keep the subject silhouette and proportions faithful to the source, and keep any existing text shapes exactly the same (as part of the mask). Do NOT add new objects, logos, text, borders, or watermarks. Output at 2K resolution.",
        description:
          "Create a black/white 1-bit mask with a halftone edge fade at 2K.",
        descriptionKey:
          "imageGenerator.examplePresets.tshirtHalftone.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "AUTO",
        imageSize: "2K",
        image: "/assets/image-generator-examples/tshirt-halftone-2k.webp",
      },
      {
        id: "icons-3d-grid",
        title: "3D icon set (3×3)",
        prompt:
          "Create a 3×3 grid of 9 cohesive icons representing [a theme]. White background. Consistent lighting and perspective. Colorful tactile 3D style, soft shadows, high detail. Keep spacing even and align the grid. No text, no logos, no watermark.",
        description:
          "A crisp 9-pack of consistent 3D icons, great for UI kits and sticker sheets.",
        descriptionKey: "imageGenerator.examplePresets.icons3dGrid.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "1:1",
        imageSize: "1K",
        image: "/assets/image-generator-examples/icons-3d-grid.webp",
      },
      {
        id: "sticker-sheet-icons",
        title: "Sticker sheet icons (12)",
        prompt:
          "Create a sticker sheet layout of 12 small icon stickers representing [a theme]. Consistent style, thick outlines, flat colors, evenly spaced grid. Add white borders for die-cut. No text, no logos, no watermark. Keep each sticker separated with clear spacing.",
        description:
          "A clean 12-pack sticker sheet layout with consistent style and spacing.",
        descriptionKey:
          "imageGenerator.examplePresets.stickerSheetIcons.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "4:3",
        imageSize: "1K",
        image: "/assets/image-generator-examples/sticker-sheet-icons.webp",
      },
      {
        id: "risograph-icons",
        title: "Risograph icons (4)",
        prompt:
          "Create a collection of icons representing [a theme], they belong together as a single theme. Put them in a 2x2 grid (no lines). The background is pure white. Make the icons as risograph prints. No text. No color distortion. Vibrant and not faded. Stochastic stippling and sand-like noise pattern within color fills. Each icon has a thick black outline.",
        description:
          "A vibrant risograph-style 4-pack of icons in a clean grid.",
        descriptionKey:
          "imageGenerator.examplePresets.risographIcons.description",
        model: MODELS.NANO_BANANA_2 as ImageGenerationRequest["model"],
        aspectRatio: "1:1",
        imageSize: "1K",
        image: "/assets/image-generator-examples/risograph-icons.webp",
      },
    ],
    [],
  );

  // Visual-only randomized aspect ratios for example tiles.
  // Kept stable for the lifetime of this page to avoid masonry jitter.
  const presetTileAspectRatioSeed = useMemo(
    () => Math.floor(Math.random() * 0xffff_ffff),
    [],
  );

  const presetTileAspectRatiosById = useMemo<Record<string, number>>(() => {
    const mapping: Record<string, number> = {};
    for (const preset of examplePromptPresets) {
      const rng = mulberry32(
        hashStringToUint32(preset.id) ^ presetTileAspectRatioSeed,
      );
      const idx = Math.floor(rng() * PRESET_TILE_ASPECT_RATIOS.length);
      mapping[preset.id] = PRESET_TILE_ASPECT_RATIOS[idx] ?? 1;
    }
    return mapping;
  }, [examplePromptPresets, presetTileAspectRatioSeed]);

  const applyExamplePromptPreset = useCallback(
    (preset: ExamplePromptPreset) => {
      setSelectedModel(preset.model);
      setAspectRatio(preset.aspectRatio);
      setImageSize(preset.imageSize);

      if (textareaRef.current) {
        textareaRef.current.value = preset.prompt;
        textareaRef.current.focus();
      }
    },
    [],
  );

  // Check if user's language is supported
  const currentLanguage = i18n.resolvedLanguage || "en";
  const isLanguageSupported = useMemo(
    () => modelCapabilities.supportedLanguages.includes(currentLanguage),
    [modelCapabilities, currentLanguage],
  );

  const refreshBudgetUsage = useCallback(async () => {
    try {
      const nextUsage = await getProjectWideImageGenerationBudgetUsage();
      setBudgetUsage(nextUsage);
    } catch (error) {
      // Don't block generation UI if usage cannot be fetched.
      console.error("Failed to fetch AI image budget usage:", error);
      setBudgetUsage(null);
    }
  }, []);

  useEffect(() => {
    void refreshBudgetUsage();
  }, [refreshBudgetUsage]);

  const budgetProgress = useMemo(() => {
    if (!budgetUsage?.enabled) return null;
    if (
      typeof budgetUsage.monthlyLimitUsdCents !== "number" ||
      budgetUsage.monthlyLimitUsdCents <= 0
    )
      return null;

    const spentUsdCents =
      budgetUsage.usedUsdCents + budgetUsage.reservedUsdCents;
    const ratio = spentUsdCents / budgetUsage.monthlyLimitUsdCents;
    const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100);

    return {
      percent,
      spentUsdCents,
      limitUsdCents: budgetUsage.monthlyLimitUsdCents,
      usedUsdCents: budgetUsage.usedUsdCents,
      reservedUsdCents: budgetUsage.reservedUsdCents,
    };
  }, [budgetUsage]);

  const budgetProgressColorPalette = useMemo(() => {
    if (!budgetProgress) return "gray";
    if (budgetProgress.percent >= 95) return "red";
    if (budgetProgress.percent >= 80) return "orange";
    return "success";
  }, [budgetProgress]);

  const selectedModelLabel = useMemo(() => {
    return (
      modelSelectorOptions.find((m) => m.value === selectedModel)?.label ??
      _MODELS.find((m) => m.value === selectedModel)?.label ??
      String(selectedModel)
    );
  }, [modelSelectorOptions, selectedModel]);

  const orderedImages = useMemo(() => {
    // Images are usually already sorted in state, but keep a stable ordering here
    // (newest first) to avoid UI jitter.
    return [...images].sort((a, b) => {
      try {
        const timestampDiff = b.timestamp.toMillis() - a.timestamp.toMillis();
        if (timestampDiff !== 0) return timestampDiff;
        return a.model.localeCompare(b.model);
      } catch {
        return 0;
      }
    });
  }, [images]);

  const isGenerationUiActive = generationUi?.jobId
    ? activeJobIdsRef.current.has(generationUi.jobId)
    : false;

  const activeGenerationUi =
    generationUi && isGenerationUiActive ? generationUi : null;

  const generatingModelCapabilities = activeGenerationUi
    ? (IMAGE_MODEL_CAPABILITIES[activeGenerationUi.model] ?? modelCapabilities)
    : modelCapabilities;

  const showGenerationTile = isGenerating;
  const showMasonryGrid =
    orderedImages.length > 0 ||
    examplePromptPresets.length > 0 ||
    showGenerationTile;

  const masonryColumns =
    useBreakpointValue({ base: 1, sm: 2, md: 3, lg: 4, xl: 5, "2xl": 6 }) ?? 1;

  const renderImageCard = useCallback(
    (image: GeneratedImage) => {
      const modelLabel =
        _MODELS.find((m) => m.value === image.model)?.label || image.model;
      const imageAspectRatioLabel = getImageAspectRatioLabel(image);
      const timeStr =
        image.timestamp && image.timestamp.toDate
          ? image.timestamp.toDate().toLocaleString(currentLanguage, {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : t("imageGenerator.unknownTime");

      const metaParts: string[] = [];
      if (imageAspectRatioLabel) metaParts.push(imageAspectRatioLabel);
      if (image.size) metaParts.push(image.size);
      const metaText = metaParts.length > 0 ? metaParts.join(" • ") : undefined;

      const isVideo = isVideoModelValue(image.model);

      return (
        <Card.Root
          borderRadius="2xl"
          borderWidth="2px"
          borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
          bg={{ base: "white", _dark: "gray.950" }}
          overflow="hidden"
          position="relative"
          transition="border-color 0.16s ease"
          _hover={{
            "& .image-actions": { opacity: 1, transform: "translateY(0)" },
            "& .image-meta": { opacity: 1, transform: "translateY(0)" },
            borderColor: "primary.400",
          }}
          _focusWithin={{
            "& .image-actions": { opacity: 1, transform: "translateY(0)" },
            "& .image-meta": { opacity: 1, transform: "translateY(0)" },
            borderColor: "primary.500",
          }}
        >
          <Box
            as="button"
            aria-label={t("imageGenerator.openPreview", {
              defaultValue: "Open preview",
            })}
            onClick={() => setPreviewImage(image)}
            display="block"
            w="full"
            textAlign="start"
            cursor="pointer"
            _focusVisible={{ outline: "none" }}
          >
            {isVideo ? (
              <Box position="relative">
                <video
                  key={image.url}
                  src={image.url}
                  style={{
                    width: "100%",
                    height: "auto",
                    aspectRatio: String(getImageAspectRatioNumber(image)),
                    objectFit: "cover",
                    display: "block",
                  }}
                  muted
                  playsInline
                  preload="auto"
                  onMouseEnter={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                  }}
                />
              </Box>
            ) : isSvgGeneratedImage(image) ? (
              <SvgGeneratedImagePreview image={image} mode="intrinsic" />
            ) : (
              <Box
                width="100%"
                aspectRatio={getImageAspectRatioNumber(image)}
                overflow="hidden"
              >
                <Image
                  src={image.url}
                  alt={image.prompt}
                  width="100%"
                  height="100%"
                  objectFit="cover"
                />
              </Box>
            )}
          </Box>

          <Box
            className="image-actions"
            position="absolute"
            top={2}
            right={2}
            opacity={0}
            transition="opacity 0.15s, transform 0.15s"
            transform="translateY(-4px)"
          >
            <HStack gap={2}>
              {!isVideo && !isSvgGeneratedImage(image) && (
                <IconButton
                  aria-label={t("imageGenerator.editWithAI", {
                    defaultValue: "Edit with AI",
                  })}
                  size="sm"
                  variant="solid"
                  colorPalette="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleEdit(image);
                  }}
                >
                  <MaterialSymbol>edit</MaterialSymbol>
                </IconButton>
              )}
              <IconButton
                aria-label={t("imageGenerator.download", {
                  defaultValue: "Download",
                })}
                size="sm"
                variant="solid"
                colorPalette="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDownload(image);
                }}
              >
                <MaterialSymbol>download</MaterialSymbol>
              </IconButton>
              <IconButton
                aria-label={t("imageGenerator.delete", {
                  defaultValue: "Delete",
                })}
                size="sm"
                variant="solid"
                colorPalette="red"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(image.id);
                }}
              >
                <MaterialSymbol>delete</MaterialSymbol>
              </IconButton>
            </HStack>
          </Box>

          <Box
            className="image-meta"
            position="absolute"
            left={0}
            right={0}
            bottom={0}
            p={3}
            opacity={0}
            transition="opacity 0.15s, transform 0.15s"
            transform="translateY(4px)"
            bg={{ base: "blackAlpha.600", _dark: "blackAlpha.700" }}
            color="whiteAlpha.900"
            backdropFilter="blur(10px)"
          >
            <Text fontSize="xs" fontWeight="semibold" lineClamp={1}>
              {modelLabel}
            </Text>
            <Text fontSize="sm" lineClamp={1}>
              {image.prompt}
            </Text>
            <Text fontSize="xs" opacity={0.85} mt={1}>
              {metaText ? `${timeStr} • ${metaText}` : timeStr}
            </Text>
          </Box>
        </Card.Root>
      );
    },
    [currentLanguage, handleDelete, handleDownload, handleEdit, t],
  );

  const getPlaceholderAspectRatio = useCallback((idx: number): number => {
    // Stable, non-extreme variety. We intentionally avoid very tall/wide ratios (like 9:16 / 16:9)
    // so placeholders don't destabilize the masonry.
    const ratios = [1, 4 / 3, 3 / 4, 6 / 5, 5 / 6, 1, 1.25, 0.9] as const;
    return ratios[idx % ratios.length] ?? 1;
  }, []);

  const renderPlaceholderTile = useCallback(
    (aspectRatioValue: number) => (
      <Box
        borderRadius="2xl"
        overflow="hidden"
        aspectRatio={aspectRatioValue}
        bg={{ base: "blackAlpha.100", _dark: "whiteAlpha.100" }}
        borderWidth="1px"
        borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
      />
    ),
    [],
  );

  const renderGeneratingTile = useCallback(
    (aspectRatioValue: number) => (
      <Box
        borderRadius="2xl"
        overflow="hidden"
        aspectRatio={aspectRatioValue}
        bg={{ base: "white", _dark: "gray.950" }}
        borderWidth="1px"
        borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
        position="relative"
      >
        <Flex
          align="center"
          justify="center"
          direction="column"
          gap={3}
          position="absolute"
          inset={0}
          px={4}
          textAlign="center"
        >
          <Spinner size="lg" colorPalette="primary" />
          <Text fontSize="sm" fontWeight="semibold">
            {t("imageGenerator.generating")}
          </Text>
          {etaSeconds !== null && (
            <Text fontSize="xs" opacity={0.7}>
              {t("imageGenerator.estimatedGenerationTime", {
                time: formatEtaSeconds(etaSeconds),
                defaultValue: "est. {{time}}",
              })}
            </Text>
          )}
        </Flex>
      </Box>
    ),
    [etaSeconds, t],
  );

  type MasonryColumnItem =
    | {
        kind: "generating";
        key: string;
        aspectRatio: number;
      }
    | {
        kind: "image";
        key: string;
        image: GeneratedImage;
      }
    | {
        kind: "placeholder";
        key: string;
        aspectRatio: number;
        preset?: ExamplePromptPreset;
      };

  const masonryColumnItems = useMemo(() => {
    const columnCount = Math.max(1, masonryColumns);
    const columns: MasonryColumnItem[][] = Array.from(
      { length: columnCount },
      () => [],
    );
    const weights: number[] = Array.from({ length: columnCount }, () => 0);

    const getShortestColumnIndex = (): number => {
      let minIdx = 0;
      for (let i = 1; i < weights.length; i += 1) {
        if (weights[i] < weights[minIdx]) minIdx = i;
      }
      return minIdx;
    };

    const addWeight = (columnIndex: number, aspectRatioValue: number) => {
      const safeAspectRatio =
        Number.isFinite(aspectRatioValue) && aspectRatioValue > 0
          ? aspectRatioValue
          : 1;
      // Relative height for a fixed column width: height ~= 1 / aspectRatio.
      weights[columnIndex] += 1 / safeAspectRatio;
    };

    if (showGenerationTile) {
      const aspectRatioValue = activeGenerationUi
        ? getAspectRatioNumber(activeGenerationUi.aspectRatio)
        : 1;
      columns[0]?.push({
        kind: "generating",
        key: activeGenerationUi
          ? `generating-${activeGenerationUi.jobId}`
          : "generating",
        aspectRatio: aspectRatioValue,
      });
      addWeight(0, aspectRatioValue);
    }

    // Place images: first 'columnCount' images start each column so the top row is always real images.
    orderedImages.forEach((image, idx) => {
      const columnIndex =
        !showGenerationTile && idx < columnCount
          ? idx
          : getShortestColumnIndex();
      columns[columnIndex].push({
        kind: "image",
        key: `img-${image.id}-${idx}`,
        image,
      });
      addWeight(columnIndex, getImageAspectRatioNumber(image));
    });

    // Always add example preset tiles first (these should always be visible).
    examplePromptPresets.forEach((preset, i) => {
      const columnIndex = getShortestColumnIndex();
      const aspectRatioValue = presetTileAspectRatiosById[preset.id] ?? 1;

      columns[columnIndex].push({
        kind: "placeholder",
        key: `preset-${preset.id}`,
        aspectRatio: aspectRatioValue,
        preset,
      });
      addWeight(columnIndex, aspectRatioValue);
    });

    // Add additional empty placeholders to reach the target tile count (if needed).
    const currentTileCount = orderedImages.length + examplePromptPresets.length;
    const additionalPlaceholdersNeeded = Math.max(
      0,
      TARGET_GRID_ITEMS_WITH_PLACEHOLDERS - currentTileCount,
    );

    for (let i = 0; i < additionalPlaceholdersNeeded; i += 1) {
      const columnIndex = getShortestColumnIndex();
      const aspectRatioValue = getPlaceholderAspectRatio(i);

      columns[columnIndex].push({
        kind: "placeholder",
        key: `ph-${i}`,
        aspectRatio: aspectRatioValue,
        preset: undefined,
      });
      addWeight(columnIndex, aspectRatioValue);
    }

    return columns;
  }, [
    examplePromptPresets,
    getPlaceholderAspectRatio,
    masonryColumns,
    orderedImages,
    presetTileAspectRatiosById,
    activeGenerationUi,
    showGenerationTile,
  ]);

  const renderExamplePromptTile = useCallback(
    (preset: ExamplePromptPreset, aspectRatioValue: number) => {
      const modelLabel =
        _MODELS.find((m) => m.value === preset.model)?.label ?? preset.model;
      const aspectRatioLabel =
        preset.aspectRatio === "AUTO" ? "Auto" : preset.aspectRatio;
      const imageSizeLabel =
        preset.imageSize === "AUTO" ? "Auto" : preset.imageSize;

      return (
        <Box
          borderRadius="2xl"
          overflow="hidden"
          aspectRatio={aspectRatioValue}
          bg={{ base: "blackAlpha.50", _dark: "whiteAlpha.100" }}
          borderWidth="1px"
          borderColor={{ base: "blackAlpha.200", _dark: "whiteAlpha.200" }}
          position="relative"
        >
          {preset.image && (
            <Image
              src={preset.image}
              alt={preset.title}
              position="absolute"
              inset={0}
              objectFit="cover"
              w="full"
              h="full"
              zIndex={0}
            />
          )}
          <Button
            variant="ghost"
            w="full"
            h="full"
            borderRadius={0}
            p={4}
            textAlign="start"
            whiteSpace="normal"
            alignItems="stretch"
            justifyContent="space-between"
            position="relative"
            zIndex={1}
            aria-label={t("imageGenerator.applyExamplePrompt", {
              defaultValue: "Apply example prompt: {{title}}",
              title: preset.title,
            })}
            _hover={{
              bg: preset.image
                ? { base: "blackAlpha.600", _dark: "blackAlpha.700" }
                : { base: "blackAlpha.100", _dark: "whiteAlpha.200" },
            }}
            _focusVisible={{
              outline: "2px solid",
              outlineColor: "primary.500",
              outlineOffset: "2px",
            }}
            bg={
              preset.image
                ? { base: "blackAlpha.500", _dark: "blackAlpha.600" }
                : undefined
            }
            onClick={() => {
              applyExamplePromptPreset(preset);
            }}
          >
            <VStack gap={2} align="stretch" justify="space-between" h="full">
              <VStack gap={1} align="stretch">
                <Text
                  fontWeight="semibold"
                  lineClamp={2}
                  color={preset.image ? "white" : undefined}
                  textShadow={
                    preset.image ? "0 1px 2px rgba(0,0,0,0.5)" : undefined
                  }
                >
                  {preset.title}
                </Text>
                <Text
                  fontSize="sm"
                  opacity={0.8}
                  lineClamp={3}
                  color={preset.image ? "white" : undefined}
                  textShadow={
                    preset.image ? "0 1px 2px rgba(0,0,0,0.5)" : undefined
                  }
                >
                  {t(preset.descriptionKey, {
                    defaultValue: preset.description,
                  })}
                </Text>
              </VStack>
              <Text
                fontSize="xs"
                opacity={0.65}
                lineClamp={1}
                color={preset.image ? "white" : undefined}
                textShadow={
                  preset.image ? "0 1px 2px rgba(0,0,0,0.5)" : undefined
                }
              >
                {modelLabel} • {aspectRatioLabel} • {imageSizeLabel}
              </Text>
            </VStack>
          </Button>
        </Box>
      );
    },
    [applyExamplePromptPreset, t],
  );

  // Clear reference image when switching to a model that doesn't support it
  useEffect(() => {
    if (!canAttachReferenceImages && referenceImages.length > 0) {
      clearReferenceImages();
    }
  }, [canAttachReferenceImages, clearReferenceImages, referenceImages.length]);

  useEffect(() => {
    if (canAttachReferenceImages) {
      return;
    }

    promptDragCounterRef.current = 0;
    setIsPromptDropActive(false);
  }, [canAttachReferenceImages]);

  // Load images from Firebase Storage by date
  const loadImagesForDate = useCallback(
    async (date: Date) => {
      if (!adminAccountId) {
        return;
      }

      setIsLoading(true);
      try {
        const { ref, listAll, getDownloadURL, getMetadata } =
          await import("firebase/storage");
        const { storage } = await import("@/lib/firebase/clientApp");

        const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD format

        // Load from account-scoped image and video storage paths in parallel
        const foldersToScan = [
          `ai/generated/accounts/${adminAccountId}/${dateStr}`,
          `ai/generated-videos/accounts/${adminAccountId}/${dateStr}`,
        ];

        try {
          const allLoadedItems = await Promise.all(
            foldersToScan.map(async (folderPath) => {
              try {
                const folderRef = ref(storage, folderPath);
                const flatFiles = await listStorageFilesRecursively(
                  folderRef,
                  listAll,
                );

                return Promise.all(
                  flatFiles.map(async (item) => {
                    const url = await getDownloadURL(item);
                    const metadata = await getMetadata(item);

                    const pathParts = item.fullPath.split("/");
                    const dateSegmentIndex = pathParts.findIndex(
                      (part) => part === dateStr,
                    );
                    const modelName =
                      dateSegmentIndex >= 0
                        ? pathParts
                            .slice(dateSegmentIndex + 1, pathParts.length - 1)
                            .join("/")
                        : pathParts[pathParts.length - 2];
                    const fileName = item.name;

                    return {
                      id: fileName.replace(/\.[a-zA-Z0-9]+$/i, ""),
                      storagePath: item.fullPath,
                      url,
                      base64: "",
                      prompt:
                        metadata.customMetadata?.prompt || "Generated image",
                      model: (metadata.customMetadata?.model ||
                        modelName) as ImageGenerationRequest["model"],
                      aspectRatio: metadata.customMetadata?.aspectRatio as
                        | ImageGenerationRequest["aspectRatio"]
                        | undefined,
                      size: metadata.customMetadata?.size as
                        | ImageGenerationRequest["size"]
                        | undefined,
                      quality: metadata.customMetadata?.quality as
                        | ImageGenerationQuality
                        | undefined,
                      timestamp: Timestamp.fromDate(
                        new Date(metadata.timeCreated),
                      ),
                    } as GeneratedImage;
                  }),
                );
              } catch {
                // Folder may not exist yet — that's fine
                return [] as GeneratedImage[];
              }
            }),
          );

          const loadedImages = allLoadedItems.flat();

          if (loadedImages.length === 0) {
            setHasMore(false);
            return;
          }

          // Sort by timestamp (newest first) and then by model name
          const sortedImages = loadedImages.sort(compareGeneratedImages);

          setImages((prev) => {
            return mergeGeneratedImagesById(prev, sortedImages);
          });
        } catch {
          setHasMore(false);
        }
      } catch (error) {
        console.error("Error loading images:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [adminAccountId],
  );

  // Load more images (go back one day)
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;

    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    setCurrentDate(previousDate);
    await loadImagesForDate(previousDate);
  }, [currentDate, hasMore, isLoading, loadImagesForDate]);

  // Load initial images on mount (load last 3 days)
  useEffect(() => {
    if (!adminAccountId) return;

    const loadInitialImages = async () => {
      setImages([]);
      setHasMore(true);
      const today = new Date();
      for (let i = 0; i < 3; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        await loadImagesForDate(date);
      }
      // Set currentDate to 3 days back so infinite scroll continues from there
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      setCurrentDate(threeDaysAgo);
    };
    loadInitialImages();
  }, [adminAccountId, loadImagesForDate]);

  // Check if running in desktop app and load save path
  useEffect(() => {
    if (typeof window !== "undefined" && window.konfiDesktop?.aiImages) {
      setIsDesktopApp(true);
      window.konfiDesktop.aiImages
        .getSaveDirectory()
        .then(setLocalSavePath)
        .catch(console.error);
    }
  }, []);

  // Infinite scroll handler
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Load more when scrolled to bottom (with 100px threshold)
      if (
        scrollHeight - scrollTop - clientHeight < 100 &&
        !isLoading &&
        hasMore
      ) {
        void loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoading, loadMore]);

  async function handleGenerate() {
    const promptValue = textareaRef.current?.value || "";
    const negativePromptValue = negativePromptRef.current?.value || "";

    if (isUploadingReferenceImages) {
      toaster.warning({
        title: t("common.warning"),
        description: t("imageGenerator.waitForUploads", {
          defaultValue: "Please wait for the reference image upload to finish.",
        }),
      });
      return;
    }

    const jobId =
      typeof globalThis.crypto !== "undefined" &&
      "randomUUID" in globalThis.crypto &&
      typeof globalThis.crypto.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // Capture current UI/config for this run so changing controls mid-generation
    // doesn't affect the in-flight request.
    const modelForJob = selectedModel;
    const aspectRatioForJob = aspectRatio;
    const imageSizeForJob = imageSize;
    const imageQualityForJob = imageQuality;
    const modelCapabilitiesForJob = modelCapabilities;
    const referenceImagesForJob = referenceImages;
    const maxReferenceImagesForJob = getMaxReferenceImagesForModel(modelForJob);
    const videoDurationForJob = videoDuration;
    const isVideoModeForJob = isVideoModelValue(modelForJob);
    const supportsImageInputForJob = isVideoModeForJob
      ? Boolean(
          VIDEO_MODEL_CAPABILITIES[modelForJob as VideoModel]
            ?.supportsImageInput,
        )
      : modelCapabilitiesForJob.supportsImageInput;
    const hasReferenceImageForJob = referenceImagesForJob.length > 0;
    const trimmedPromptForJob = promptValue.trim();
    const effectivePromptForJob =
      trimmedPromptForJob ||
      (supportsImageInputForJob && hasReferenceImageForJob
        ? isVideoModeForJob
          ? t("imageGenerator.defaultVideoReferencePrompt", {
              defaultValue: "Animate this reference image naturally.",
            })
          : t("imageGenerator.defaultImageReferencePrompt", {
              defaultValue:
                "Edit this reference image while preserving key details.",
            })
        : "");

    if (!effectivePromptForJob) {
      toaster.error({
        title: t("common.error"),
        description: t("imageGenerator.enterPrompt"),
      });
      return;
    }

    // Defensive clamp: if the selected model doesn't support multiple images per run,
    // always request exactly 1 image (even if state is still > 1 from a previous model).
    const maxImagesForJob = modelCapabilitiesForJob.supportsMultipleImages
      ? modelCapabilitiesForJob.maxImages
      : 1;
    const numberOfImagesForJob = clampNumber(
      numberOfImages,
      1,
      Math.max(1, maxImagesForJob),
    );

    activeJobIdsRef.current.add(jobId);
    latestEtaJobIdRef.current = jobId;

    // Force synchronous state update to show UI feedback immediately
    flushSync(() => {
      setActiveGenerations((c) => c + 1);
      setButtonCooldown(true);
      setGenerationUi({
        jobId,
        model: modelForJob,
        numberOfImages: numberOfImagesForJob,
        aspectRatio: aspectRatioForJob,
        imageSize: imageSizeForJob,
      });
    });

    const generationStartedAtMs = Date.now();
    const estimateMs = getEstimateMsForRun(modelForJob, numberOfImagesForJob);
    // Set the static estimate once (shown as "est. Xm Ys")
    // We no longer countdown - just show the initial estimate and a spinner
    setEtaSeconds(Math.ceil(estimateMs / 1000));

    // Note: Previously we had a countdown interval here, but per the new UX
    // we show a static estimate upfront and a spinner during processing.
    // The estimate remains static throughout generation.

    // Reset cooldown after 2 seconds (from the last click)
    if (cooldownTimeoutRef.current) {
      clearTimeout(cooldownTimeoutRef.current);
    }
    cooldownTimeoutRef.current = setTimeout(() => {
      setButtonCooldown(false);
    }, 2000);

    let generatedImageCount = 0;
    let workflowRunId: string | null = null;
    let generationFailed = false;
    let generationFailure: unknown;

    await (async () => {
      // Even if a model doesn't support an explicit aspect-ratio parameter,
      // we still pass the selected ratio so the server can append it as a prompt hint.
      const finalAspectRatio:
        | ImageGenerationRequest["aspectRatio"]
        | undefined =
        aspectRatioForJob === "AUTO"
          ? undefined
          : (aspectRatioForJob as NonNullable<
              ImageGenerationRequest["aspectRatio"]
            >);
      // Even if a model doesn't support an explicit size parameter,
      // we still pass the selected size so the server can append it as a prompt hint.
      const finalImageSize: ImageGenerationRequest["size"] | undefined =
        imageSizeForJob === "AUTO"
          ? undefined
          : (imageSizeForJob as ImageGenerationRequest["size"]);
      const finalGeneratedAspectRatio =
        finalAspectRatio ??
        (finalImageSize && isGptImage2GenerationSize(finalImageSize)
          ? getAspectRatioForGptImage2Size(finalImageSize)
          : undefined);

      // ── Video generation path ──────────────────────────────────────────
      if (isVideoModeForJob) {
        const videoRequest: VideoGenerationRequest = {
          prompt: effectivePromptForJob,
          model: modelForJob as VideoModel,
          aspectRatio:
            finalAspectRatio as VideoGenerationRequest["aspectRatio"],
          duration: videoDurationForJob,
          language: currentLanguage,
          image:
            referenceImagesForJob.length > 0
              ? referenceImagesForJob[0]
              : undefined,
          generateAudio: videoAudio || undefined,
        };

        const { videos: generatedVids } = await generateVideos(videoRequest);

        const newItems: GeneratedImage[] = generatedVids.map((vid) => ({
          id: vid.id,
          storagePath: vid.storagePath,
          url: vid.url,
          prompt: effectivePromptForJob,
          model: modelForJob,
          aspectRatio: finalGeneratedAspectRatio,
          size: undefined,
          timestamp: Timestamp.now(),
        }));

        generatedImageCount = newItems.length;

        setImages((prev) => {
          return mergeGeneratedImagesById(prev, newItems);
        });

        toaster.success({
          title: t("common.success"),
          description: t("imageGenerator.videoGenerated", {
            defaultValue: "Video generated successfully",
          }),
        });

        return;
      }

      // ── Image generation path ──────────────────────────────────────────
      const request: ImageGenerationRequest = {
        prompt: effectivePromptForJob,
        model: modelForJob,
        numberOfImages: numberOfImagesForJob,
        aspectRatio: finalAspectRatio,
        size: finalImageSize,
        quality: modelCapabilitiesForJob.supportsQuality
          ? imageQualityForJob
          : undefined,
        negativePrompt:
          modelCapabilitiesForJob.supportsNegativePrompt &&
          negativePromptValue.trim()
            ? negativePromptValue.trim()
            : undefined,
        language: currentLanguage,
        referenceImages:
          modelCapabilitiesForJob.supportsImageInput &&
          referenceImagesForJob.length > 0
            ? referenceImagesForJob.slice(0, maxReferenceImagesForJob)
            : undefined,
      };

      const { runId } = await startImageGenerationWorkflow({
        jobId,
        request,
      });
      workflowRunId = runId;

      // Persist workflow for recovery if user navigates away
      addPersistedWorkflow({
        runId,
        jobId,
        model: modelForJob,
        numberOfImages: numberOfImagesForJob,
        aspectRatio: aspectRatioForJob,
        imageSize: imageSizeForJob,
        imageQuality: modelCapabilitiesForJob.supportsQuality
          ? imageQualityForJob
          : undefined,
        prompt: effectivePromptForJob,
        startedAt: generationStartedAtMs,
        estimateMs,
      });

      const pollStartedAt = Date.now();
      let response: {
        images: Array<{ id: string; storagePath: string; url: string }>;
        filteredReason?: string;
      };

      const getEstimatedRemainingMs = (): number => {
        const elapsedMs = Date.now() - generationStartedAtMs;
        return Math.max(0, estimateMs - elapsedMs);
      };

      // Avoid polling too early: wait for roughly half of the estimated remaining time.
      // (Capped to keep the UI responsive even when estimates are very large.)
      const initialPollDelayMs = clampNumber(
        Math.floor(getEstimatedRemainingMs() / 2),
        POLL_BACKOFF_MIN_DELAY_MS,
        POLL_INITIAL_DELAY_CAP_MS,
      );
      await sleepMs(getJitteredDelayMs(initialPollDelayMs));

      // Initialize attempts so that the first follow-up poll interval roughly matches the
      // initial delay scale (clamped by our max), instead of immediately dropping to 500ms.
      const initialAttemptEstimate =
        initialPollDelayMs > 0
          ? Math.round(
              Math.log(initialPollDelayMs / POLL_BACKOFF_MIN_DELAY_MS) /
                Math.log(POLL_BACKOFF_FACTOR),
            )
          : 0;
      let pollAttempt = Math.max(0, initialAttemptEstimate);

      // Poll workflow status until done.
      // (This avoids both Server Action body limits and Vercel runtime timeouts.)
      for (;;) {
        const status = await getImageGenerationWorkflowStatus(runId, jobId);

        if (status.status === "completed") {
          response = status.result;
          break;
        }

        if (status.status === "failed") {
          throw new Error(status.error);
        }

        if (Date.now() - pollStartedAt > WORKFLOW_POLL_TIMEOUT_MS) {
          throw new Error(
            "Image generation timed out while waiting for the workflow to finish.",
          );
        }

        pollAttempt += 1;
        const remainingHalfMs = clampNumber(
          Math.floor(getEstimatedRemainingMs() / 2),
          POLL_BACKOFF_MIN_DELAY_MS,
          POLL_BACKOFF_MAX_DELAY_MS,
        );
        const backoffDelayMs = getExponentialBackoffDelayMs(pollAttempt);
        const nextDelayMs = Math.min(backoffDelayMs, remainingHalfMs);
        await sleepMs(getJitteredDelayMs(nextDelayMs));
      }

      if (response.filteredReason) {
        toaster.warning({
          title: t("imageGenerator.someImagesFiltered"),
          description: response.filteredReason,
        });
      }

      // Server action already stores images and returns stable download URLs.
      const newImages: GeneratedImage[] = response.images.map((img) => ({
        id: img.id,
        storagePath: img.storagePath,
        url: img.url,
        prompt: effectivePromptForJob,
        model: modelForJob,
        aspectRatio: finalGeneratedAspectRatio,
        size: finalImageSize,
        quality: modelCapabilitiesForJob.supportsQuality
          ? imageQualityForJob
          : undefined,
        timestamp: Timestamp.now(),
      }));

      generatedImageCount = newImages.length;

      // Save to local filesystem if desktop app is available (download from returned URL).
      if (typeof window !== "undefined" && window.konfiDesktop?.aiImages) {
        const desktopAiImages = window.konfiDesktop.aiImages;
        const toBase64 = async (url: string): Promise<string> => {
          const res = await fetch(url);
          const blob = await res.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        };

        await Promise.all(
          newImages.map(async (img) => {
            try {
              const base64 = await toBase64(img.url);
              const saveResult = await desktopAiImages.saveGeneratedImage(
                base64,
                {
                  prompt: effectivePromptForJob,
                  model: modelForJob,
                  aspectRatio: finalAspectRatio || "1:1",
                  negativePrompt: negativePromptValue.trim() || undefined,
                  timestamp: new Date().toISOString(),
                },
              );

              if (saveResult.success) {
                console.log("Image saved locally:", saveResult.path);
              } else {
                console.warn(
                  "Failed to save image locally:",
                  saveResult.message,
                );
              }
            } catch (error) {
              console.error("Error saving image locally:", error);
            }
          }),
        );
      }

      setImages((prev) => {
        return mergeGeneratedImagesById(prev, newImages);
      });

      toaster.success({
        title: t("common.success"),
        description: t("imageGenerator.generated", { count: newImages.length }),
      });
    })().catch((reason: unknown) => {
      generationFailed = true;
      generationFailure = reason;
    });

    if (generationFailed) {
      console.error("Error generating images:", generationFailure);
      toaster.error({
        title: t("common.error"),
        description:
          generationFailure instanceof Error
            ? generationFailure.message
            : t("error.failedToGenerate"),
      });
    }

    activeJobIdsRef.current.delete(jobId);

    // Remove workflow from persisted storage (completed or failed)
    if (workflowRunId) {
      removePersistedWorkflow(workflowRunId);
    }

    if (latestEtaJobIdRef.current === jobId) {
      latestEtaJobIdRef.current = null;
      setEtaSeconds(null);
    }

    if (generatedImageCount > 0) {
      const durationMs = Date.now() - generationStartedAtMs;
      const model = modelForJob;

      setDurationSamplesByModel((prev) => {
        const prevSamples = prev[model] ?? [];
        const nextSamples: GenerationDurationSample[] = [
          ...prevSamples,
          { imageCount: generatedImageCount, durationMs },
        ].slice(-MAX_ETA_SAMPLES);
        return {
          ...prev,
          [model]: nextSamples,
        };
      });
    }

    setActiveGenerations((c) => Math.max(0, c - 1));

    // Refresh budget usage (quota reservation is finalized server-side in the action).
    void refreshBudgetUsage();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleGenerate();
    }
  }

  const handlePromptDragEnter = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        !canAttachReferenceImages ||
        isUploadingReferenceImages ||
        !hasFileDragData(event.dataTransfer)
      ) {
        return;
      }

      event.preventDefault();
      promptDragCounterRef.current += 1;
      setIsPromptDropActive(true);
    },
    [canAttachReferenceImages, isUploadingReferenceImages],
  );

  const handlePromptDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        !canAttachReferenceImages ||
        isUploadingReferenceImages ||
        !hasFileDragData(event.dataTransfer)
      ) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";

      if (!isPromptDropActive) {
        setIsPromptDropActive(true);
      }
    },
    [canAttachReferenceImages, isPromptDropActive, isUploadingReferenceImages],
  );

  const handlePromptDragLeave = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!canAttachReferenceImages || !hasFileDragData(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      promptDragCounterRef.current = Math.max(
        0,
        promptDragCounterRef.current - 1,
      );

      if (promptDragCounterRef.current === 0) {
        setIsPromptDropActive(false);
      }
    },
    [canAttachReferenceImages],
  );

  const handlePromptDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (
        !canAttachReferenceImages ||
        isUploadingReferenceImages ||
        !hasFileDragData(event.dataTransfer)
      ) {
        return;
      }

      event.preventDefault();
      promptDragCounterRef.current = 0;
      setIsPromptDropActive(false);

      const droppedFiles = Array.from(event.dataTransfer.files ?? []);
      if (droppedFiles.length === 0) {
        return;
      }

      void handleReferenceFilesSelected(droppedFiles);
    },
    [
      canAttachReferenceImages,
      handleReferenceFilesSelected,
      isUploadingReferenceImages,
    ],
  );

  async function confirmDelete() {
    if (!imageToDelete) return;

    try {
      const image = images.find((img) => img.id === imageToDelete);
      if (!image) return;

      // Delete from Firebase Storage
      const { ref, deleteObject } = await import("firebase/storage");
      const { storage } = await import("@/lib/firebase/clientApp");

      // Construct the storage path from the image URL or metadata
      const dateStr = image.timestamp.toDate().toISOString().split("T")[0];
      const fallbackStoragePath = adminAccountId
        ? `ai/generated/accounts/${adminAccountId}/${dateStr}/${image.model}/${imageToDelete}.png`
        : null;
      const filePath = image.storagePath ?? fallbackStoragePath;
      if (!filePath) {
        throw new Error(
          t("auth.loginRequired", {
            defaultValue: "You must be logged in to delete generated files.",
          }),
        );
      }
      const storageRef = ref(storage, filePath);

      await deleteObject(storageRef);

      // Remove from local state
      setImages((prev) => prev.filter((img) => img.id !== imageToDelete));

      // Close preview if this image was being previewed
      if (previewImage?.id === imageToDelete) {
        setPreviewImage(null);
      }

      toaster.success({
        title: t("imageGenerator.deleted"),
        description: t("imageGenerator.deletedDescription"),
      });
    } catch (error) {
      console.error("Error deleting image:", error);
      toaster.error({
        title: t("imageGenerator.deleteFailed"),
        description: t("imageGenerator.deleteFailedDescription"),
      });
    } finally {
      setImageToDelete(null);
    }
  }

  async function handleChangeSavePath() {
    if (!window.konfiDesktop?.aiImages) return;

    try {
      const success = await window.konfiDesktop.aiImages.pickSaveDirectory();
      if (success) {
        const newPath = await window.konfiDesktop.aiImages.getSaveDirectory();
        setLocalSavePath(newPath);
        toaster.success({
          title: t("common.success"),
          description: t("imageGenerator.savePathUpdated"),
        });
      } else {
        toaster.error({
          title: t("common.error"),
          description: t("imageGenerator.failedToUpdateSavePath"),
        });
      }
    } catch (error) {
      console.error("Error changing save path:", error);
      toaster.error({
        title: t("common.error"),
        description: t("imageGenerator.failedToUpdateSavePath"),
      });
    }
  }

  async function handleOpenSaveFolder() {
    if (!window.konfiDesktop?.aiImages) return;

    try {
      await window.konfiDesktop.aiImages.openSaveDirectory();
    } catch (error) {
      console.error("Error opening save folder:", error);
      toaster.error({
        title: t("common.error"),
        description: t("imageGenerator.failedToOpenFolder"),
      });
    }
  }

  // Handle mouse drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomRef.current > 1) {
      const { x, y } = positionRef.current;
      dragStateRef.current = {
        isDragging: true,
        offsetX: e.clientX - x,
        offsetY: e.clientY - y,
      };
      setIsDragging(true);
    }
  }, []);

  const handleMouseUp = useCallback(() => {
    dragStateRef.current.isDragging = false;
    setIsDragging(false);
  }, []);

  // Global pointer move handler
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePointerMove = (event: PointerEvent) => {
      if (
        !dragStateRef.current.isDragging ||
        zoomRef.current <= 1 ||
        !imageContainerRef.current
      )
        return;

      const container = imageContainerRef.current;
      const containerRect = container.getBoundingClientRect();

      // Calculate the scaled image dimensions
      const zoom = zoomRef.current;
      const imageWidth = containerRect.width * zoom;
      const imageHeight = containerRect.height * zoom;

      // Calculate maximum allowed translation
      const maxTranslateX = (imageWidth - containerRect.width) / 2;
      const maxTranslateY = (imageHeight - containerRect.height) / 2;

      // Calculate new position
      const newX = event.clientX - dragStateRef.current.offsetX;
      const newY = event.clientY - dragStateRef.current.offsetY;

      // Clamp position within bounds
      const clampedX = Math.max(-maxTranslateX, Math.min(maxTranslateX, newX));
      const clampedY = Math.max(-maxTranslateY, Math.min(maxTranslateY, newY));

      updatePosition(clampedX, clampedY);
    };

    const handlePointerUp = () => {
      if (!dragStateRef.current.isDragging) return;
      dragStateRef.current.isDragging = false;
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [updatePosition]);

  // Reset zoom and position when closing dialog
  const resetImageView = useCallback(() => {
    updateZoom(1);
    updatePosition(0, 0);
  }, [updatePosition, updateZoom]);

  // When switching previewed images (without closing the dialog), always reset
  // zoom/pan so the newly previewed image is fully visible and not clipped.
  useEffect(() => {
    if (!previewImage) return;
    resetImageView();
  }, [previewImage, resetImageView]);

  return (
    <VStack
      gap={4}
      align="stretch"
      h="95.25vh"
      overflow="hidden"
      position="relative"
    >
      <CustomHeading
        heading={t("tools.imageGenerator", { defaultValue: "Image Generator" })}
        breadcrumb={true}
        goBack={true}
        t={t}
        mb={0}
      />

      {/* Image Grid */}
      <Box
        ref={scrollContainerRef}
        overflow="auto"
        flex={1}
        minH={0}
        px={2}
        pb={{ base: "340px", md: "280px" }}
      >
        <VStack gap={4} align="stretch">
          {images.length === 0 && !isGenerating && !showMasonryGrid && (
            <Empty
              icon="image"
              title={t("imageGenerator.empty")}
              description={t("imageGenerator.startGenerating")}
            />
          )}
          {isGenerating && (
            <Box>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                {activeGenerationUi ? (
                  <>
                    {t("imageGenerator.generating")}{" "}
                    {isVideoModelValue(activeGenerationUi.model) ? (
                      t("imageGenerator.video", { defaultValue: "video" })
                    ) : (
                      <>
                        {activeGenerationUi.numberOfImages}{" "}
                        {activeGenerationUi.numberOfImages === 1
                          ? t("imageGenerator.image")
                          : t("imageGenerator.images")}
                      </>
                    )}
                    {activeGenerations > 1
                      ? ` (+${Math.max(0, activeGenerations - 1)})`
                      : null}
                  </>
                ) : (
                  <>
                    {t("imageGenerator.generating")}
                    {activeGenerations > 1 ? ` (${activeGenerations})` : null}
                  </>
                )}
              </Text>
              {etaSeconds !== null && (
                <HStack gap={2} mb={3}>
                  <Spinner size="sm" />
                  <Text fontSize="sm" opacity={0.75}>
                    {t("imageGenerator.estimatedGenerationTime", {
                      time: formatEtaSeconds(etaSeconds),
                      defaultValue: "est. {{time}}",
                    })}
                  </Text>
                </HStack>
              )}
              {activeGenerationUi && (
                <>
                  {!generatingModelCapabilities.supportsAspectRatio &&
                    activeGenerationUi.aspectRatio !== "AUTO" && (
                      <Text fontSize="sm" opacity={0.75} mb={3}>
                        {t("imageGenerator.aspectRatioHint", {
                          aspectRatio: activeGenerationUi.aspectRatio,
                        })}
                      </Text>
                    )}
                  {!generatingModelCapabilities.supportsSize &&
                    activeGenerationUi.imageSize !== "AUTO" && (
                      <Text fontSize="sm" opacity={0.75} mb={3}>
                        {t("imageGenerator.imageSizeHint", {
                          size: activeGenerationUi.imageSize,
                        })}
                      </Text>
                    )}
                </>
              )}
            </Box>
          )}
          {showMasonryGrid && (
            <VStack gap={3} align="stretch">
              <Flex gap={3} align="flex-start">
                {masonryColumnItems.map((column, columnIndex) => (
                  <VStack
                    key={`masonry-col-${columnIndex}`}
                    gap={3}
                    align="stretch"
                    flex={1}
                    minW={0}
                  >
                    {column.map((item) => {
                      if (item.kind === "generating") {
                        return (
                          <Box key={item.key} w="full">
                            {renderGeneratingTile(item.aspectRatio)}
                          </Box>
                        );
                      }

                      if (item.kind === "image") {
                        return (
                          <Box key={item.key} w="full">
                            {renderImageCard(item.image)}
                          </Box>
                        );
                      }

                      if (item.preset) {
                        return (
                          <Box key={item.key} w="full">
                            {renderExamplePromptTile(
                              item.preset,
                              item.aspectRatio,
                            )}
                          </Box>
                        );
                      }

                      return (
                        <Box
                          key={item.key}
                          w="full"
                          aria-hidden="true"
                          pointerEvents="none"
                        >
                          {renderPlaceholderTile(item.aspectRatio)}
                        </Box>
                      );
                    })}
                  </VStack>
                ))}
              </Flex>
            </VStack>
          )}

          {isLoading && images.length > 0 && (
            <Box>
              <Grid
                templateColumns={{
                  base: "repeat(1, 1fr)",
                  sm: "repeat(2, 1fr)",
                  md: "repeat(3, 1fr)",
                  lg: "repeat(4, 1fr)",
                  xl: "repeat(5, 1fr)",
                  "2xl": "repeat(6, 1fr)",
                }}
                gap={3}
              >
                <GridItem>
                  <Skeleton borderRadius="2xl" aspectRatio={1} />
                </GridItem>
                <GridItem display={{ base: "none", sm: "block" }}>
                  <Skeleton borderRadius="2xl" aspectRatio={1} />
                </GridItem>
                <GridItem display={{ base: "none", md: "block" }}>
                  <Skeleton borderRadius="2xl" aspectRatio={1} />
                </GridItem>
              </Grid>
            </Box>
          )}

          {isLoading && images.length === 0 && (
            <Flex h="full" align="center" justify="center">
              <Text opacity={0.7}>{t("imageGenerator.loadingImages")}</Text>
            </Flex>
          )}
        </VStack>
      </Box>

      {/* Desktop App Local Save Notice */}
      {isDesktopApp && localSavePath && (
        <Box
          bg="primary.300/33"
          w="23%"
          borderRadius="3xl"
          p={3}
          borderLeft="4px solid"
          borderColor="primary.emphasized"
          position="absolute"
          bottom={28}
          left={8}
          backdropFilter={"blur(20px)"}
          zIndex={10}
        >
          <VStack gap={2} align="stretch">
            <HStack gap={2} justify="space-between">
              <HStack gap={2}>
                <MaterialSymbol color="primary.emphasized">save</MaterialSymbol>
                <Text fontSize="sm" fontWeight="medium">
                  Auto-saving locally
                </Text>
              </HStack>
              <IconButton
                size="xs"
                variant="ghost"
                aria-label="Settings"
                onClick={() => setShowSettingsDialog(true)}
              >
                <MaterialSymbol>settings</MaterialSymbol>
              </IconButton>
            </HStack>
            <Text fontSize="xs" opacity={0.8} lineClamp={2}>
              {localSavePath}
            </Text>
          </VStack>
        </Box>
      )}

      {/* Prompt Input */}
      <VStack
        w="calc(50% - 64px)"
        gap={4}
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        bottom={8}
        px={4}
        py={4}
        bgColor={{ base: "whiteAlpha.700", _dark: "blackAlpha.700" }}
        backdropFilter="blur(10px)"
        borderRadius="3xl"
        zIndex={10}
        align="stretch"
      >
        {budgetProgress && (
          <Box
            position="absolute"
            top={4}
            right={4}
            zIndex={1}
            pointerEvents="none"
          >
            <ProgressCircle.Root
              value={budgetProgress.percent}
              size="sm"
              colorPalette={budgetProgressColorPalette}
              aria-label={t("imageGenerator.budgetUsage", {
                defaultValue: `AI image budget used ${formatUsdCents(budgetProgress.spentUsdCents)} of ${formatUsdCents(budgetProgress.limitUsdCents)} this month.`,
              })}
            >
              <ProgressCircle.Circle>
                <ProgressCircle.Track />
                <ProgressCircle.Range strokeLinecap="round" />
              </ProgressCircle.Circle>
              <AbsoluteCenter>
                <Text fontSize="2xs" fontWeight="medium" opacity={0.9}>
                  {budgetProgress.percent}
                </Text>
              </AbsoluteCenter>
            </ProgressCircle.Root>
          </Box>
        )}
        <VStack gap={3} align="stretch" flex={1}>
          {!isLanguageSupported && (
            <Text fontSize="sm" color="yellow.contrast" px={4}>
              <MaterialSymbol
                style={{ display: "inline", verticalAlign: "middle" }}
              >
                translate
              </MaterialSymbol>{" "}
              {t("imageGenerator.languageTranslation")}
            </Text>
          )}
          {canAttachReferenceImages && (
            <Box>
              <HStack gap={2} flexWrap="wrap" align="center">
                <HStack>
                  <input
                    key={fileUploadResetKey}
                    id={referenceFileInputId}
                    type="file"
                    hidden
                    multiple={maxReferenceImagesForSelectedModel > 1}
                    accept={REFERENCE_IMAGE_ACCEPT}
                    onChange={(e) => {
                      const files = Array.from(e.currentTarget.files ?? []);
                      e.currentTarget.value = "";
                      void handleReferenceFilesSelected(files);
                    }}
                  />
                  {isUploadingReferenceImages || !adminAccountId ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      loading={isUploadingReferenceImages}
                      disabled
                    >
                      <MaterialSymbol>upload</MaterialSymbol>
                      {referenceImages.length > 0
                        ? t("imageGenerator.changeImage")
                        : t("imageGenerator.uploadImageOptional")}
                    </Button>
                  ) : (
                    <Button asChild type="button" size="sm" variant="outline">
                      <label htmlFor={referenceFileInputId}>
                        <MaterialSymbol>upload</MaterialSymbol>
                        {referenceImages.length > 0
                          ? t("imageGenerator.changeImage")
                          : t("imageGenerator.uploadImageOptional")}
                      </label>
                    </Button>
                  )}

                  <ReferenceImageLibraryDialog
                    t={t}
                    selectedUrls={referenceImages}
                    onChangeSelectedUrls={(next) => {
                      setReferenceImages(next);
                      // Keep hidden input reset behavior consistent when switching sources.
                      setFileUploadResetKey((k) => k + 1);
                    }}
                    maxSelected={maxReferenceImagesForSelectedModel}
                    allowedMimeTypes={REFERENCE_IMAGE_ALLOWED_MIME_TYPES}
                    disabled={isUploadingReferenceImages || !adminAccountId}
                    rootPath={
                      adminAccountId
                        ? `ai/reference/accounts/${adminAccountId}`
                        : undefined
                    }
                  />
                </HStack>
                {referenceImages.length > 0 && (
                  <>
                    <Text fontSize="sm" opacity={0.7}>
                      {t("imageGenerator.imageAttached")}
                      {referenceImages.length > 1
                        ? ` (${referenceImages.length})`
                        : null}
                    </Text>
                    <IconButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={t("imageGenerator.removeImage")}
                      onClick={clearReferenceImages}
                    >
                      <MaterialSymbol>close</MaterialSymbol>
                    </IconButton>
                  </>
                )}
              </HStack>
              {referenceImages.length > 0 && (
                <HStack mt={2} gap={2} flexWrap="wrap">
                  {referenceImages.map((url, index) => (
                    <Box
                      key={`${url}-${index}`}
                      position="relative"
                      w="72px"
                      h="72px"
                      borderRadius="lg"
                      overflow="hidden"
                    >
                      <Image
                        src={url}
                        alt={t("imageGenerator.referenceImageAlt", {
                          defaultValue: "Reference image",
                        })}
                        w="72px"
                        h="72px"
                        objectFit="cover"
                      />
                      <IconButton
                        size="xs"
                        variant="solid"
                        colorPalette="gray"
                        aria-label={t("imageGenerator.removeImage")}
                        position="absolute"
                        top={1}
                        right={1}
                        onClick={() => removeReferenceImageAt(index)}
                      >
                        <MaterialSymbol>close</MaterialSymbol>
                      </IconButton>
                    </Box>
                  ))}
                </HStack>
              )}
            </Box>
          )}

          <Box>
            <Box
              position="relative"
              borderRadius="3xl"
              borderWidth="1px"
              borderStyle={isPromptDropActive ? "dashed" : "solid"}
              borderColor={
                isPromptDropActive
                  ? "primary.emphasized"
                  : { base: "blackAlpha.200", _dark: "whiteAlpha.200" }
              }
              bg={
                isPromptDropActive
                  ? { base: "primary.50", _dark: "blackAlpha.500" }
                  : "transparent"
              }
              transition="background-color 0.2s ease, border-color 0.2s ease"
              onDragEnter={handlePromptDragEnter}
              onDragLeave={handlePromptDragLeave}
              onDragOver={handlePromptDragOver}
              onDrop={handlePromptDrop}
            >
              <Textarea
                ref={textareaRef}
                focusRingColor="transparent"
                defaultValue=""
                onKeyUp={handleKeyDown}
                placeholder={
                  isVideoMode
                    ? t("imageGenerator.describeVideo", {
                        defaultValue:
                          "Describe the video you want to generate...",
                      })
                    : modelCapabilities.supportsImageInput
                      ? t("imageGenerator.describeEdit")
                      : t("imageGenerator.describeImage")
                }
                borderRadius="3xl"
                autoresize
                maxH="8lh"
                variant="subtle"
                size="lg"
                bgColor="transparent"
                px={4}
              />
              {isPromptDropActive && (
                <Flex
                  position="absolute"
                  inset={0}
                  borderRadius="3xl"
                  align="center"
                  justify="center"
                  bg={{ base: "primary.50", _dark: "blackAlpha.700" }}
                  backdropFilter="blur(4px)"
                  pointerEvents="none"
                >
                  <VStack gap={2} textAlign="center" px={6}>
                    <Text fontWeight="semibold">
                      {t("imageGenerator.promptDropActive", {
                        defaultValue: "Drop reference images to attach them",
                      })}
                    </Text>
                    <Text fontSize="sm" opacity={0.8}>
                      {t("imageGenerator.promptDropHint", {
                        defaultValue:
                          "Tip: drag reference images onto the prompt area to attach them for compatible models.",
                      })}
                    </Text>
                  </VStack>
                </Flex>
              )}
            </Box>
          </Box>
          {modelCapabilities.supportsNegativePrompt && !isVideoMode && (
            <Textarea
              ref={negativePromptRef}
              focusRingColor="transparent"
              defaultValue=""
              placeholder={t("imageGenerator.whatToAvoid")}
              borderRadius="3xl"
              autoresize
              rows={1}
              maxHeight="100px"
              flex={1}
              variant="subtle"
              size="sm"
              bgColor="transparent"
              pt={0}
            />
          )}
        </VStack>
        <Flex
          gap={3}
          align={{ base: "stretch", xl: "flex-end" }}
          justify="space-between"
          direction={{ base: "column", xl: "row" }}
        >
          <Flex gap={2} flexWrap="wrap" flex={1} minW={0}>
            {/* Model Selector */}
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button
                  aria-label={t("imageGenerator.selectModel")}
                  rounded="full"
                  variant="outline"
                  disabled={buttonCooldown}
                  maxW={{ base: "220px", md: "280px" }}
                  minW={0}
                >
                  <Box flexShrink={0}>
                    <MaterialSymbol>expand_less</MaterialSymbol>
                  </Box>
                  <Text as="span" truncate title={selectedModelLabel}>
                    {selectedModelLabel}
                  </Text>
                </Button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.ItemGroup>
                      <Menu.ItemGroupLabel>
                        {t("imageGenerator.selectModel")}
                      </Menu.ItemGroupLabel>
                      {modelSelectorOptions.map((model) => (
                        <Menu.Item
                          key={model.value}
                          value={model.value}
                          onClick={() => {
                            setSelectedModel(
                              model.value as ImageGenerationRequest["model"],
                            );

                            if (model.value === MODELS.GPT_IMAGE_2) {
                              setAspectRatio("AUTO");
                              setImageSize("AUTO");
                              setImageQuality(GPT_IMAGE_2_DEFAULT_QUALITY);
                              setGptImage2CustomSizeInput("");
                            }
                          }}
                        >
                          {isVideoModelValue(model.value) ? (
                            <HStack gap={1}>
                              <MaterialSymbol>videocam</MaterialSymbol>
                              <Text>{model.label}</Text>
                            </HStack>
                          ) : (
                            model.label
                          )}
                        </Menu.Item>
                      ))}
                    </Menu.ItemGroup>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            {/* Aspect Ratio Selector */}
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button
                  aria-label={t("imageGenerator.selectAspectRatio")}
                  rounded="full"
                  variant="outline"
                  disabled={buttonCooldown}
                >
                  <MaterialSymbol>aspect_ratio</MaterialSymbol>
                  {selectedAspectRatioLabel}
                </Button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content>
                    <Menu.ItemGroup>
                      <Menu.ItemGroupLabel>
                        {t("imageGenerator.aspectRatio")}
                      </Menu.ItemGroupLabel>
                      {availableAspectRatios.map((ratio) => (
                        <Menu.Item
                          key={ratio.value}
                          value={ratio.value}
                          onClick={() => {
                            const nextAspectRatio =
                              ratio.value as UiAspectRatio;
                            setAspectRatio(nextAspectRatio);

                            if (isGptImage2Selected) {
                              if (nextAspectRatio === "AUTO") {
                                setImageSize("AUTO");
                                return;
                              }

                              const nextSize =
                                getGptImage2SizeForAspectRatio(nextAspectRatio);
                              if (nextSize) {
                                setImageSize(nextSize);
                              }
                            }
                          }}
                        >
                          {ratio.label}
                        </Menu.Item>
                      ))}
                    </Menu.ItemGroup>
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>

            {/* Image Size Selector (images only) */}
            {!isVideoMode && (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button
                    aria-label={t("imageGenerator.selectImageSize")}
                    rounded="full"
                    variant="outline"
                    disabled={buttonCooldown}
                  >
                    <MaterialSymbol>high_quality</MaterialSymbol>
                    {selectedImageSizeLabel}
                  </Button>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel>
                          {t("imageGenerator.imageSize")}
                        </Menu.ItemGroupLabel>
                        {availableImageSizes.map((size) => (
                          <Menu.Item
                            key={size.value}
                            value={size.value}
                            onClick={() => {
                              setImageSize(size.value);

                              if (
                                isGptImage2Selected &&
                                size.value === "AUTO"
                              ) {
                                setAspectRatio("AUTO");
                                return;
                              }

                              if (
                                isGptImage2Selected &&
                                size.value !== "AUTO" &&
                                isGptImage2GenerationSize(size.value)
                              ) {
                                const nextAspectRatio =
                                  getAspectRatioForGptImage2Size(size.value);
                                setAspectRatio(
                                  nextAspectRatio
                                    ? (nextAspectRatio as UiAspectRatio)
                                    : "AUTO",
                                );
                              }
                            }}
                          >
                            {size.label}
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}

            {!isVideoMode && isGptImage2Selected && (
              <Input
                value={gptImage2CustomSizeInput}
                onChange={(event) =>
                  setGptImage2CustomSizeInput(event.target.value)
                }
                onBlur={() =>
                  applyGptImage2CustomSize(gptImage2CustomSizeInput)
                }
                onKeyDown={handleGptImage2CustomSizeKeyDown}
                placeholder={t("imageGenerator.customSizePlaceholder", {
                  defaultValue: "Custom size (e.g. 2048x1152)",
                })}
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                w={{ base: "full", md: "240px" }}
              />
            )}

            {!isVideoMode && modelCapabilities.supportsQuality && (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button
                    aria-label={t("imageGenerator.selectQuality", {
                      defaultValue: "Select quality",
                    })}
                    rounded="full"
                    variant="outline"
                    disabled={buttonCooldown}
                  >
                    <MaterialSymbol>tune</MaterialSymbol>
                    {selectedImageQualityLabel}
                  </Button>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel>
                          {t("imageGenerator.quality", {
                            defaultValue: "Quality",
                          })}
                        </Menu.ItemGroupLabel>
                        {gptImage2QualityOptions.map((qualityOption) => (
                          <Menu.Item
                            key={qualityOption.value}
                            value={qualityOption.value}
                            onClick={() => setImageQuality(qualityOption.value)}
                          >
                            <HStack w="full" justify="space-between" gap={4}>
                              <Text>{qualityOption.label}</Text>
                              <Text fontSize="xs" opacity={0.7}>
                                {qualityOption.price}
                              </Text>
                            </HStack>
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}

            {/* Duration Selector (video only) */}
            {isVideoMode && videoCapabilities && (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <Button
                    aria-label={t("imageGenerator.selectDuration", {
                      defaultValue: "Select duration",
                    })}
                    rounded="full"
                    variant="outline"
                    disabled={buttonCooldown}
                  >
                    <MaterialSymbol>timer</MaterialSymbol>
                    {videoDuration}s
                  </Button>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel>
                          {t("imageGenerator.duration", {
                            defaultValue: "Duration",
                          })}
                        </Menu.ItemGroupLabel>
                        {(
                          videoCapabilities.supportedDurations ??
                          Array.from(
                            { length: videoCapabilities.maxDurationSeconds },
                            (_, i) => i + 1,
                          )
                        ).map((sec) => (
                          <Menu.Item
                            key={sec}
                            value={sec.toString()}
                            onClick={() => setVideoDuration(sec)}
                          >
                            {sec}s
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}

            {/* Audio Toggle (video only, if model supports it) */}
            {isVideoMode && videoCapabilities?.supportsAudio && (
              <Button
                rounded="full"
                variant={videoAudio ? "solid" : "outline"}
                colorPalette={videoAudio ? "primary" : "gray"}
                disabled={buttonCooldown}
                onClick={() => setVideoAudio((v) => !v)}
              >
                <MaterialSymbol>
                  {videoAudio ? "volume_up" : "volume_off"}
                </MaterialSymbol>
                {videoAudio
                  ? t("imageGenerator.audioOn", { defaultValue: "Audio on" })
                  : t("imageGenerator.audioOff", { defaultValue: "Audio off" })}
              </Button>
            )}

            {/* Number of Images (images only) */}
            {!isVideoMode && (
              <Menu.Root>
                <Menu.Trigger asChild>
                  <IconButton
                    aria-label={t("imageGenerator.selectNumberOfImages")}
                    rounded="full"
                    variant="outline"
                    disabled={
                      buttonCooldown ||
                      !modelCapabilities.supportsMultipleImages
                    }
                  >
                    <MaterialSymbol>images</MaterialSymbol>
                    <Float offset={1}>
                      <Circle
                        size={"5"}
                        bg="primary.solid"
                        color={{ base: "white", _dark: "gray.900" }}
                      >
                        {numberOfImages}
                      </Circle>
                    </Float>
                  </IconButton>
                </Menu.Trigger>
                <Portal>
                  <Menu.Positioner>
                    <Menu.Content>
                      <Menu.ItemGroup>
                        <Menu.ItemGroupLabel>
                          {t("imageGenerator.numberOfImages")}
                        </Menu.ItemGroupLabel>
                        {Array.from(
                          { length: modelCapabilities.maxImages },
                          (_, i) => i + 1,
                        ).map((num) => (
                          <Menu.Item
                            key={num}
                            value={num.toString()}
                            onClick={() => setNumberOfImages(num)}
                          >
                            {num}{" "}
                            {num === 1
                              ? t("imageGenerator.image")
                              : t("imageGenerator.images")}
                          </Menu.Item>
                        ))}
                      </Menu.ItemGroup>
                    </Menu.Content>
                  </Menu.Positioner>
                </Portal>
              </Menu.Root>
            )}
          </Flex>
          <Button
            colorPalette="primary"
            aria-label={t("imageGenerator.generate")}
            onClick={handleGenerate}
            disabled={buttonCooldown || isUploadingReferenceImages}
            loading={buttonCooldown || isUploadingReferenceImages}
            alignSelf={{ base: "stretch", xl: "flex-end" }}
            flexShrink={0}
            variant="ai"
          >
            <MaterialSymbol>auto_awesome</MaterialSymbol>
            {t("imageGenerator.generate")}
          </Button>
        </Flex>
      </VStack>

      {/* Preview Dialog */}
      <Dialog.Root
        open={!!previewImage}
        onOpenChange={(e) => {
          if (!e.open) {
            setPreviewImage(null);
            resetImageView();
          }
        }}
        size="xl"
        placement="center"
        scrollBehavior="inside"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner overflow="hidden" overscrollBehavior="none">
            <Dialog.Content
              maxW="90vw"
              maxH="90dvh"
              h="90dvh"
              overflow="hidden"
              display="flex"
              flexDirection="column"
            >
              <Dialog.Header>
                <Dialog.Title>
                  {previewImage && isVideoModelValue(previewImage.model)
                    ? t("imageGenerator.videoPreview", {
                        defaultValue: "Video Preview",
                      })
                    : t("imageGenerator.imagePreview")}
                </Dialog.Title>
              </Dialog.Header>

              <Dialog.Body
                flex={1}
                minH={0}
                overflow="hidden"
                overscrollBehavior="contain"
              >
                {previewImage && (
                  <HStack gap={6} align="stretch" h="100%" minH={0}>
                    <Box
                      ref={imageContainerRef}
                      flex={2}
                      minW={0}
                      minH={0}
                      overflow="hidden"
                      position="relative"
                      borderRadius="lg"
                      cursor={
                        zoomRef.current > 1
                          ? isDragging
                            ? "grabbing"
                            : "grab"
                          : "default"
                      }
                      onPointerDown={handleMouseDown}
                      onPointerUp={handleMouseUp}
                      onDragStart={(e) => e.preventDefault()}
                      onWheel={(e) => {
                        e.stopPropagation();
                        const delta = e.deltaY > 0 ? -0.1 : 0.1;
                        const newZoom = Math.max(
                          1,
                          Math.min(5, zoomRef.current + delta),
                        );

                        updateZoom(newZoom);

                        // Reset position when zooming back to 100%
                        if (newZoom === 1) {
                          updatePosition(0, 0);
                        } else if (imageContainerRef.current) {
                          // Clamp position when zooming
                          const container = imageContainerRef.current;
                          const containerRect =
                            container.getBoundingClientRect();
                          const imageWidth = containerRect.width * newZoom;
                          const imageHeight = containerRect.height * newZoom;
                          const maxTranslateX =
                            (imageWidth - containerRect.width) / 2;
                          const maxTranslateY =
                            (imageHeight - containerRect.height) / 2;

                          const { x, y } = positionRef.current;
                          updatePosition(
                            Math.max(
                              -maxTranslateX,
                              Math.min(maxTranslateX, x),
                            ),
                            Math.max(
                              -maxTranslateY,
                              Math.min(maxTranslateY, y),
                            ),
                          );
                        }
                      }}
                    >
                      {previewImage && isVideoModelValue(previewImage.model) ? (
                        <video
                          key={previewImage.url}
                          src={previewImage.url}
                          controls
                          autoPlay
                          muted
                          playsInline
                          style={{
                            width: "100%",
                            height: "100%",
                            maxHeight: "100%",
                            maxWidth: "100%",
                            objectFit: "contain",
                            borderRadius: "8px",
                          }}
                        />
                      ) : previewImage && isSvgGeneratedImage(previewImage) ? (
                        <Box
                          ref={(node: HTMLDivElement | null) => {
                            previewMediaRef.current = node;
                          }}
                          width="100%"
                          height="100%"
                          maxH="100%"
                          maxW="100%"
                          borderRadius="lg"
                          overflow="hidden"
                          transformOrigin="center center"
                          transition={isDragging ? "none" : "transform 0.2s"}
                          userSelect="none"
                          pointerEvents="none"
                          draggable={false}
                          style={{
                            transform: `scale(${zoomRef.current}) translate(${positionRef.current.x / zoomRef.current}px, ${positionRef.current.y / zoomRef.current}px)`,
                          }}
                        >
                          <SvgGeneratedImagePreview image={previewImage} />
                        </Box>
                      ) : (
                        <Image
                          ref={(node: HTMLImageElement | null) => {
                            previewMediaRef.current = node;
                          }}
                          src={previewImage.url}
                          alt={previewImage.prompt}
                          width="100%"
                          height="100%"
                          maxH="100%"
                          maxW="100%"
                          objectFit="contain"
                          borderRadius="lg"
                          transformOrigin="center center"
                          transition={isDragging ? "none" : "transform 0.2s"}
                          userSelect="none"
                          pointerEvents="none"
                          draggable={false}
                          style={{
                            transform: `scale(${zoomRef.current}) translate(${positionRef.current.x / zoomRef.current}px, ${positionRef.current.y / zoomRef.current}px)`,
                          }}
                        />
                      )}
                    </Box>

                    <VStack
                      align="stretch"
                      gap={4}
                      flex={1}
                      minW={0}
                      minH={0}
                      overflowY="auto"
                      overscrollBehavior="contain"
                    >
                      <VStack align="stretch" gap={2}>
                        <Text fontWeight="bold">
                          {t("imageGenerator.prompt")}
                        </Text>
                        <Text>{previewImage.prompt}</Text>
                      </VStack>
                      <VStack align="stretch" gap={2}>
                        <Text fontWeight="bold">
                          {t("imageGenerator.model")}
                        </Text>
                        <Text fontSize="sm" opacity={0.7}>
                          {_MODELS.find((m) => m.value === previewImage.model)
                            ?.label || previewImage.model}
                        </Text>
                      </VStack>
                      <VStack align="stretch" gap={2}>
                        <Text fontWeight="bold">
                          {t("imageGenerator.aspectRatio")}
                        </Text>
                        <Text fontSize="sm" opacity={0.7}>
                          {getImageAspectRatioLabel(previewImage) ?? autoLabel}
                        </Text>
                      </VStack>
                      <VStack align="stretch" gap={2}>
                        <Text fontWeight="bold">
                          {t("imageGenerator.imageSize")}
                        </Text>
                        <Text fontSize="sm" opacity={0.7}>
                          {previewImage.size || autoLabel}
                        </Text>
                      </VStack>
                      {previewImage.quality && (
                        <VStack align="stretch" gap={2}>
                          <Text fontWeight="bold">
                            {t("imageGenerator.quality", {
                              defaultValue: "Quality",
                            })}
                          </Text>
                          <Text fontSize="sm" opacity={0.7}>
                            {imageQualityLabels[previewImage.quality] ??
                              previewImage.quality}
                          </Text>
                        </VStack>
                      )}
                    </VStack>
                  </HStack>
                )}
              </Dialog.Body>

              <Dialog.Footer justifyContent="space-between">
                <HStack align="stretch" gap={2}>
                  <Text alignSelf="center" fontWeight="bold">
                    {t("imageGenerator.zoom")}
                  </Text>
                  <HStack gap={2}>
                    <IconButton
                      aria-label={t("imageGenerator.zoomOut")}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newZoom = Math.max(1, zoomRef.current - 0.25);
                        updateZoom(newZoom);

                        // Reset position when zooming back to 100%
                        if (newZoom === 1) {
                          updatePosition(0, 0);
                        } else if (imageContainerRef.current) {
                          // Clamp position when zooming
                          const container = imageContainerRef.current;
                          const containerRect =
                            container.getBoundingClientRect();
                          const imageWidth = containerRect.width * newZoom;
                          const imageHeight = containerRect.height * newZoom;
                          const maxTranslateX =
                            (imageWidth - containerRect.width) / 2;
                          const maxTranslateY =
                            (imageHeight - containerRect.height) / 2;

                          const { x, y } = positionRef.current;
                          updatePosition(
                            Math.max(
                              -maxTranslateX,
                              Math.min(maxTranslateX, x),
                            ),
                            Math.max(
                              -maxTranslateY,
                              Math.min(maxTranslateY, y),
                            ),
                          );
                        }
                      }}
                      disabled={imageZoom <= 1}
                    >
                      <MaterialSymbol>zoom_out</MaterialSymbol>
                    </IconButton>
                    <Text fontSize="sm" minW="60px" textAlign="center">
                      {Math.round(imageZoom * 100)}%
                    </Text>
                    <IconButton
                      aria-label={t("imageGenerator.zoomIn")}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newZoom = Math.min(5, zoomRef.current + 0.25);
                        updateZoom(newZoom);

                        // Clamp position when zooming
                        if (imageContainerRef.current) {
                          const container = imageContainerRef.current;
                          const containerRect =
                            container.getBoundingClientRect();
                          const imageWidth = containerRect.width * newZoom;
                          const imageHeight = containerRect.height * newZoom;
                          const maxTranslateX =
                            (imageWidth - containerRect.width) / 2;
                          const maxTranslateY =
                            (imageHeight - containerRect.height) / 2;

                          const { x, y } = positionRef.current;
                          updatePosition(
                            Math.max(
                              -maxTranslateX,
                              Math.min(maxTranslateX, x),
                            ),
                            Math.max(
                              -maxTranslateY,
                              Math.min(maxTranslateY, y),
                            ),
                          );
                        }
                      }}
                      disabled={imageZoom >= 5}
                    >
                      <MaterialSymbol>zoom_in</MaterialSymbol>
                    </IconButton>
                    <IconButton
                      aria-label={t("imageGenerator.resetZoom")}
                      size="sm"
                      variant="outline"
                      onClick={resetImageView}
                      disabled={
                        imageZoom === 1 &&
                        positionRef.current.x === 0 &&
                        positionRef.current.y === 0
                      }
                    >
                      <MaterialSymbol>refresh</MaterialSymbol>
                    </IconButton>
                  </HStack>
                  <Text alignSelf="center" fontSize="xs" opacity={0.6}>
                    {t("imageGenerator.scrollToZoom")}
                  </Text>
                </HStack>
                <HStack justify="flex-end" gap={2}>
                  {previewImage && !isSvgGeneratedImage(previewImage) && (
                    <Button
                      type="button"
                      variant="outline"
                      colorPalette="primary"
                      onClick={() => previewImage && handleEdit(previewImage)}
                    >
                      <MaterialSymbol>edit</MaterialSymbol>
                      {t("imageGenerator.editWithAI")}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => previewImage && handleDownload(previewImage)}
                  >
                    <MaterialSymbol>download</MaterialSymbol>
                    {t("imageGenerator.download")}
                  </Button>
                  <Button
                    type="button"
                    colorPalette="red"
                    variant="outline"
                    onClick={() =>
                      previewImage && handleDelete(previewImage.id)
                    }
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                    {t("imageGenerator.delete")}
                  </Button>
                </HStack>
              </Dialog.Footer>

              <Dialog.CloseTrigger asChild>
                <CloseButton />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        header={t("imageGenerator.deleteConfirmHeader")}
        handle={confirmDelete}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        <Text>{t("imageGenerator.deleteConfirmText")}</Text>
      </AlertDialog>

      {/* Local Save Settings Dialog */}
      {isDesktopApp && (
        <Dialog.Root
          open={showSettingsDialog}
          onOpenChange={(e) => setShowSettingsDialog(e.open)}
          size="md"
        >
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>Local Save Settings</Dialog.Title>
              </Dialog.Header>
              <Dialog.CloseTrigger />
              <Dialog.Body>
                <VStack gap={4} align="stretch">
                  <VStack align="stretch" gap={2}>
                    <Text fontWeight="bold">Current Save Location</Text>
                    <Text fontSize="sm" opacity={0.7} wordBreak="break-all">
                      {localSavePath || "Not set"}
                    </Text>
                  </VStack>
                  <Text fontSize="sm" opacity={0.7}>
                    Images are automatically saved locally in a date-based
                    folder structure (YYYY/MM-DD) with metadata included in both
                    the filename and a JSON sidecar file.
                  </Text>
                </VStack>
              </Dialog.Body>
              <Dialog.Footer justifyContent="space-between">
                <Button variant="outline" onClick={handleOpenSaveFolder}>
                  <MaterialSymbol>folder_open</MaterialSymbol>
                  Open Folder
                </Button>
                <Button colorPalette="primary" onClick={handleChangeSavePath}>
                  <MaterialSymbol>edit</MaterialSymbol>
                  Change Location
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Dialog.Root>
      )}
    </VStack>
  );
}
