"use client";

import { useT } from "@/i18n/client";
import {
  Badge,
  Button,
  Card,
  createListCollection,
  FileUpload,
  Grid,
  GridItem,
  HStack,
  Input,
  Link,
  Portal,
  Select,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CustomHeading,
  Field,
  MaterialSymbol,
  NumberInputField,
  NumberInputRoot,
  toaster,
} from "@konfi/components";
import { isElectron } from "@konfi/utils";
import { useCallback, useEffect, useState } from "react";

interface ConversionJob {
  id: string;
  status: "pending" | "converting" | "success" | "error";
  inputFile: string;
  outputDir: string;
  message?: string;
  files?: string[];
}

type OutputFormat = "tiff" | "png" | "jpg" | "pdf";

const getStatusColor = (status: ConversionJob["status"]) => {
  switch (status) {
    case "pending":
      return "gray";
    case "converting":
      return "blue";
    case "success":
      return "success";
    case "error":
      return "red";
    default:
      return "gray";
  }
};

export default function FileConvertPage() {
  const { t } = useT();
  const [isElectronApp, setIsElectronApp] = useState(false);
  const [systemReady, setSystemReady] = useState(false);
  const [systemMessage, setSystemMessage] = useState("");
  const [checkingSystem, setCheckingSystem] = useState(true);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [format, setFormat] = useState<OutputFormat>("tiff");
  const [density, setDensity] = useState(300);
  const [compression, setCompression] = useState<
    "none" | "lzw" | "jpeg" | "packbits"
  >("lzw");
  const [pages, setPages] = useState<"all" | "first" | "custom">("all");
  const [customPages, setCustomPages] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [jobs, setJobs] = useState<ConversionJob[]>([]);
  const [pdfInfo, setPdfInfo] = useState<{
    pageCount: number;
    widthInches: number;
    heightInches: number;
    fileSizeBytes: number;
  } | null>(null);
  const [estimatedBytes, setEstimatedBytes] = useState<number | null>(null);
  const [estimatedFiles, setEstimatedFiles] = useState<number | null>(null);

  const formatCollection = createListCollection({
    items: [
      { label: "TIFF", value: "tiff" },
      { label: "PNG", value: "png" },
      { label: "JPG", value: "jpg" },
      {
        label: t("conversion.flattenedPdf", {
          defaultValue: "Flattened PDF",
        }),
        value: "pdf",
      },
    ],
  });

  const pagesCollection = createListCollection({
    items: [
      {
        label: t("conversion.allPages", { defaultValue: "All pages" }),
        value: "all",
      },
      {
        label: t("conversion.firstPage", { defaultValue: "First page only" }),
        value: "first",
      },
      {
        label: t("conversion.customPages", { defaultValue: "Custom pages" }),
        value: "custom",
      },
    ],
  });

  const compressionCollection = createListCollection({
    items: [
      {
        label: t("conversion.compressionNone", { defaultValue: "None" }),
        value: "none",
      },
      {
        label: t("conversion.compressionLzw", {
          defaultValue: "LZW (Lossless)",
        }),
        value: "lzw",
      },
      {
        label: t("conversion.compressionJpeg", {
          defaultValue: "JPEG (Lossy)",
        }),
        value: "jpeg",
      },
      {
        label: t("conversion.compressionPackbits", {
          defaultValue: "PackBits",
        }),
        value: "packbits",
      },
    ],
  });

  useEffect(() => {
    const checkElectron = async () => {
      const electron = isElectron();
      setIsElectronApp(electron);

      if (electron) {
        if (window.konfiDesktop?.fileConversion.checkSystemRequirements) {
          try {
            const result =
              await window.konfiDesktop.fileConversion.checkSystemRequirements();
            console.log(result);
            setSystemReady(result.isReady);
            setSystemMessage(result.message);
          } catch {
            setSystemReady(false);
            setSystemMessage(
              t("conversion.unableToCheckRequirements", {
                defaultValue: "Unable to check system requirements",
              }),
            );
          }
        }
      }
      setCheckingSystem(false);
    };

    checkElectron();
  }, [t]);

  // Save uploaded PDF to temp and read basic info for estimation
  useEffect(() => {
    const prepareInfo = async () => {
      try {
        if (!isElectronApp) return;
        if (!uploadedFiles || uploadedFiles.length === 0) {
          setPdfInfo(null);
          return;
        }
        const pdfFile = uploadedFiles[0];
        if (!window.konfiDesktop?.fileConversion.stageUploadedPdf) {
          setPdfInfo(null);
          return;
        }
        const staged =
          await window.konfiDesktop.fileConversion.stageUploadedPdf(pdfFile);
        if (!staged.success || !staged.uploadId) {
          setPdfInfo(null);
          return;
        }

        if (window.konfiDesktop?.fileConversion.inspectPdf) {
          const info = await window.konfiDesktop.fileConversion.inspectPdf(
            staged.uploadId,
          );
          if (info?.success) {
            setPdfInfo({
              pageCount: info.pageCount || 1,
              widthInches: info.widthInches || 8.27,
              heightInches: info.heightInches || 11.69,
              fileSizeBytes: info.fileSizeBytes || 0,
            });
          } else {
            setPdfInfo(null);
          }
        } else {
          setPdfInfo(null);
        }
      } catch {
        setPdfInfo(null);
      }
    };

    void prepareInfo();
  }, [uploadedFiles, isElectronApp]);

  const formatBytes = useCallback((bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"] as const;
    let i = 0;
    let val = bytes;
    while (val >= 1024 && i < units.length - 1) {
      val /= 1024;
      i++;
    }
    return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: val < 10 ? 2 : 1 }).format(val)} ${units[i]}`;
  }, []);

  // Recompute estimate whenever options or pdf info changes
  useEffect(() => {
    if (!pdfInfo || pdfInfo.widthInches <= 0 || pdfInfo.heightInches <= 0) {
      setEstimatedBytes(null);
      setEstimatedFiles(null);
      return;
    }

    // Determine pages to convert
    let pageNums: number[];
    if (pages === "first") {
      pageNums = [1];
    } else if (pages === "custom" && customPages.trim().length > 0) {
      pageNums = customPages
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (pageNums.length === 0) pageNums = [1];
    } else {
      pageNums = Array.from(
        { length: Math.max(1, pdfInfo.pageCount) },
        (_v, i) => i + 1,
      );
    }

    const widthPx = Math.max(1, Math.round(pdfInfo.widthInches * density));
    const heightPx = Math.max(1, Math.round(pdfInfo.heightInches * density));
    const pixelsPerPage = widthPx * heightPx;

    // Calculate uncompressed size. TIFF output is CMYK composite, while PNG/JPG
    // estimates use 24-bit RGB.
    const bytesPerPixel = format === "tiff" ? 4 : 3;
    const uncompressedBytes = pixelsPerPage * bytesPerPixel;

    // Apply compression ratio based on format/settings
    // These ratios are based on real-world document conversions
    const compressionRatio = (() => {
      if (format === "pdf") return 0.6;
      if (format === "png") return 0.35; // PNG typically 30-40% of uncompressed
      if (format === "jpg") return 0.15; // JPEG at default quality ~10-20%
      // TIFF variants
      switch (compression) {
        case "none":
          return 1.0; // No compression
        case "packbits":
          return 0.75; // PackBits ~70-80%
        case "jpeg":
          return 0.2; // JPEG in TIFF ~15-25%
        case "lzw":
        default:
          return 0.4; // LZW typically 35-45% for documents
      }
    })();

    const perFileOverhead = 50_000; // TIFF/PNG header and metadata
    const perPageBytes = Math.round(
      uncompressedBytes * compressionRatio + perFileOverhead,
    );
    const totalBytes = perPageBytes * pageNums.length;

    setEstimatedFiles(format === "pdf" ? 1 : pageNums.length);
    setEstimatedBytes(totalBytes);
  }, [pdfInfo, density, format, compression, pages, customPages]);

  const handleSelectOutputDir = useCallback(async () => {
    if (!window.konfiDesktop?.fileConversion.pickOutputDirectory) return;
    const dir = await window.konfiDesktop.fileConversion.pickOutputDirectory();
    if (dir) {
      setOutputDir(dir);
    }
  }, []);

  const handleConvert = useCallback(async () => {
    if (!window.konfiDesktop?.fileConversion.convertPdf) {
      toaster.error({
        title: t("error.notAvailable", { defaultValue: "Not available" }),
        description: t("error.electronOnly", {
          defaultValue: "This feature is only available in the desktop app",
        }),
      });
      return;
    }

    if (uploadedFiles.length === 0 || !outputDir) {
      toaster.error({
        title: t("conversion.missingFields", {
          defaultValue: "Missing fields",
        }),
        description: t("conversion.selectPdfAndOutput", {
          defaultValue: "Please select a PDF file and output directory",
        }),
      });
      return;
    }

    let pagesOption: number | number[] | "all" = "all";
    if (pages === "first") {
      pagesOption = 1;
    } else if (pages === "custom" && customPages) {
      const pageNumbers = customPages
        .split(",")
        .map((p) => parseInt(p.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);
      if (pageNumbers.length > 0) {
        pagesOption = pageNumbers;
      }
    }

    const filesToConvert = [...uploadedFiles];
    const timestamp = Date.now();
    const jobsToAdd: ConversionJob[] = filesToConvert.map((file, index) => ({
      id: `job-${timestamp}-${index}`,
      status: "pending",
      inputFile: file.name,
      outputDir,
    }));

    setJobs((prev) => [...jobsToAdd, ...prev]);
    setIsConverting(true);

    try {
      for (const [index, pdfFile] of filesToConvert.entries()) {
        const jobId = jobsToAdd[index].id;

        try {
          const staged =
            await window.konfiDesktop.fileConversion.stageUploadedPdf(pdfFile);
          if (!staged.success || !staged.uploadId) {
            throw new Error(
              staged.message ??
                t("conversion.failedToSaveFile", {
                defaultValue: "Failed to save uploaded file",
                }),
            );
          }

          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId ? { ...j, status: "converting" as const } : j,
            ),
          );

          const result = await window.konfiDesktop.fileConversion.convertPdf(
            staged.uploadId,
            outputDir,
            {
              pages: pagesOption,
              density,
              format,
              compression: format === "tiff" ? compression : undefined,
            },
          );

          const generatedFiles = Array.isArray(result.files)
            ? result.files
            : [];
          if (result.success) {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      status: "success" as const,
                      message: result.message,
                      files: generatedFiles,
                    }
                  : j,
              ),
            );

            toaster.success({
              title: t("conversion.success", {
                defaultValue: "Conversion successful",
              }),
              description: t("conversion.filesGenerated", {
                defaultValue: "Generated {{count}} file(s)",
                count: generatedFiles.length,
              }),
            });
          } else {
            const errorMessage =
              result.message ||
              t("conversion.unknownError", {
                defaultValue: "Unknown error occurred",
              });

            setJobs((prev) =>
              prev.map((j) =>
                j.id === jobId
                  ? {
                      ...j,
                      status: "error" as const,
                      message: errorMessage,
                    }
                  : j,
              ),
            );

            toaster.error({
              title: t("conversion.failed", {
                defaultValue: "Conversion failed",
              }),
              description: errorMessage,
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : t("conversion.unknownError", {
                  defaultValue: "Unknown error occurred",
                });

          setJobs((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? {
                    ...j,
                    status: "error" as const,
                    message: errorMessage,
                  }
                : j,
            ),
          );

          toaster.error({
            title: t("conversion.failed", {
              defaultValue: "Conversion failed",
            }),
            description: errorMessage,
          });
        }
      }
    } finally {
      setIsConverting(false);
    }
  }, [
    uploadedFiles,
    outputDir,
    format,
    density,
    compression,
    pages,
    customPages,
    t,
  ]);

  if (!isElectronApp) {
    return (
      <>
        <CustomHeading
          heading={t("tools.fileConvert", { defaultValue: "Convert files" })}
          mb={"8"}
          breadcrumb={true}
          goBack={true}
          t={t}
        />
        <Card.Root>
          <Card.Body>
            <VStack gap={4} align={"center"} py={8}>
              <MaterialSymbol fontSize={64} color={"gray.400"}>
                desktop_windows
              </MaterialSymbol>
              <Text fontSize={"lg"} fontWeight={"medium"}>
                {t("electron.desktopOnly", {
                  defaultValue: "Desktop App Only",
                })}
              </Text>
              <Text color={"gray.600"} textAlign={"center"}>
                {t("electron.desktopOnlyDescription", {
                  defaultValue:
                    "This feature requires the desktop app to access the file system and PDF conversion tools.",
                })}
              </Text>
            </VStack>
          </Card.Body>
        </Card.Root>
      </>
    );
  }

  return (
    <>
      <CustomHeading
        heading={t("tools.fileConvert", { defaultValue: "Convert files" })}
        mb={"8"}
        breadcrumb={true}
        goBack={true}
        t={t}
      />

      {/* System Requirements Warning */}
      {!checkingSystem && !systemReady && (
        <Card.Root mb={6} colorPalette={"orange"} variant={"subtle"}>
          <Card.Body>
            <VStack gap={3} align={"start"}>
              <HStack>
                <MaterialSymbol color={"orange.600"}>warning</MaterialSymbol>
                <Text
                  fontSize={"lg"}
                  fontWeight={"semibold"}
                  color={"orange.700"}
                >
                  {t("conversion.systemNotReady", {
                    defaultValue: "System Requirements Not Met",
                  })}
                </Text>
              </HStack>
              <Text color={"orange.700"}>{systemMessage}</Text>
              <Text fontSize={"sm"} color={"gray.700"}>
                {t("conversion.installInstructions", {
                  defaultValue: "Please install Ghostscript:",
                })}
              </Text>
              <Stack gap={2} fontSize={"sm"} color={"gray.700"} pl={4}>
                <Text>
                  <strong>
                    {t("electron.installInstructions.windowsLabel", {
                      defaultValue: "Windows:",
                    })}
                  </strong>{" "}
                  {t("electron.installInstructions.windows", {
                    defaultValue: "Download from",
                  })}{" "}
                  <Link
                    href="https://www.ghostscript.com/releases/gsdnld.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    textDecoration="underline"
                  >
                    ghostscript.com
                  </Link>
                </Text>
                <Text>
                  <strong>
                    {t("electron.installInstructions.macosLabel", {
                      defaultValue: "macOS:",
                    })}
                  </strong>{" "}
                  <code>
                    {t("electron.installInstructions.macos", {
                      defaultValue: "brew install ghostscript",
                    })}
                  </code>
                </Text>
                <Text>
                  <strong>
                    {t("electron.installInstructions.linuxLabel", {
                      defaultValue: "Linux:",
                    })}
                  </strong>{" "}
                  <code>
                    {t("electron.installInstructions.linux", {
                      defaultValue: "sudo apt-get install ghostscript",
                    })}
                  </code>
                </Text>
              </Stack>
              <Text fontSize={"sm"} color={"gray.600"} fontStyle={"italic"}>
                {t("conversion.restartRequired", {
                  defaultValue: "After installation, restart the desktop app.",
                })}
              </Text>
            </VStack>
          </Card.Body>
        </Card.Root>
      )}

      <Grid templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} gap={6}>
        <GridItem>
          <Card.Root>
            <Card.Header>
              <Card.Title>
                {t("conversion.pdfToImage", {
                  defaultValue: "PDF Conversion",
                })}
              </Card.Title>
              <Card.Description>
                {t("conversion.pdfToImageDescription", {
                  defaultValue:
                    "Convert PDF files to images or flattened PDF files",
                })}
              </Card.Description>
            </Card.Header>
            <Card.Body>
              <Stack gap={4}>
                {/* PDF File Upload */}
                <Field
                  label={t("conversion.pdfFile", { defaultValue: "PDF File" })}
                  required
                >
                  <FileUpload.Root
                    maxFiles={10}
                    accept=".pdf"
                    onFileChange={(details) => {
                      setUploadedFiles(details.acceptedFiles);
                    }}
                  >
                    <FileUpload.HiddenInput />
                    <FileUpload.Dropzone w="100%">
                      <MaterialSymbol>upload</MaterialSymbol>
                      <FileUpload.DropzoneContent>
                        {t("conversion.dropzoneLabel", {
                          defaultValue: "Drag and drop PDF file here",
                        })}
                        <Text color="fg.muted" fontSize="sm">
                          {t("conversion.dropzoneDescription", {
                            defaultValue: "or click to browse",
                          })}
                        </Text>
                      </FileUpload.DropzoneContent>
                    </FileUpload.Dropzone>
                    <FileUpload.List showSize clearable />
                  </FileUpload.Root>
                </Field>

                {/* Output Directory */}
                <Field
                  label={t("conversion.outputDir", {
                    defaultValue: "Output Directory",
                  })}
                  required
                >
                  <HStack>
                    <Input
                      value={outputDir}
                      readOnly
                      placeholder={t("conversion.selectOutput", {
                        defaultValue: "Select output directory...",
                      })}
                    />
                    <Button onClick={handleSelectOutputDir} variant={"outline"}>
                      <MaterialSymbol>folder_open</MaterialSymbol>
                      {t("common.browse", { defaultValue: "Browse" })}
                    </Button>
                  </HStack>
                </Field>

                {/* Format Selection */}
                <Field
                  label={t("conversion.format", {
                    defaultValue: "Output Format",
                  })}
                >
                  <Select.Root
                    collection={formatCollection}
                    value={[format]}
                    onValueChange={(e) => setFormat(e.value[0] as OutputFormat)}
                    size="sm"
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {formatCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </Field>

                {/* Pages Selection */}
                <Field
                  label={t("conversion.pages", {
                    defaultValue: "Pages to Convert",
                  })}
                >
                  <Select.Root
                    collection={pagesCollection}
                    value={[pages]}
                    onValueChange={(e) =>
                      setPages(e.value[0] as "all" | "first" | "custom")
                    }
                    size="sm"
                  >
                    <Select.HiddenSelect />
                    <Select.Control>
                      <Select.Trigger>
                        <Select.ValueText />
                      </Select.Trigger>
                      <Select.IndicatorGroup>
                        <Select.Indicator />
                      </Select.IndicatorGroup>
                    </Select.Control>
                    <Portal>
                      <Select.Positioner>
                        <Select.Content>
                          {pagesCollection.items.map((item) => (
                            <Select.Item key={item.value} item={item}>
                              {item.label}
                              <Select.ItemIndicator />
                            </Select.Item>
                          ))}
                        </Select.Content>
                      </Select.Positioner>
                    </Portal>
                  </Select.Root>
                </Field>

                {pages === "custom" && (
                  <Field
                    label={t("conversion.pageNumbers", {
                      defaultValue: "Page Numbers",
                    })}
                    helperText={t("conversion.pageNumbersHelp", {
                      defaultValue:
                        "Enter page numbers separated by commas (e.g., 1,3,5)",
                    })}
                  >
                    <Input
                      value={customPages}
                      onChange={(e) => setCustomPages(e.target.value)}
                      placeholder={t("conversion.pageNumbersPlaceholder", {
                        defaultValue: "1,3,5",
                      })}
                    />
                  </Field>
                )}

                {/* Resolution */}
                <Field
                  label={t("conversion.resolution", {
                    defaultValue: "Resolution (DPI)",
                  })}
                  helperText={t("conversion.resolutionHelp", {
                    defaultValue:
                      "Higher values improve image output and rasterized flattened regions, but create larger files",
                  })}
                >
                  <NumberInputRoot
                    value={density.toString()}
                    onValueChange={(e) =>
                      setDensity(parseInt(e.value, 10) || 300)
                    }
                    min={72}
                    max={1200}
                    step={50}
                  >
                    <NumberInputField />
                  </NumberInputRoot>
                </Field>

                {/* Compression (TIFF only) */}
                {format === "tiff" && (
                  <Field
                    label={t("conversion.compression", {
                      defaultValue: "Compression",
                    })}
                  >
                    <Select.Root
                      collection={compressionCollection}
                      value={[compression]}
                      onValueChange={(e) =>
                        setCompression(
                          e.value[0] as "none" | "lzw" | "jpeg" | "packbits",
                        )
                      }
                      size="sm"
                    >
                      <Select.HiddenSelect />
                      <Select.Control>
                        <Select.Trigger>
                          <Select.ValueText />
                        </Select.Trigger>
                        <Select.IndicatorGroup>
                          <Select.Indicator />
                        </Select.IndicatorGroup>
                      </Select.Control>
                      <Portal>
                        <Select.Positioner>
                          <Select.Content>
                            {compressionCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item}>
                                {item.label}
                                <Select.ItemIndicator />
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                  </Field>
                )}

                {format === "pdf" && (
                  <HStack
                    align="start"
                    gap={3}
                    p={3}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor="border.muted"
                    bg="bg.subtle"
                  >
                    <MaterialSymbol color="fg.muted">
                      layers_clear
                    </MaterialSymbol>
                    <Stack gap={1}>
                      <Text fontWeight="medium">
                        {t("conversion.flattenedPdfTitle", {
                          defaultValue: "Flatten Transparency",
                        })}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        {t("conversion.flattenedPdfDescription", {
                          defaultValue:
                            "Creates a PDF 1.3 file with transparent artwork rendered into opaque page content for RIP compatibility.",
                        })}
                      </Text>
                    </Stack>
                  </HStack>
                )}

                {/* Estimated output size */}
                {pdfInfo &&
                  estimatedBytes !== null &&
                  estimatedFiles !== null && (
                    <HStack justify="space-between" color="gray.700" mt={2}>
                      <Text fontSize="sm">
                        {t("conversion.estimateLabel", {
                          defaultValue: "Estimated output",
                        })}
                        :
                      </Text>
                      <HStack>
                        <Badge colorPalette="gray" variant="solid">
                          {formatBytes(estimatedBytes)}
                        </Badge>
                        <Text fontSize="sm" color="gray.600">
                          ({estimatedFiles}{" "}
                          {t("conversion.files", { defaultValue: "file(s)" })} @{" "}
                          {density} DPI)
                        </Text>
                      </HStack>
                    </HStack>
                  )}

                {/* Convert Button */}
                <Button
                  colorPalette={"primary"}
                  onClick={handleConvert}
                  loading={isConverting}
                  disabled={
                    uploadedFiles.length === 0 ||
                    !outputDir ||
                    isConverting ||
                    !systemReady
                  }
                  mt={4}
                >
                  <MaterialSymbol>transform</MaterialSymbol>
                  {t("conversion.convert", { defaultValue: "Convert" })}
                </Button>
              </Stack>
            </Card.Body>
          </Card.Root>
        </GridItem>

        <GridItem>
          <Card.Root>
            <Card.Header>
              <Card.Title>
                {t("conversion.conversionHistory", {
                  defaultValue: "Conversion History",
                })}
              </Card.Title>
            </Card.Header>
            <Card.Body>
              {jobs.length === 0 ? (
                <VStack gap={4} py={8}>
                  <MaterialSymbol fontSize={48} color={"gray.400"}>
                    history
                  </MaterialSymbol>
                  <Text color={"gray.500"}>
                    {t("conversion.noHistory", {
                      defaultValue: "No conversions yet",
                    })}
                  </Text>
                </VStack>
              ) : (
                <VStack gap={3} align={"stretch"}>
                  {jobs.map((job) => (
                    <Card.Root key={job.id}>
                      <Card.Body>
                        <VStack gap={2} align={"stretch"}>
                          <HStack justify={"space-between"}>
                            <Badge colorPalette={getStatusColor(job.status)}>
                              {t(`conversion.status.${job.status}`, {
                                defaultValue: job.status,
                              })}
                            </Badge>
                            {job.files && job.files.length > 0 && (
                              <Text fontSize={"xs"} color={"gray.600"}>
                                {job.files.length}{" "}
                                {t("conversion.files", {
                                  defaultValue: "file(s)",
                                })}
                              </Text>
                            )}
                          </HStack>
                          <Text
                            fontSize={"sm"}
                            fontWeight={"medium"}
                            lineClamp={1}
                          >
                            {job.inputFile.split(/[\\/]/).pop()}
                          </Text>
                          {job.message && (
                            <Text fontSize={"xs"} color={"gray.600"}>
                              {job.message}
                            </Text>
                          )}
                          {job.files && job.files.length > 0 && (
                            <VStack gap={1} align={"stretch"} mt={2}>
                              {job.files.map((file, idx) => (
                                <Text
                                  key={idx}
                                  fontSize={"xs"}
                                  color={"gray.500"}
                                  lineClamp={1}
                                >
                                  📄 {file.split(/[\\/]/).pop()}
                                </Text>
                              ))}
                            </VStack>
                          )}
                        </VStack>
                      </Card.Body>
                    </Card.Root>
                  ))}
                </VStack>
              )}
            </Card.Body>
          </Card.Root>
        </GridItem>
      </Grid>
    </>
  );
}
