"use client";

import { useT } from "@/i18n/client";
import {
  Box,
  Button,
  Heading,
  HStack,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ButtonLink, MaterialSymbol } from "@konfi/components";
import { ADMIN_CONFIG } from "@konfi/utils";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  VISUAL_ONBOARDING_RESTART_EVENT,
  VISUAL_ONBOARDING_STORAGE_KEY,
  VISUAL_ONBOARDING_STORAGE_VERSION,
  VISUAL_ONBOARDING_TARGETS,
  type VisualOnboardingTargetId,
} from "./visual-onboarding-targets";

type VisualOnboardingStoredStatus = "active" | "completed" | "skipped";
type VisualOnboardingAdvanceMode = "target-click" | "next" | "complete-click";

type VisualOnboardingStoredState = {
  status: VisualOnboardingStoredStatus;
  stepId?: string;
  version: number;
};

type VisualOnboardingStep = {
  advanceMode: VisualOnboardingAdvanceMode;
  descriptionDefault: string;
  icon: string;
  id: string;
  requiredPath?: string;
  targetId: VisualOnboardingTargetId;
  titleDefault: string;
};

type TargetRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type TargetStatus = "pending" | "found" | "missing";
export type SpotlightCorner =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right";

const TARGET_PADDING = 10;
const HOLE_RADIUS = 28;
const PANEL_GAP = 28;
const PANEL_MARGIN = 16;
const PANEL_ESTIMATED_HEIGHT = 360;
const PANEL_MIN_USABLE_HEIGHT = 320;
const OVERLAY_Z_INDEX = 2300;
const ROUTE_RECOVERY_DELAY = 650;
const TARGET_RETRY_DELAYS = [0, 120, 300, 600, 1000, 1600, 2400] as const;

const SPOTLIGHT_CORNER_ORIGINS: Record<SpotlightCorner, string> = {
  "bottom-left": "top right",
  "bottom-right": "top left",
  "top-left": "bottom right",
  "top-right": "bottom left",
};

