"use client";

import {
  Box,
  Button,
  Card,
  Center,
  chakra,
  HStack,
  IconButton,
  ScrollArea,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Empty, MaterialSymbol } from "@konfi/components";
import { SCROLL_MASK_CSS } from "@konfi/utils";
import { useAuth } from "context/auth";
import { useConfiguration } from "context/configuration";
import { useCourierNavigation } from "context/courier-navigation";
import { useNotes } from "context/notes";
import { uniq } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

// Local minimal type declarations for the Shape Detection API (Barcode Detector)
// Some TS lib.dom versions may not include these yet.
type BarcodeFormat =
  | "aztec"
  | "code_39"
  | "code_93"
  | "code_128"
  | "codabar"
  | "data_matrix"
  | "ean_13"
  | "ean_8"
  | "itf"
  | "pdf417"
  | "qr_code"
  | "upc_a"
  | "upc_e"
  | "unknown";

interface BarcodeDetectorOptions {
  formats?: BarcodeFormat[];
}

interface DetectedBarcode {
  boundingBox: DOMRectReadOnly;
  rawValue: string;
  format: BarcodeFormat;
  cornerPoints?: ReadonlyArray<{ x: number; y: number }>;
}

// Minimal TS typings for the Shape Detection API without declaring a global value
interface BarcodeDetectorInstance {
  detect: (image: ImageBitmapSource) => Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: BarcodeDetectorOptions): BarcodeDetectorInstance;
  getSupportedFormats?: () => Promise<BarcodeFormat[]>;
}

const getBarcodeDetectorApi = (): BarcodeDetectorConstructor | undefined => {
  // Access the runtime API safely and with types, without colliding with component name
  return typeof window !== "undefined"
    ? (
        globalThis as unknown as {
          BarcodeDetector?: BarcodeDetectorConstructor;
        }
      ).BarcodeDetector
    : undefined;
};

export type BarcodeDetectorProps = {
  // Desired formats to use for detection; defaults to browser-supported formats
  formats?: BarcodeFormat[];
  // Called when detection completes (successfully or with no results)
  onDetected?: (barcodes: DetectedBarcode[]) => void;
  // Ignore duplicate scans of the same code within a short time window
  ignoreDuplicates?: boolean;
  // Time window (ms) for duplicate suppression when ignoreDuplicates is true
  dedupeWindowMs?: number;
};

const VideoEl = chakra("video");
const CanvasEl = chakra("canvas");

