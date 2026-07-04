"use client";

import {
  exportStarterTemplateAction,
  importStarterTemplateAction,
} from "@/actions/starter-templates";
import { useAuth } from "@/context/auth";
import { useChannels } from "@/context/channels";
import { useT } from "@/i18n/client";
import type {
  StarterTemplateImportResult,
  StarterTemplateManifest,
} from "@/lib/starter-templates";
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Code,
  EmptyState,
  Field,
  FileUpload,
  HStack,
  Input,
  SimpleGrid,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { CustomHeading, MaterialSymbol, toaster } from "@konfi/components";
import { copyTextToClipboard } from "@konfi/utils";
import { useEffect, useMemo, useState } from "react";

function formatManifest(manifest: StarterTemplateManifest): string {
  return JSON.stringify(manifest, null, 2);
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getManifestFileName(manifest: StarterTemplateManifest): string {
  const normalizedName = manifest.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalizedName || "starter-template"}.json`;
}

function parseManifest(text: string): StarterTemplateManifest {
  const parsed: unknown = JSON.parse(text);
  return parsed as StarterTemplateManifest;
}

function getCountEntries(manifest: StarterTemplateManifest | null) {
  if (!manifest) {
    return [];
  }

  return Object.entries(manifest.counts)
    .filter(([, count]) => count > 0)
    .toSorted(([leftResource], [rightResource]) =>
      leftResource.localeCompare(rightResource),
    );
}

export default function StarterTemplatesPage() {
  const { t } = useT();
  const { isSuperAdminClient } = useAuth();
  const { channel } = useChannels();
  const defaultTemplateName = t("starterTemplates.export.defaultTemplateName", {
    defaultValue: "Print shop starter",
  });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [sourceChannelId, setSourceChannelId] = useState(channel?.id ?? "");
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [templateName, setTemplateName] = useState(defaultTemplateName);
  const [manifestText, setManifestText] = useState("");
  const [exportedManifest, setExportedManifest] =
    useState<StarterTemplateManifest | null>(null);
  const [targetChannelId, setTargetChannelId] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [allowOverwrite, setAllowOverwrite] = useState(false);
  const [importResult, setImportResult] =
    useState<StarterTemplateImportResult | null>(null);
  const countEntries = useMemo(
    () => getCountEntries(exportedManifest),
    [exportedManifest],
  );
  const isExportDisabled = !sourceChannelId.trim() || isExporting;
  const isImportDisabled =
    !manifestText.trim() || !targetChannelId.trim() || isImporting;

  useEffect(() => {
    if (!sourceChannelId && channel?.id) {
      setSourceChannelId(channel.id);
    }
  }, [channel?.id, sourceChannelId]);

  async function handleExport() {
    setIsExporting(true);

    try {
      const manifest = await exportStarterTemplateAction({
        name: templateName.trim() || undefined,
        sourceChannelId: sourceChannelId.trim(),
        sourceTenantId: sourceTenantId.trim() || undefined,
      });

      setExportedManifest(manifest);
      setManifestText(formatManifest(manifest));
      setImportResult(null);
      toaster.success({
        title: t("starterTemplates.export.successTitle", {
          defaultValue: "Template exported",
        }),
        description: t("starterTemplates.export.successDescription", {
          count: manifest.resources.length,
          defaultValue: "{{count}} documents are ready for review.",
        }),
      });
    } catch (error) {
      const message = getErrorMessage(
        error,
        t("starterTemplates.unknownError", {
          defaultValue: "Unknown error",
        }),
      );
      toaster.error({
        title: t("starterTemplates.export.errorTitle", {
          defaultValue: "Export failed",
        }),
        description: t("starterTemplates.errorDescription", {
          defaultValue: "{{message}}",
          message,
        }),
      });
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport() {
    setIsImporting(true);

    try {
      const manifest = parseManifest(manifestText);
      const result = await importStarterTemplateAction({
        allowOverwrite,
        channelName: channelName.trim() || undefined,
        manifest,
        targetChannelId: targetChannelId.trim(),
        targetTenantId: targetTenantId.trim() || undefined,
      });

      setImportResult(result);
      toaster.success({
        title: t("starterTemplates.import.successTitle", {
          defaultValue: "Template imported",
        }),
        description: t("starterTemplates.import.successDescription", {
          count: result.documentCount,
          defaultValue: "{{count}} documents were written.",
        }),
      });
    } catch (error) {
      const message = getErrorMessage(
        error,
        t("starterTemplates.unknownError", {
          defaultValue: "Unknown error",
        }),
      );
      toaster.error({
        title: t("starterTemplates.import.errorTitle", {
          defaultValue: "Import failed",
        }),
        description: t("starterTemplates.errorDescription", {
          defaultValue: "{{message}}",
          message,
        }),
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function handleCopyManifest() {
    const result = await copyTextToClipboard(manifestText);

    if (result.status !== "copied") {
      toaster.error({
        title: t("starterTemplates.copy.errorTitle", {
          defaultValue: "Could not copy manifest",
        }),
      });
      return;
    }

    toaster.success({
      title: t("starterTemplates.copy.successTitle", {
        defaultValue: "Manifest copied",
      }),
    });
  }

  function handleDownloadManifest() {
    if (!exportedManifest) {
      return;
    }

    const blob = new Blob([formatManifest(exportedManifest)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getManifestFileName(exportedManifest);
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleManifestFile(files: File[]) {
    const file = files[0];

    if (!file) {
      return;
    }

    setIsReadingFile(true);

    try {
      const text = await file.text();
      parseManifest(text);
      setManifestText(text);
      setExportedManifest(null);
      setImportResult(null);
    } catch (error) {
      const message = getErrorMessage(
        error,
        t("starterTemplates.unknownError", {
          defaultValue: "Unknown error",
        }),
      );
      toaster.error({
        title: t("starterTemplates.file.errorTitle", {
          defaultValue: "Manifest file rejected",
        }),
        description: t("starterTemplates.errorDescription", {
          defaultValue: "{{message}}",
          message,
        }),
      });
    } finally {
      setIsReadingFile(false);
    }
  }

  if (!isSuperAdminClient) {
    return (
      <EmptyState.Root>
        <EmptyState.Content>
          <EmptyState.Indicator>
            <MaterialSymbol fontSize={48}>admin_panel_settings</MaterialSymbol>
          </EmptyState.Indicator>
          <EmptyState.Title>
            {t("starterTemplates.superAdminOnly", {
              defaultValue: "Super Admin only",
            })}
          </EmptyState.Title>
          <EmptyState.Description>
            {t("starterTemplates.superAdminOnlyDescription", {
              defaultValue:
                "Starter template exports and imports are only available to Super Admin users.",
            })}
          </EmptyState.Description>
        </EmptyState.Content>
      </EmptyState.Root>
    );
  }

  return (
    <VStack align="stretch" gap={6}>
      <Box>
        <CustomHeading
          breadcrumb
          goBack
          heading={t("starterTemplates.title", {
            defaultValue: "Starter Templates",
          })}
          t={t}
        />
        <Text color="fg.muted" mt={2}>
          {t("starterTemplates.description", {
            defaultValue:
              "Export a sanitized channel starter and import it into a new tenant channel.",
          })}
        </Text>
      </Box>

      <Alert.Root status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {t("starterTemplates.safety.title", {
              defaultValue: "Review before importing",
            })}
          </Alert.Title>
          <Alert.Description>
            {t("starterTemplates.safety.description", {
              defaultValue:
                "The export blocks live operational data, but the manifest still contains catalog structure, product copy, settings, and prices.",
            })}
          </Alert.Description>
        </Alert.Content>
      </Alert.Root>

      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={4} alignItems="start">
        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("starterTemplates.export.title", {
                defaultValue: "Export Template",
              })}
            </Card.Title>
            <Card.Description>
              {t("starterTemplates.export.description", {
                defaultValue:
                  "Use a curated source channel. Storage objects are not included.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <Box
              as="form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleExport();
              }}
            >
              <VStack align="stretch" gap={4}>
                <Field.Root required>
                  <Field.Label>
                    {t("starterTemplates.export.sourceChannelId", {
                      defaultValue: "Source Channel ID",
                    })}
                    <Field.RequiredIndicator />
                  </Field.Label>
                  <Input
                    name="sourceChannelId"
                    autoComplete="off"
                    spellCheck={false}
                    value={sourceChannelId}
                    onChange={(event) => setSourceChannelId(event.target.value)}
                    placeholder={t(
                      "starterTemplates.export.sourceChannelIdPlaceholder",
                      {
                        defaultValue: "source-channel-id…",
                      },
                    )}
                  />
                </Field.Root>

                <Field.Root>
                  <Field.Label>
                    {t("starterTemplates.export.sourceTenantId", {
                      defaultValue: "Source Tenant ID",
                    })}
                  </Field.Label>
                  <Input
                    name="sourceTenantId"
                    autoComplete="off"
                    spellCheck={false}
                    value={sourceTenantId}
                    onChange={(event) => setSourceTenantId(event.target.value)}
                    placeholder={t(
                      "starterTemplates.export.sourceTenantIdPlaceholder",
                      {
                        defaultValue: "Leave empty for dedicated default…",
                      },
                    )}
                  />
                  <Field.HelperText>
                    {t("starterTemplates.export.sourceTenantIdHelper", {
                      defaultValue:
                        "Required only when exporting from a SaaS tenant context.",
                    })}
                  </Field.HelperText>
                </Field.Root>

                <Field.Root>
                  <Field.Label>
                    {t("starterTemplates.export.templateName", {
                      defaultValue: "Template Name",
                    })}
                  </Field.Label>
                  <Input
                    name="templateName"
                    autoComplete="off"
                    value={templateName}
                    onChange={(event) => setTemplateName(event.target.value)}
                    placeholder={t(
                      "starterTemplates.export.templateNamePlaceholder",
                      {
                        defaultValue: "Print shop starter…",
                      },
                    )}
                  />
                </Field.Root>

                <Button
                  type="submit"
                  colorPalette="primary"
                  loading={isExporting}
                  disabled={isExportDisabled}
                >
                  <MaterialSymbol>upload</MaterialSymbol>
                  {t("starterTemplates.export.action", {
                    defaultValue: "Export Template",
                  })}
                </Button>
              </VStack>
            </Box>
          </Card.Body>
        </Card.Root>

        <Card.Root variant="outline" borderRadius="2xl">
          <Card.Header>
            <Card.Title>
              {t("starterTemplates.import.title", {
                defaultValue: "Import Template",
              })}
            </Card.Title>
            <Card.Description>
              {t("starterTemplates.import.description", {
                defaultValue:
                  "Seed a new tenant/channel from a reviewed manifest.",
              })}
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <Box
              as="form"
              onSubmit={(event) => {
                event.preventDefault();
                void handleImport();
              }}
            >
              <VStack align="stretch" gap={4}>
                <Field.Root required>
                  <Field.Label>
                    {t("starterTemplates.import.targetChannelId", {
                      defaultValue: "Target Channel ID",
                    })}
                    <Field.RequiredIndicator />
                  </Field.Label>
                  <Input
                    name="targetChannelId"
                    autoComplete="off"
                    spellCheck={false}
                    value={targetChannelId}
                    onChange={(event) => setTargetChannelId(event.target.value)}
                    placeholder={t(
                      "starterTemplates.import.targetChannelIdPlaceholder",
                      {
                        defaultValue: "new-channel-id…",
                      },
                    )}
                  />
                </Field.Root>

                <Field.Root>
                  <Field.Label>
                    {t("starterTemplates.import.targetTenantId", {
                      defaultValue: "Target Tenant ID",
                    })}
                  </Field.Label>
                  <Input
                    name="targetTenantId"
                    autoComplete="off"
                    spellCheck={false}
                    value={targetTenantId}
                    onChange={(event) => setTargetTenantId(event.target.value)}
                    placeholder={t(
                      "starterTemplates.import.targetTenantIdPlaceholder",
                      {
                        defaultValue: "tenant-id…",
                      },
                    )}
                  />
                  <Field.HelperText>
                    {t("starterTemplates.import.targetTenantIdHelper", {
                      defaultValue:
                        "Required in SaaS mode. Leave empty for dedicated default imports.",
                    })}
                  </Field.HelperText>
                </Field.Root>

                <Field.Root>
                  <Field.Label>
                    {t("starterTemplates.import.channelName", {
                      defaultValue: "Channel Name",
                    })}
                  </Field.Label>
                  <Input
                    name="channelName"
                    autoComplete="off"
                    value={channelName}
                    onChange={(event) => setChannelName(event.target.value)}
                    placeholder={t(
                      "starterTemplates.import.channelNamePlaceholder",
                      {
                        defaultValue: "Store…",
                      },
                    )}
                  />
                </Field.Root>

                <Checkbox.Root
                  checked={allowOverwrite}
                  onCheckedChange={(details) =>
                    setAllowOverwrite(details.checked === true)
                  }
                >
                  <Checkbox.HiddenInput name="allowOverwrite" />
                  <Checkbox.Control />
                  <Checkbox.Label>
                    {t("starterTemplates.import.allowOverwrite", {
                      defaultValue: "Allow overwriting existing target docs",
                    })}
                  </Checkbox.Label>
                </Checkbox.Root>

                <Button
                  type="submit"
                  colorPalette="primary"
                  loading={isImporting}
                  disabled={isImportDisabled}
                >
                  <MaterialSymbol>download</MaterialSymbol>
                  {t("starterTemplates.import.action", {
                    defaultValue: "Import Template",
                  })}
                </Button>
              </VStack>
            </Box>
          </Card.Body>
        </Card.Root>
      </SimpleGrid>

      <Card.Root variant="outline" borderRadius="2xl">
        <Card.Header>
          <HStack justify="space-between" align="start" gap={3}>
            <Box minW={0}>
              <Card.Title>
                {t("starterTemplates.manifest.title", {
                  defaultValue: "Manifest JSON",
                })}
              </Card.Title>
              <Card.Description>
                {t("starterTemplates.manifest.description", {
                  defaultValue:
                    "Review exported JSON here or paste a manifest to import.",
                })}
              </Card.Description>
            </Box>
            <HStack gap={2} flexWrap="wrap" justify="flex-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!manifestText.trim()}
                onClick={() => void handleCopyManifest()}
              >
                <MaterialSymbol>content_copy</MaterialSymbol>
                {t("starterTemplates.manifest.copy", {
                  defaultValue: "Copy",
                })}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!exportedManifest}
                onClick={handleDownloadManifest}
              >
                <MaterialSymbol>download</MaterialSymbol>
                {t("starterTemplates.manifest.download", {
                  defaultValue: "Download",
                })}
              </Button>
            </HStack>
          </HStack>
        </Card.Header>
        <Card.Body>
          <VStack align="stretch" gap={4}>
            <FileUpload.Root
              accept={["application/json", ".json"]}
              disabled={isReadingFile || isImporting}
              maxFiles={1}
              onFileChange={(details) => {
                void handleManifestFile(details.acceptedFiles);
              }}
              onFileReject={() => {
                toaster.error({
                  title: t("starterTemplates.file.errorTitle", {
                    defaultValue: "Manifest file rejected",
                  }),
                  description: t("starterTemplates.file.rejectedDescription", {
                    defaultValue: "Choose one JSON file.",
                  }),
                });
              }}
            >
              <FileUpload.HiddenInput name="starterTemplateManifestFile" />
              <VStack align="stretch" gap={2}>
                <FileUpload.Label fontSize="sm" fontWeight="medium">
                  {t("starterTemplates.file.label", {
                    defaultValue: "Load Manifest File",
                  })}
                </FileUpload.Label>
                <FileUpload.Dropzone borderRadius="2xl" minH="28" w="100%">
                  <FileUpload.DropzoneContent>
                    <VStack gap={1} textAlign="center">
                      <MaterialSymbol>upload_file</MaterialSymbol>
                      <Text fontSize="sm" fontWeight="medium">
                        {t("starterTemplates.file.dropzoneTitle", {
                          defaultValue: "Drop JSON here or browse",
                        })}
                      </Text>
                      <Text color="fg.muted" fontSize="xs">
                        {t("starterTemplates.file.dropzoneDescription", {
                          defaultValue: "One sanitized starter manifest",
                        })}
                      </Text>
                    </VStack>
                  </FileUpload.DropzoneContent>
                </FileUpload.Dropzone>
              </VStack>
              <FileUpload.List clearable showSize />
            </FileUpload.Root>

            {isReadingFile && (
              <HStack color="fg.muted" gap={2} aria-live="polite">
                <Spinner size="sm" />
                <Text fontSize="sm">
                  {t("starterTemplates.file.reading", {
                    defaultValue: "Reading manifest…",
                  })}
                </Text>
              </HStack>
            )}

            <Field.Root required>
              <Field.Label>
                {t("starterTemplates.manifest.json", {
                  defaultValue: "Manifest JSON",
                })}
                <Field.RequiredIndicator />
              </Field.Label>
              <Textarea
                name="starterTemplateManifest"
                value={manifestText}
                onChange={(event) => {
                  setManifestText(event.target.value);
                  setExportedManifest(null);
                }}
                placeholder={t("starterTemplates.manifest.placeholder", {
                  defaultValue: "Paste starter manifest JSON…",
                })}
                rows={16}
                fontFamily="mono"
                fontSize="sm"
                spellCheck={false}
              />
            </Field.Root>
          </VStack>
        </Card.Body>
      </Card.Root>

      {(exportedManifest || importResult) && (
        <SimpleGrid columns={{ base: 1, lg: 2 }} gap={4} aria-live="polite">
          {exportedManifest && (
            <Card.Root variant="outline" borderRadius="2xl">
              <Card.Header>
                <Card.Title>
                  {t("starterTemplates.export.summaryTitle", {
                    defaultValue: "Export Summary",
                  })}
                </Card.Title>
              </Card.Header>
              <Card.Body>
                <VStack align="stretch" gap={3}>
                  <HStack gap={2} flexWrap="wrap">
                    <Badge colorPalette="blue">
                      {t("starterTemplates.summary.documents", {
                        count: exportedManifest.resources.length,
                        defaultValue: "{{count}} docs",
                      })}
                    </Badge>
                    <Badge colorPalette="purple">
                      {t("starterTemplates.summary.channel", {
                        channelId: exportedManifest.source.channelId,
                        defaultValue: "Channel {{channelId}}",
                      })}
                    </Badge>
                    {exportedManifest.source.tenantId && (
                      <Badge colorPalette="green">
                        {t("starterTemplates.summary.tenant", {
                          defaultValue: "Tenant {{tenantId}}",
                          tenantId: exportedManifest.source.tenantId,
                        })}
                      </Badge>
                    )}
                  </HStack>
                  <HStack gap={2} flexWrap="wrap">
                    {countEntries.map(([resource, count]) => (
                      <Code key={resource} fontSize="xs">
                        {resource}: {count}
                      </Code>
                    ))}
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}

          {importResult && (
            <Card.Root variant="outline" borderRadius="2xl">
              <Card.Header>
                <Card.Title>
                  {t("starterTemplates.import.summaryTitle", {
                    defaultValue: "Import Summary",
                  })}
                </Card.Title>
              </Card.Header>
              <Card.Body>
                <VStack align="stretch" gap={3}>
                  <HStack gap={2} flexWrap="wrap">
                    <Badge colorPalette="green">
                      {t("starterTemplates.summary.documents", {
                        count: importResult.documentCount,
                        defaultValue: "{{count}} docs",
                      })}
                    </Badge>
                    <Badge colorPalette="purple">
                      {t("starterTemplates.summary.channel", {
                        channelId: importResult.channelId,
                        defaultValue: "Channel {{channelId}}",
                      })}
                    </Badge>
                    {importResult.targetTenantId && (
                      <Badge colorPalette="blue">
                        {t("starterTemplates.summary.tenant", {
                          defaultValue: "Tenant {{tenantId}}",
                          tenantId: importResult.targetTenantId,
                        })}
                      </Badge>
                    )}
                  </HStack>
                  <HStack gap={2} flexWrap="wrap">
                    <Code fontSize="xs">
                      {t("starterTemplates.summary.attributeRewrites", {
                        count: Object.keys(importResult.idRewrites.attributes)
                          .length,
                        defaultValue: "{{count}} attribute rewrites",
                      })}
                    </Code>
                    <Code fontSize="xs">
                      {t("starterTemplates.summary.productTypeRewrites", {
                        count: Object.keys(importResult.idRewrites.productTypes)
                          .length,
                        defaultValue: "{{count}} product type rewrites",
                      })}
                    </Code>
                  </HStack>
                </VStack>
              </Card.Body>
            </Card.Root>
          )}
        </SimpleGrid>
      )}
    </VStack>
  );
}