const STEPS: VisualOnboardingStep[] = [
  {
    advanceMode: "target-click",
    descriptionDefault:
      "Open the settings menu. It groups the admin areas that control setup, catalog, feature previews, and release notes.",
    icon: "settings",
    id: "settingsTrigger",
    targetId: VISUAL_ONBOARDING_TARGETS.settingsTrigger,
    titleDefault: "Start with Settings",
  },
  {
    advanceMode: "target-click",
    descriptionDefault:
      "Configuration is where you prepare the store foundation before teams create orders or products.",
    icon: "toggle_on",
    id: "settingsConfiguration",
    targetId: VISUAL_ONBOARDING_TARGETS.settingsConfiguration,
    titleDefault: "Open Configuration",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Channels define where orders and storefront content belong. Start here when the store needs a sales channel, currency, storefront editor, or order folder setup.",
    icon: "share",
    id: "configChannels",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configChannels,
    titleDefault: "Create sales channels",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Store settings control broad storefront and checkout behavior. Use this area for store-wide defaults before publishing products.",
    icon: "settings",
    id: "configStore",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configStore,
    titleDefault: "Review store settings",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "CMS settings manage storefront hero content and pages. This is where the storefront presentation starts to match the business.",
    icon: "database",
    id: "configCms",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configCms,
    titleDefault: "Prepare storefront content",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Attributes describe configurable product options such as paper, format, color, size, or finishing.",
    icon: "edit_attributes",
    id: "configAttributes",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configAttributes,
    titleDefault: "Define product attributes",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Product types group attributes into reusable product setups, so products can be built consistently without repeating the same structure.",
    icon: "token",
    id: "configProductTypes",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configProductTypes,
    titleDefault: "Build product types",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Warehouses connect pickup addresses, stock, fulfillment, and channel logistics. Configure them before enabling pickup or production flows.",
    icon: "warehouse",
    id: "configWarehouses",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configWarehouses,
    titleDefault: "Set up warehouses",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Shipping methods define delivery choices and carrier semantics used by checkout and order handling.",
    icon: "local_shipping",
    id: "configShipping",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configShipping,
    titleDefault: "Configure shipping",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Payment methods control how customers pay and which checkout options are available for each shipping scenario.",
    icon: "payments",
    id: "configPayment",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configPayment,
    titleDefault: "Configure payment",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Taxes and regions keep checkout totals, invoices, and tax snapshots aligned with the store's selling rules.",
    icon: "receipt_long",
    id: "configTaxes",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configTaxes,
    titleDefault: "Review taxes and regions",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Order and file statuses define the workflow that new orders enter, including initial states and production columns.",
    icon: "view_kanban",
    id: "configWorkflow",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configWorkflow,
    titleDefault: "Shape the order workflow",
  },
  {
    advanceMode: "next",
    descriptionDefault:
      "Complaints and notes settings prepare support taxonomy for claims, reprints, returns, priorities, and internal follow-up.",
    icon: "support_agent",
    id: "configSupportTaxonomy",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.configSupportTaxonomy,
    titleDefault: "Prepare support workflows",
  },
  {
    advanceMode: "target-click",
    descriptionDefault:
      "Open Settings again to move from store configuration into product and category management.",
    icon: "settings",
    id: "settingsTriggerCatalog",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.settingsTrigger,
    titleDefault: "Return to Settings",
  },
  {
    advanceMode: "complete-click",
    descriptionDefault:
      "Catalog is where teams create categories and products after the store foundation is ready.",
    icon: "inventory_2",
    id: "settingsCatalog",
    requiredPath: ADMIN_CONFIG,
    targetId: VISUAL_ONBOARDING_TARGETS.settingsCatalog,
    titleDefault: "Finish in Catalog",
  },
];

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizeRoutePath(path: string) {
  const normalized = path.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function normalizePathname(pathname: string | null, lng?: string) {
  if (!pathname) return "/";

  if (!lng) return normalizeRoutePath(pathname);

  const withoutLng = pathname.replace(new RegExp(`^/${lng}(?=/|$)`), "");
  return normalizeRoutePath(withoutLng);
}

function readStoredState(): VisualOnboardingStoredState | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(VISUAL_ONBOARDING_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<VisualOnboardingStoredState>;
    if (parsed.version !== VISUAL_ONBOARDING_STORAGE_VERSION) return null;

    if (
      parsed.status !== "active" &&
      parsed.status !== "completed" &&
      parsed.status !== "skipped"
    ) {
      return null;
    }

    return {
      status: parsed.status,
      stepId: typeof parsed.stepId === "string" ? parsed.stepId : undefined,
      version: parsed.version,
    };
  } catch (error) {
    console.error("Failed to read visual onboarding state:", error);
    return null;
  }
}

function writeStoredState(state: VisualOnboardingStoredState) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      VISUAL_ONBOARDING_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch (error) {
    console.error("Failed to write visual onboarding state:", error);
  }
}

function getStoredStepIndex(stepId: string | undefined) {
  if (!stepId) return 0;

  const index = STEPS.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

function toTargetRect(rect: DOMRect): TargetRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function isUsableRect(rect: DOMRect | TargetRect) {
  return rect.width > 0 && rect.height > 0;
}

function findTargetElement(targetId: VisualOnboardingTargetId) {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>(
      `[data-onboarding-id="${targetId}"]`,
    ),
  );

  return (
    elements.find((element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();

      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        isUsableRect(rect)
      );
    }) ??
    elements[0] ??
    null
  );
}

function closestOnboardingTarget(
  eventTarget: EventTarget | null,
  targetId: VisualOnboardingTargetId,
) {
  if (!eventTarget || typeof eventTarget !== "object") return null;

  const maybeElement = eventTarget as {
    closest?: unknown;
  };

  if (typeof maybeElement.closest !== "function") return null;

  const closest = maybeElement.closest as (selector: string) => Element | null;
  return closest.call(eventTarget, `[data-onboarding-id="${targetId}"]`);
}

function getHole(
  rect: TargetRect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const top = clamp(rect.top - TARGET_PADDING, 0, viewportHeight);
  const left = clamp(rect.left - TARGET_PADDING, 0, viewportWidth);
  const right = clamp(rect.right + TARGET_PADDING, left, viewportWidth);
  const bottom = clamp(rect.bottom + TARGET_PADDING, top, viewportHeight);

  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
  };
}

export function getSpotlightCornerMask(
  corner: SpotlightCorner,
  radius: number,
) {
  const origin = SPOTLIGHT_CORNER_ORIGINS[corner];

  return `radial-gradient(circle at ${origin}, transparent 0 ${radius}px, black ${radius}px)`;
}