export default function BarcodeDetector({
  formats,
  onDetected,
  ignoreDuplicates = true,
  dedupeWindowMs = 6000,
}: BarcodeDetectorProps) {
  const { t } = useTranslation();
  const { openMenu } = useCourierNavigation();
  const { user } = useAuth();
  const { members } = useConfiguration();
  const { notes } = useNotes();
  const [isSupported, setIsSupported] = useState<boolean>(false);
  const [supportedFormats, setSupportedFormats] = useState<
    BarcodeFormat[] | null
  >(null);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [lastBarcodes, setLastBarcodes] = useState<DetectedBarcode[] | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Visible overlay canvas for drawing bounding boxes
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [scanning, setScanning] = useState<boolean>(false);
  const scanTimerRef = useRef<number | null>(null);
  const scanningRef = useRef<boolean>(false);
  const detectingRef = useRef<boolean>(false);
  // Track recent detections to prevent accidental duplicate scans
  const recentDetectionsRef = useRef<Map<string, number>>(new Map());
  const [hasScroll, setHasScroll] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Keep last detections for redraws on resize
  const lastDetectionsRef = useRef<DetectedBarcode[] | null>(null);
  // Success animation state
  const [showSuccessAnimation, setShowSuccessAnimation] =
    useState<boolean>(false);
  const successAnimationRef = useRef<number | null>(null);
  const userEmail = user?.email?.toLowerCase() ?? null;
  const memberIdForUser = useMemo(() => {
    if (!members || !userEmail) {
      return null;
    }
    const matchedMember = members.find(
      (member) => member.email?.toLowerCase() === userEmail,
    );
    return matchedMember?.id ?? null;
  }, [members, userEmail]);
  const scopedNoteCount = useMemo(() => {
    if (!notes || !memberIdForUser) {
      return 0;
    }
    return notes.filter((note) => note.carriedOutBy?.includes(memberIdForUser))
      .length;
  }, [notes, memberIdForUser]);

  useEffect(() => {
    const checkScroll = () => {
      if (viewportRef.current) {
        const hasVerticalScroll =
          viewportRef.current.scrollHeight > viewportRef.current.clientHeight;
        setHasScroll(hasVerticalScroll);
      }
    };

    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [lastBarcodes?.length]);

  // Check support on mount
  useEffect(() => {
    const supported =
      typeof window !== "undefined" && !!getBarcodeDetectorApi();
    setIsSupported(supported);
  }, []);

  // Fetch supported formats if available
  useEffect(() => {
    let isActive = true;
    if (isSupported) {
      const ctor = getBarcodeDetectorApi();
      if (typeof ctor?.getSupportedFormats === "function") {
        ctor
          .getSupportedFormats()
          .then((list) => {
            if (!isActive) return;
            setSupportedFormats(list as BarcodeFormat[]);
          })
          .catch(() => {
            if (!isActive) return;
            setSupportedFormats(null);
          });
      }
    }
    return () => {
      isActive = false;
    };
  }, [isSupported]);

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((t) => t.stop());
      }
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      if (successAnimationRef.current) {
        clearTimeout(successAnimationRef.current);
        successAnimationRef.current = null;
      }
      // Clear overlay when unmounting
      const overlay = overlayCanvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
    };
  }, [cameraStream]);

  // Keep refs in sync
  useEffect(() => {
    scanningRef.current = scanning;
  }, [scanning]);
  useEffect(() => {
    detectingRef.current = isDetecting;
  }, [isDetecting]);

  // Helper function to format barcode display
  const formatBarcodeForDisplay = useCallback((barcode: DetectedBarcode) => {
    const formatNames: Record<BarcodeFormat, string> = {
      aztec: "Aztec",
      code_39: "Code 39",
      code_93: "Code 93",
      code_128: "Code 128",
      codabar: "Codabar",
      data_matrix: "Data Matrix",
      ean_13: "EAN-13",
      ean_8: "EAN-8",
      itf: "ITF",
      pdf417: "PDF417",
      qr_code: "QR Code",
      upc_a: "UPC-A",
      upc_e: "UPC-E",
      unknown: "Unknown",
    };

    const formatName = formatNames[barcode.format] || barcode.format;
    const value = barcode.rawValue;

    // Truncate very long values for display
    const displayValue =
      value.length > 50 ? `${value.substring(0, 47)}...` : value;

    return {
      formatName,
      displayValue,
      fullValue: value,
    };
  }, []);

  // Show success animation
  const showSuccessCheckmark = useCallback(() => {
    if (successAnimationRef.current) {
      clearTimeout(successAnimationRef.current);
    }

    setShowSuccessAnimation(true);
    successAnimationRef.current = window.setTimeout(() => {
      setShowSuccessAnimation(false);
      successAnimationRef.current = null;
    }, 1500); // Show for 1.5 seconds
  }, []);

  const effectiveFormats = useMemo<BarcodeFormat[] | undefined>(() => {
    if (formats && formats.length) return formats;
    return supportedFormats ?? undefined;
  }, [formats, supportedFormats]);

  const startCamera = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage(t("delivery.cameraApiNotSupported"));
        return;
      }
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: "environment" },
          width: { min: 640, ideal: 960, max: 1280 },
          height: { min: 800, ideal: 1440, max: 1920 },
          aspectRatio: { ideal: 9 / 16 },
        },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream as MediaStream;
      setCameraStream(stream);
      // Reset previously scanned barcodes and duplicate tracking on new camera session
      setLastBarcodes(null);
      recentDetectionsRef.current.clear();
      // Ensure metadata is ready to get correct dimensions; don't block UI on this
      void video.play();
      if (video.readyState >= 1) {
        setCameraActive(true);
      } else {
        video.onloadedmetadata = () => setCameraActive(true);
      }
      setMessage(null);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setMessage(
        t("delivery.unableToStartCamera", {
          error: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
    }
    const video = videoRef.current;
    if (video) {
      (video as unknown as { srcObject: MediaStream | null }).srcObject = null;
    }
    // Ensure scanning stops when camera is stopped
    if (scanTimerRef.current) {
      clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (scanning) {
      setScanning(false);
    }
    setCameraStream(null);
    setCameraActive(false);
    // Clear overlay when camera stops
    const overlay = overlayCanvasRef.current;
    if (overlay) {
      const ctx = overlay.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }, [cameraStream, scanning]);

  // Stop scanning if camera stops
  useEffect(() => {
    if (!cameraStream && scanning) {
      if (scanTimerRef.current) {
        clearInterval(scanTimerRef.current);
        scanTimerRef.current = null;
      }
      setScanning(false);
    }
  }, [cameraStream, scanning]);

  const detectFromVideo = useCallback(async () => {
    if (!isSupported) {
      setMessage(t("delivery.barcodeApiNotSupported"));
      return;
    }
    const video = videoRef.current;
    if (!video || !cameraStream) {
      setMessage(t("delivery.startCameraFirst"));
      return;
    }
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setMessage(t("delivery.cameraNotReady"));
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);
    try {
      setIsDetecting(true);
      const Ctor = getBarcodeDetectorApi();
      if (!Ctor) {
        setMessage(t("delivery.barcodeApiNotSupported"));
        return;
      }
      const detector = new Ctor(
        effectiveFormats ? { formats: effectiveFormats } : undefined,
      );
      const results: DetectedBarcode[] = await detector.detect(canvas);

      // Draw overlay boxes for current frame results (no dedupe)
      const drawOverlay = (detections: DetectedBarcode[]) => {
        lastDetectionsRef.current = detections;
        const overlay = overlayCanvasRef.current;
        const v = videoRef.current;
        if (!overlay || !v) return;
        const octx = overlay.getContext("2d");
        if (!octx) return;
        // Handle HiDPI scaling so drawing uses CSS pixels
        const dpr = window.devicePixelRatio || 1;
        // Ensure canvas size matches viewport
        const cssW = window.innerWidth;
        const cssH = window.innerHeight;
        if (
          overlay.width !== Math.floor(cssW * dpr) ||
          overlay.height !== Math.floor(cssH * dpr)
        ) {
          overlay.width = Math.floor(cssW * dpr);
          overlay.height = Math.floor(cssH * dpr);
          overlay.style.width = "100vw";
          overlay.style.height = "100vh";
        }
        octx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Clear
        octx.clearRect(0, 0, cssW, cssH);
        // Compute mapping from video coordinates -> viewport (object-fit: cover)
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (!vw || !vh) return;
        const s = Math.max(cssW / vw, cssH / vh);
        const offsetX = (cssW - vw * s) / 2;
        const offsetY = (cssH - vh * s) / 2;

        const stroke = "rgba(0, 255, 153, 0.95)";
        octx.lineWidth = 2;
        octx.strokeStyle = stroke;
        octx.fillStyle = "rgba(0,0,0,0.35)";
        octx.font = "14px ui-sans-serif, system-ui, -apple-system";
        octx.textBaseline = "top";

        for (const b of detections) {
          const box = b.boundingBox;
          if (b.cornerPoints && b.cornerPoints.length >= 4) {
            octx.beginPath();
            b.cornerPoints.forEach((p, idx) => {
              const x = p.x * s + offsetX;
              const y = p.y * s + offsetY;
              if (idx === 0) octx.moveTo(x, y);
              else octx.lineTo(x, y);
            });
            octx.closePath();
            octx.stroke();
          } else {
            const x = box.x * s + offsetX;
            const y = box.y * s + offsetY;
            const w = box.width * s;
            const h = box.height * s;
            octx.strokeRect(x, y, w, h);
          }
          // Label (format + value) near the top-left of the box
          const label = `${b.format}${b.rawValue ? ": " + b.rawValue : ""}`;
          const lx = box.x * s + offsetX + 4;
          const ly = box.y * s + offsetY + 4;
          // Background for readability
          const metrics = octx.measureText(label);
          const padX = 6;
          const padY = 2;
          const textW = metrics.width + padX * 2;
          const textH = 16 + padY * 2;
          octx.fillRect(lx - padX, ly - padY, textW, textH);
          octx.fillStyle = "white";
          octx.fillText(label, lx, ly);
          octx.fillStyle = "rgba(0,0,0,0.35)"; // restore for next bg
        }
      };
      drawOverlay(results);

      // De-duplicate recently seen barcodes within a time window
      const now = Date.now();
      const windowMs = Math.max(0, dedupeWindowMs ?? 0);
      const recent = recentDetectionsRef.current;

      // Purge expired entries
      if (recent.size > 0) {
        for (const [key, ts] of recent) {
          if (now - ts > windowMs) recent.delete(key);
        }
      }

      const keyOf = (b: DetectedBarcode) => `${b.format}:${b.rawValue}`;
      const newResults = results.filter((b) => {
        if (!ignoreDuplicates) return true;
        const key = keyOf(b);
        const last = recent.get(key);
        if (last !== undefined && now - last <= windowMs) return false;
        // Mark as seen now
        recent.set(key, now);
        return true;
      });

      if (newResults.length === 0) {
        // No new barcodes (duplicates only)
        setMessage(
          results.length > 0
            ? t("delivery.duplicateBarcodesIgnored")
            : t("delivery.noBarcodes"),
        );
        // Do not update lastBarcodes or stop scanning to avoid noisy UI
        return;
      }

      setLastBarcodes((prev) =>
        prev ? uniq([...prev, ...newResults]) : newResults,
      );
      onDetected?.(newResults);
      setMessage(t("delivery.foundBarcodes", { count: newResults.length }));

      // Show success animation for new scans
      showSuccessCheckmark();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      setMessage(
        t("delivery.barcodeDetectionFailed", {
          error: err instanceof Error ? err.message : "Unknown error",
        }),
      );
    } finally {
      setIsDetecting(false);
    }
  }, [cameraStream, effectiveFormats, isSupported, onDetected]);

  const startScanning = useCallback(() => {
    if (!cameraStream) {
      setMessage(t("delivery.startCameraFirst"));
      return;
    }
    if (scanning) return;
    setScanning(true);
    setMessage(null);
    scanTimerRef.current = window.setInterval(async () => {
      if (detectingRef.current) return;
      // Perform a single frame detection; errors handled inside
      await detectFromVideo();
    }, 500);
  }, [cameraStream, scanning, detectFromVideo]);

  // Auto-start scanning when camera becomes active
  useEffect(() => {
    if (cameraActive && cameraStream && !scanning) {
      startScanning();
    }
  }, [cameraActive, cameraStream, scanning, startScanning]);

  // Redraw overlay on window resize
  useEffect(() => {
    const handleResize = () => {
      const detections = lastDetectionsRef.current ?? [];
      // Trigger a redraw using latest detections
      const v = videoRef.current;
      const overlay = overlayCanvasRef.current;
      if (!v || !overlay) return;
      const octx = overlay.getContext("2d");
      if (!octx) return;
      // Use same draw logic as in detect function
      const dpr = window.devicePixelRatio || 1;
      const cssW = window.innerWidth;
      const cssH = window.innerHeight;
      overlay.width = Math.floor(cssW * dpr);
      overlay.height = Math.floor(cssH * dpr);
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, cssW, cssH);
      if (!v.videoWidth || !v.videoHeight) return;
      const s = Math.max(cssW / v.videoWidth, cssH / v.videoHeight);
      const offsetX = (cssW - v.videoWidth * s) / 2;
      const offsetY = (cssH - v.videoHeight * s) / 2;
      octx.lineWidth = 2;
      octx.strokeStyle = "rgba(0, 255, 153, 0.95)";
      octx.fillStyle = "rgba(0,0,0,0.35)";
      octx.font = "14px ui-sans-serif, system-ui, -apple-system";
      octx.textBaseline = "top";
      for (const b of detections) {
        const box = b.boundingBox;
        if (b.cornerPoints && b.cornerPoints.length >= 4) {
          octx.beginPath();
          b.cornerPoints.forEach((p, idx) => {
            const x = p.x * s + offsetX;
            const y = p.y * s + offsetY;
            if (idx === 0) octx.moveTo(x, y);
            else octx.lineTo(x, y);
          });
          octx.closePath();
          octx.stroke();
        } else {
          const x = box.x * s + offsetX;
          const y = box.y * s + offsetY;
          const w = box.width * s;
          const h = box.height * s;
          octx.strokeRect(x, y, w, h);
        }
        const label = `${b.format}${b.rawValue ? ": " + b.rawValue : ""}`;
        const lx = box.x * s + offsetX + 4;
        const ly = box.y * s + offsetY + 4;
        const metrics = octx.measureText(label);
        const padX = 6;
        const padY = 2;
        const textW = metrics.width + padX * 2;
        const textH = 16 + padY * 2;
        octx.fillRect(lx - padX, ly - padY, textW, textH);
        octx.fillStyle = "white";
        octx.fillText(label, lx, ly);
        octx.fillStyle = "rgba(0,0,0,0.35)";
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fullscreen layout with video background and overlays
  return (
    <Box position="fixed" inset={0} w="100vw" h="100vh" zIndex={0}>
      {/* Background video filling the viewport */}
      <VideoEl
        ref={videoRef}
        autoPlay
        playsInline
        muted
        position="fixed"
        top={0}
        left={0}
        w="100vw"
        h="100vh"
        objectFit="cover"
        zIndex={0}
        bg="black"
      />

      {/* Visible overlay canvas for bounding boxes */}
      <CanvasEl
        ref={overlayCanvasRef}
        position="fixed"
        top={0}
        left={0}
        w="100vw"
        h="100vh"
        pointerEvents="none"
        zIndex={1}
      />

      {/* Success checkmark animation overlay */}
      {showSuccessAnimation && (
        <Center
          position="fixed"
          inset={0}
          zIndex={10}
          pointerEvents="none"
          animation="fadeInScale 1.5s ease-out forwards"
          css={{
            "@keyframes fadeInScale": {
              "0%": {
                opacity: 0,
                transform: "scale(0.3)",
              },
              "20%": {
                opacity: 1,
                transform: "scale(1.1)",
              },
              "40%": {
                opacity: 1,
                transform: "scale(1)",
              },
              "80%": {
                opacity: 1,
                transform: "scale(1)",
              },
              "100%": {
                opacity: 0,
                transform: "scale(1)",
              },
            },
          }}
        >
          <Box
            w="120px"
            h="120px"
            borderRadius="full"
            bg="success.500"
            display="flex"
            alignItems="center"
            justifyContent="center"
            boxShadow="0 0 40px {colors.success.500/60}"
          >
            {/* Checkmark SVG */}
            <svg
              width="60"
              height="60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </Box>
        </Center>
      )}

      {/* Offscreen canvas for frame capture */}
      <CanvasEl ref={canvasRef} display="none" />

      {/* UI overlays */}
      <Box position="fixed" inset={0} zIndex={2} p={4}>
        {/* No-camera overlay */}
        {!cameraStream && (
          <Center position="absolute" inset={0}>
            <Box>
              {isSupported ? (
                <Empty
                  title={t("delivery.noCamera")}
                  description={t("delivery.cameraNotActive")}
                  icon="qr_code_scanner"
                  fontSize="80px"
                />
              ) : (
                <Empty
                  title={t("delivery.barcodeApiNotSupported")}
                  description={t("delivery.barcodeApiNotSupportedDescription")}
                  icon="qr_code_scanner"
                />
              )}
            </Box>
          </Center>
        )}

        {/* Results list overlay (top-right) */}
        <Box
          position="absolute"
          top={4}
          right={4}
          w={{ base: "90vw", md: "420px" }}
          maxH={{ base: "40vh", md: "60vh" }}
        >
          <VStack
            w="100%"
            maxH="inherit"
            bg="black/40"
            borderRadius="3xl"
            p={3}
            backdropFilter="auto"
            backdropBlur="4px"
          >
            <ScrollArea.Root>
              <ScrollArea.Viewport
                ref={viewportRef}
                css={hasScroll ? SCROLL_MASK_CSS : undefined}
              >
                <ScrollArea.Content spaceY="2">
                  {lastBarcodes &&
                    !isEmpty(lastBarcodes) &&
                    lastBarcodes.map((barcode, index) => {
                      const formatted = formatBarcodeForDisplay(barcode);
                      return (
                        <Card.Root
                          key={index}
                          size="sm"
                          w="100%"
                          bg="white/10"
                          border="1px solid"
                          borderColor="white/20"
                          borderRadius="2xl"
                        >
                          <Card.Body py={3} px={4}>
                            <VStack align="stretch" gap={1}>
                              <Text
                                fontSize="xs"
                                color="white/70"
                                fontWeight="medium"
                              >
                                {formatted.formatName}
                              </Text>
                              <Text
                                fontSize="sm"
                                color="white"
                                fontFamily="mono"
                                wordBreak="break-all"
                                title={formatted.fullValue}
                              >
                                {formatted.displayValue}
                              </Text>
                            </VStack>
                          </Card.Body>
                        </Card.Root>
                      );
                    })}
                </ScrollArea.Content>
              </ScrollArea.Viewport>
            </ScrollArea.Root>
          </VStack>
        </Box>

        {/* Bottom control bar */}
        <HStack
          px={0}
          position="absolute"
          bottom={4}
          left={4}
          right={4}
          w="auto"
          gap={2}
          zIndex={20}
        >
          {!cameraActive && (
            <Button
              w="82%"
              size="xl"
              fontSize="lg"
              py={8}
              onClick={() => {
                startCamera();
              }}
              disabled={cameraActive}
              variant="solid"
              colorPalette="primary"
            >
              {t("delivery.startScanning")}
            </Button>
          )}
          {cameraActive && (
            <Button
              w="82%"
              size="xl"
              fontSize="lg"
              py={8}
              onClick={() => {
                stopCamera();
              }}
              disabled={!cameraActive}
              variant="subtle"
              colorPalette="red"
            >
              {t("delivery.stopScanning")}
            </Button>
          )}
          <Box position="relative" w="18%">
            <IconButton
              w="100%"
              size="xl"
              fontSize="2xl"
              py={8}
              onClick={openMenu}
              colorPalette="primary"
              aria-label={t("delivery.openMenu", { defaultValue: "Open menu" })}
            >
              <MaterialSymbol>menu</MaterialSymbol>
            </IconButton>
            {scopedNoteCount > 0 && (
              <Center
                position="absolute"
                top={1}
                right={1}
                w="32px"
                h="32px"
                borderRadius="full"
                bg="amber.400"
                color="black"
                fontSize="sm"
                fontWeight="semibold"
                borderWidth="2px"
                borderColor="white"
                shadow="lg"
              >
                {scopedNoteCount}
              </Center>
            )}
          </Box>
        </HStack>
      </Box>
    </Box>
  );
}