function getPanelPosition(
  rect: TargetRect,
  viewportWidth: number,
  viewportHeight: number,
) {
  const panelWidth = Math.min(
    480,
    Math.max(280, viewportWidth - PANEL_MARGIN * 2),
  );
  const left = clamp(
    rect.left + rect.width / 2 - panelWidth / 2,
    PANEL_MARGIN,
    Math.max(PANEL_MARGIN, viewportWidth - panelWidth - PANEL_MARGIN),
  );
  const availableAbove = Math.max(0, rect.top - PANEL_GAP - PANEL_MARGIN);
  const availableBelow = Math.max(
    0,
    viewportHeight - rect.bottom - PANEL_GAP - PANEL_MARGIN,
  );
  const availableLeft = Math.max(0, rect.left - PANEL_GAP - PANEL_MARGIN);
  const availableRight = Math.max(
    0,
    viewportWidth - rect.right - PANEL_GAP - PANEL_MARGIN,
  );

  if (
    Math.max(availableAbove, availableBelow) < PANEL_MIN_USABLE_HEIGHT &&
    Math.max(availableLeft, availableRight) >= panelWidth
  ) {
    const sideLeft =
      availableLeft >= availableRight
        ? rect.left - PANEL_GAP - panelWidth
        : rect.right + PANEL_GAP;

    return {
      left: clamp(
        sideLeft,
        PANEL_MARGIN,
        viewportWidth - panelWidth - PANEL_MARGIN,
      ),
      maxHeight: Math.min(
        PANEL_ESTIMATED_HEIGHT,
        viewportHeight - PANEL_MARGIN * 2,
      ),
      top: clamp(
        rect.top + rect.height / 2 - PANEL_ESTIMATED_HEIGHT / 2,
        PANEL_MARGIN,
        Math.max(
          PANEL_MARGIN,
          viewportHeight - PANEL_ESTIMATED_HEIGHT - PANEL_MARGIN,
        ),
      ),
      width: panelWidth,
    };
  }

  if (availableBelow >= availableAbove) {
    const maxHeight = Math.min(PANEL_ESTIMATED_HEIGHT, availableBelow);

    return {
      left,
      maxHeight,
      top: rect.bottom + PANEL_GAP,
      width: panelWidth,
    };
  }

  const maxHeight = Math.min(PANEL_ESTIMATED_HEIGHT, availableAbove);

  return {
    left,
    maxHeight,
    top: Math.max(PANEL_MARGIN, rect.top - PANEL_GAP - maxHeight),
    width: panelWidth,
  };
}

export default function VisualOnboarding({
  paused = false,
}: {
  paused?: boolean;
}) {
  const { t, i18n } = useT();
  const pathname = usePathname();
  const params = useParams<{ lng?: string }>();
  const lng = params?.lng ?? i18n.resolvedLanguage;
  const normalizedPathname = useMemo(
    () => normalizePathname(pathname, lng),
    [pathname, lng],
  );
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [routeRecoveryReady, setRouteRecoveryReady] = useState(false);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [targetStatus, setTargetStatus] = useState<TargetStatus>("pending");
  const [targetLookupAttempt, setTargetLookupAttempt] = useState(0);
  const [viewportSize, setViewportSize] = useState({ height: 0, width: 0 });

  const activeStep =
    activeStepIndex === null ? null : (STEPS[activeStepIndex] ?? null);
  const routeMatches =
    !activeStep?.requiredPath || normalizedPathname === activeStep.requiredPath;

  const setActiveStep = useCallback((nextIndex: number) => {
    const nextStep = STEPS[nextIndex] ?? STEPS[0];
    const resolvedIndex = STEPS.indexOf(nextStep);

    setTargetStatus("pending");
    setActiveStepIndex(resolvedIndex);
    writeStoredState({
      status: "active",
      stepId: nextStep.id,
      version: VISUAL_ONBOARDING_STORAGE_VERSION,
    });
  }, []);

  const hideTour = useCallback(
    (status: Exclude<VisualOnboardingStoredStatus, "active">) => {
      setActiveStepIndex(null);
      writeStoredState({
        status,
        version: VISUAL_ONBOARDING_STORAGE_VERSION,
      });
    },
    [],
  );

  const completeTour = useCallback(() => hideTour("completed"), [hideTour]);
  const skipTour = useCallback(() => hideTour("skipped"), [hideTour]);
  const retryTargetSearch = useCallback(() => {
    setTargetStatus("pending");
    setTargetLookupAttempt((attempt) => attempt + 1);
  }, []);

  const goNext = useCallback(() => {
    if (activeStepIndex === null) return;

    const nextIndex = activeStepIndex + 1;
    if (nextIndex >= STEPS.length) {
      completeTour();
      return;
    }

    setActiveStep(nextIndex);
  }, [activeStepIndex, completeTour, setActiveStep]);

  const goBack = useCallback(() => {
    if (activeStepIndex === null || activeStepIndex === 0) return;
    setActiveStep(activeStepIndex - 1);
  }, [activeStepIndex, setActiveStep]);

  useEffect(() => {
    if (paused || isInitialized) return;

    const storedState = readStoredState();

    if (!storedState) {
      setActiveStep(0);
      setIsInitialized(true);
      return;
    }

    if (storedState.status === "active") {
      setActiveStep(getStoredStepIndex(storedState.stepId));
    }

    setIsInitialized(true);
  }, [isInitialized, paused, setActiveStep]);

  useEffect(() => {
    const handleRestart = () => setActiveStep(0);

    window.addEventListener(VISUAL_ONBOARDING_RESTART_EVENT, handleRestart);
    return () => {
      window.removeEventListener(
        VISUAL_ONBOARDING_RESTART_EVENT,
        handleRestart,
      );
    };
  }, [setActiveStep]);

  useEffect(() => {
    if (paused || !activeStep || routeMatches) {
      setRouteRecoveryReady(false);
      return;
    }

    setRouteRecoveryReady(false);
    const timeoutId = window.setTimeout(
      () => setRouteRecoveryReady(true),
      ROUTE_RECOVERY_DELAY,
    );

    return () => window.clearTimeout(timeoutId);
  }, [activeStep, paused, routeMatches]);

  useEffect(() => {
    if (paused || !activeStep || !routeMatches) {
      setTargetStatus("pending");
      return;
    }

    let activeRunId = 0;
    let hasFoundTarget = false;
    let isDisposed = false;
    const activeTargetId = activeStep.targetId;
    const frameIds = new Set<number>();
    const timeoutIds = new Set<number>();
    setTargetStatus("pending");

    const updateViewportSize = () => {
      setViewportSize({
        height: window.innerHeight,
        width: window.innerWidth,
      });
    };

    const scheduleMeasure = (
      runId: number,
      attempt: number,
      scrollTarget: boolean,
    ) => {
      const delay = TARGET_RETRY_DELAYS[attempt] ?? 0;
      const timeoutId = window.setTimeout(() => {
        timeoutIds.delete(timeoutId);
        measure(runId, attempt, scrollTarget);
      }, delay);

      timeoutIds.add(timeoutId);
    };

    const retryOrMarkMissing = (
      runId: number,
      attempt: number,
      scrollTarget: boolean,
    ) => {
      if (isDisposed || runId !== activeRunId) return;

      if (attempt < TARGET_RETRY_DELAYS.length - 1) {
        scheduleMeasure(runId, attempt + 1, scrollTarget);
        return;
      }

      setTargetRect(null);
      setTargetStatus("missing");
    };

    const startMeasurement = (scrollTarget: boolean, resetStatus: boolean) => {
      activeRunId += 1;

      if (resetStatus) {
        setTargetStatus("pending");
      }

      scheduleMeasure(activeRunId, 0, scrollTarget);
    };

    function measure(runId: number, attempt: number, scrollTarget: boolean) {
      if (isDisposed || runId !== activeRunId) return;

      const target = findTargetElement(activeTargetId);
      updateViewportSize();

      if (!target) {
        retryOrMarkMissing(runId, attempt, scrollTarget);
        return;
      }

      if (scrollTarget) {
        try {
          target.scrollIntoView({
            behavior: "auto",
            block: "center",
            inline: "center",
          });
        } catch {
          target.scrollIntoView();
        }
      }

      if (typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }

      const frameId = window.requestAnimationFrame(() => {
        frameIds.delete(frameId);
        if (isDisposed || runId !== activeRunId) return;

        const rect = target.getBoundingClientRect();

        if (!isUsableRect(rect)) {
          retryOrMarkMissing(runId, attempt, scrollTarget);
          return;
        }

        hasFoundTarget = true;
        setTargetRect(toTargetRect(rect));
        setTargetStatus("found");
      });

      frameIds.add(frameId);
    }

    startMeasurement(true, true);

    const handleViewportChange = () => {
      if (!hasFoundTarget) return;
      startMeasurement(false, false);
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      isDisposed = true;
      frameIds.forEach((frameId) => window.cancelAnimationFrame(frameId));
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeStep, paused, routeMatches, targetLookupAttempt]);

  useEffect(() => {
    if (
      paused ||
      !activeStep ||
      activeStep.advanceMode === "next" ||
      !routeMatches
    ) {
      return;
    }

    let handledEvent: MouseEvent | null = null;
    let directTarget: HTMLElement | null = null;
    const timeoutIds: number[] = [];
    const handleTargetClick = (event: MouseEvent) => {
      if (handledEvent === event) return;

      const target = closestOnboardingTarget(event.target, activeStep.targetId);

      if (!target) return;
      handledEvent = event;

      if (activeStep.advanceMode === "complete-click") {
        completeTour();
        return;
      }

      goNext();
    };

    const bindDirectTarget = () => {
      const nextTarget = findTargetElement(activeStep.targetId);
      if (directTarget === nextTarget) return;

      directTarget?.removeEventListener("click", handleTargetClick, true);
      directTarget = nextTarget;
      directTarget?.addEventListener("click", handleTargetClick, true);
    };

    bindDirectTarget();
    timeoutIds.push(window.setTimeout(bindDirectTarget, 180));
    document.addEventListener("click", handleTargetClick, true);
    return () => {
      directTarget?.removeEventListener("click", handleTargetClick, true);
      document.removeEventListener("click", handleTargetClick, true);
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [activeStep, completeTour, goNext, paused, routeMatches]);

  useEffect(() => {
    if (paused || !activeStep) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        skipTour();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeStep, paused, skipTour]);

  if (paused || !isInitialized || !activeStep || activeStepIndex === null) {
    return null;
  }

  const title = t(`visualOnboarding.steps.${activeStep.id}.title`, {
    defaultValue: activeStep.titleDefault,
  });
  const description = t(`visualOnboarding.steps.${activeStep.id}.description`, {
    defaultValue: activeStep.descriptionDefault,
  });
  const progressLabel = t("visualOnboarding.progress", {
    current: activeStepIndex + 1,
    defaultValue: "{{current}} of {{total}}",
    total: STEPS.length,
  });
  const showRecovery =
    (!routeMatches && routeRecoveryReady) || targetStatus === "missing";

  if (showRecovery) {
    return (
      <Portal>
        <Box
          alignItems="center"
          bg={{ base: "gray.950/70", _dark: "black/80" }}
          backdropFilter="blur(10px)"
          bottom={0}
          display="flex"
          justifyContent="center"
          left={0}
          p={4}
          position="fixed"
          right={0}
          role="dialog"
          top={0}
          zIndex={OVERLAY_Z_INDEX}
        >
          <Stack
            bg={{ base: "white", _dark: "gray.950" }}
            borderColor="border"
            borderRadius="2xl"
            borderWidth="1px"
            boxShadow="2xl"
            gap={4}
            maxW="560px"
            p={{ base: 5, md: 7 }}
          >
            <HStack gap={3}>
              <Box
                alignItems="center"
                bg="primary.subtle"
                borderRadius="full"
                color="primary.fg"
                display="flex"
                h={10}
                justifyContent="center"
                w={10}
              >
                <MaterialSymbol>{activeStep.icon}</MaterialSymbol>
              </Box>
              <Text color="fg.muted" fontSize="sm" fontWeight="medium">
                {progressLabel}
              </Text>
            </HStack>
            <Heading fontSize={{ base: "2xl", md: "3xl" }} lineHeight="1.1">
              {t("visualOnboarding.recovery.title", {
                defaultValue: "Let's get back to the tour",
              })}
            </Heading>
            <Text color="fg.muted">
              {activeStep.requiredPath && !routeMatches
                ? t("visualOnboarding.recovery.pathDescription", {
                    defaultValue:
                      "This step belongs on the Configuration page. Return there to keep the highlighted setup path in view.",
                  })
                : t("visualOnboarding.recovery.targetDescription", {
                    defaultValue:
                      "The highlighted control is still loading or hidden. Try the lookup again, return to the expected page, or skip this tour for this browser.",
                  })}
            </Text>
            <HStack justify="flex-end" wrap="wrap">
              <Button variant="ghost" onClick={skipTour}>
                {t("visualOnboarding.actions.skip", {
                  defaultValue: "Skip",
                })}
              </Button>
              <Button variant="outline" onClick={retryTargetSearch}>
                <MaterialSymbol>refresh</MaterialSymbol>
                {t("visualOnboarding.actions.tryAgain", {
                  defaultValue: "Try again",
                })}
              </Button>
              {activeStep.requiredPath && (
                <ButtonLink
                  ariaLabel={t(
                    "visualOnboarding.actions.returnToConfiguration",
                    {
                      defaultValue: "Return to Configuration",
                    },
                  )}
                  colorPalette="primary"
                  href={activeStep.requiredPath}
                  lng={lng}
                  variant="solid"
                >
                  <MaterialSymbol>arrow_forward</MaterialSymbol>
                  {t("visualOnboarding.actions.returnToConfiguration", {
                    defaultValue: "Return to Configuration",
                  })}
                </ButtonLink>
              )}
            </HStack>
          </Stack>
        </Box>
      </Portal>
    );
  }

  if (!targetRect) {
    return null;
  }

  const viewportWidth = viewportSize.width || window.innerWidth;
  const viewportHeight = viewportSize.height || window.innerHeight;
  const hole = getHole(targetRect, viewportWidth, viewportHeight);
  const holeRadius = Math.min(HOLE_RADIUS, hole.width / 2, hole.height / 2);
  const panelPosition = getPanelPosition(hole, viewportWidth, viewportHeight);
  const overlayColor = {
    base: "gray.950/70",
    _dark: "black/75",
  };
  const overlaySegmentProps = {
    bg: overlayColor,
    backdropFilter: "blur(8px)",
    position: "fixed" as const,
    transition:
      "top 160ms ease, right 160ms ease, bottom 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
    willChange: "top, right, bottom, left, width, height",
    zIndex: OVERLAY_Z_INDEX,
  };
  const overlayCornerProps = {
    ...overlaySegmentProps,
    h: `${holeRadius}px`,
    pointerEvents: "none" as const,
    w: `${holeRadius}px`,
  };
  const overlayCornerMaskRepeat = "no-repeat";

  return (
    <Portal>
      <Box aria-hidden="true">
        <Box
          {...overlaySegmentProps}
          h={`${hole.top}px`}
          left={0}
          right={0}
          top={0}
        />
        <Box
          {...overlaySegmentProps}
          h={`${hole.height}px`}
          left={0}
          top={`${hole.top}px`}
          w={`${hole.left}px`}
        />
        <Box
          {...overlaySegmentProps}
          h={`${hole.height}px`}
          left={`${hole.right}px`}
          right={0}
          top={`${hole.top}px`}
        />
        <Box
          {...overlaySegmentProps}
          bottom={0}
          left={0}
          right={0}
          top={`${hole.bottom}px`}
        />
        {holeRadius > 0 && (
          <>
            <Box
              {...overlayCornerProps}
              data-onboarding-corner="top-left"
              left={`${hole.left}px`}
              style={{
                maskImage: getSpotlightCornerMask("top-left", holeRadius),
                maskRepeat: overlayCornerMaskRepeat,
                WebkitMaskImage: getSpotlightCornerMask("top-left", holeRadius),
                WebkitMaskRepeat: overlayCornerMaskRepeat,
              }}
              top={`${hole.top}px`}
            />
            <Box
              {...overlayCornerProps}
              data-onboarding-corner="top-right"
              left={`${hole.right - holeRadius}px`}
              style={{
                maskImage: getSpotlightCornerMask("top-right", holeRadius),
                maskRepeat: overlayCornerMaskRepeat,
                WebkitMaskImage: getSpotlightCornerMask(
                  "top-right",
                  holeRadius,
                ),
                WebkitMaskRepeat: overlayCornerMaskRepeat,
              }}
              top={`${hole.top}px`}
            />
            <Box
              {...overlayCornerProps}
              data-onboarding-corner="bottom-left"
              left={`${hole.left}px`}
              style={{
                maskImage: getSpotlightCornerMask("bottom-left", holeRadius),
                maskRepeat: overlayCornerMaskRepeat,
                WebkitMaskImage: getSpotlightCornerMask(
                  "bottom-left",
                  holeRadius,
                ),
                WebkitMaskRepeat: overlayCornerMaskRepeat,
              }}
              top={`${hole.bottom - holeRadius}px`}
            />
            <Box
              {...overlayCornerProps}
              data-onboarding-corner="bottom-right"
              left={`${hole.right - holeRadius}px`}
              style={{
                maskImage: getSpotlightCornerMask("bottom-right", holeRadius),
                maskRepeat: overlayCornerMaskRepeat,
                WebkitMaskImage: getSpotlightCornerMask(
                  "bottom-right",
                  holeRadius,
                ),
                WebkitMaskRepeat: overlayCornerMaskRepeat,
              }}
              top={`${hole.bottom - holeRadius}px`}
            />
          </>
        )}
      </Box>
      <Box
        aria-labelledby="visual-onboarding-title"
        bg={{ base: "white", _dark: "gray.950" }}
        borderColor="border"
        borderRadius="2xl"
        borderWidth="1px"
        boxShadow="2xl"
        data-onboarding-panel="true"
        data-onboarding-panel-max-height={Math.round(panelPosition.maxHeight)}
        data-onboarding-panel-top={Math.round(panelPosition.top)}
        left={`${panelPosition.left}px`}
        maxH={`${panelPosition.maxHeight}px`}
        overflowY="auto"
        p={{ base: 5, md: 7 }}
        position="fixed"
        role="dialog"
        top={`${panelPosition.top}px`}
        transition="left 160ms ease, top 160ms ease"
        w={`${panelPosition.width}px`}
        zIndex={OVERLAY_Z_INDEX + 1}
      >
        <Stack gap={5}>
          <HStack align="flex-start" gap={3} justify="space-between">
            <HStack gap={3} minW={0}>
              <Box
                alignItems="center"
                bg="primary.subtle"
                borderRadius="full"
                color="primary.fg"
                display="flex"
                flexShrink={0}
                h={11}
                justifyContent="center"
                w={11}
              >
                <MaterialSymbol>{activeStep.icon}</MaterialSymbol>
              </Box>
              <Text color="fg.muted" fontSize="sm" fontWeight="medium">
                {progressLabel}
              </Text>
            </HStack>
            <Button size="sm" variant="ghost" onClick={skipTour}>
              {t("visualOnboarding.actions.skip", {
                defaultValue: "Skip",
              })}
            </Button>
          </HStack>
          <Stack gap={3}>
            <Heading
              id="visual-onboarding-title"
              fontSize={{ base: "2xl", md: "4xl" }}
              lineHeight="1.05"
            >
              {title}
            </Heading>
            <Text color="fg.muted" fontSize={{ base: "md", md: "lg" }}>
              {description}
            </Text>
          </Stack>
          {activeStep.advanceMode !== "next" && (
            <Text color="fg.muted" fontSize="sm">
              {activeStep.advanceMode === "complete-click"
                ? t("visualOnboarding.clickToFinish", {
                    defaultValue:
                      "Click the highlighted item to open it and finish onboarding.",
                  })
                : t("visualOnboarding.clickToContinue", {
                    defaultValue:
                      "Click the highlighted item to continue onboarding.",
                  })}
            </Text>
          )}
          <HStack justify="space-between" wrap="wrap">
            <Button
              disabled={activeStepIndex === 0}
              onClick={goBack}
              variant="outline"
            >
              <MaterialSymbol>arrow_back</MaterialSymbol>
              {t("visualOnboarding.actions.back", {
                defaultValue: "Back",
              })}
            </Button>
            <HStack>
              {activeStep.advanceMode === "next" && (
                <Button colorPalette="primary" onClick={goNext}>
                  {t("visualOnboarding.actions.next", {
                    defaultValue: "Next",
                  })}
                  <MaterialSymbol>arrow_forward</MaterialSymbol>
                </Button>
              )}
              {activeStep.advanceMode === "complete-click" && (
                <Button colorPalette="primary" onClick={completeTour}>
                  {t("visualOnboarding.actions.finish", {
                    defaultValue: "Finish",
                  })}
                  <MaterialSymbol>check</MaterialSymbol>
                </Button>
              )}
            </HStack>
          </HStack>
        </Stack>
      </Box>
    </Portal>
  );
}
