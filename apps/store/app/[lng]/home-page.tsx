"use client";

import { useT } from "@/i18n/client";
import {
  storefrontRadiusCssValue,
  storefrontRadiusCssVar,
  storefrontThemeCssVariables,
} from "@/lib/storefront-editor/theme-vars";
import type { StorefrontMaintenanceConfig } from "@/lib/runtime-config";
import {
  Badge,
  Box,
  Button,
  Container,
  HStack,
  IconButton,
  Menu,
  Portal,
  VStack,
} from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { GoogleReview } from "@konfi/google";
import {
  DEFAULT_STOREFRONT_HOME_BLOCKS,
  DEFAULT_STOREFRONT_SHARING,
  DEFAULT_STOREFRONT_THEME,
  STOREFRONT_HOME_BLOCK_TYPES,
  type CardProduct,
  type HeroCard,
  type StorefrontButtonStyle,
  type StorefrontHomeBlock,
  type StorefrontHomeBlockType,
  type StorefrontHomePage,
  type StorefrontSharingSettings,
  type StorefrontThemeSettings,
} from "@konfi/types";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  storefrontHomeBlockCanRender,
  StorefrontHomeBlockRenderer,
} from "./components/home/StorefrontHomeBlockRenderer";
import {
  StorefrontEditorPanel,
  StorefrontEditorSessionCountdown,
  type StorefrontEditorAutosaveState,
  type StorefrontEditorRevisionSummary,
} from "./components/storefront-editor/StorefrontEditorPanel";
import { useRouter } from "next/navigation";

interface Props {
  adminCmsUrl?: string;
  editorEnabled?: boolean;
  editorSessionExpiresAt?: number;
  featuredProducts?: CardProduct[];
  popularProducts?: CardProduct[];
  heroCards?: HeroCard[];
  campaignsAd?: string;
  googleReviews?: GoogleReview[];
  homePage?: StorefrontHomePage;
  lng: string;
  maintenance?: StorefrontMaintenanceConfig;
  storefrontSharing?: StorefrontSharingSettings;
  storefrontTheme?: StorefrontThemeSettings;
}

interface StorefrontEditorContentResponse {
  draft?: {
    homePage?: StorefrontHomePage;
    sharing?: StorefrontSharingSettings;
    theme?: StorefrontThemeSettings;
  };
  revisions?: StorefrontEditorRevisionSummary[];
}

const autosaveDelayMs = 1500;

const presetLabels: Record<StorefrontHomeBlockType, string> = {
  assistant: "Assistant",
  campaigns: "Campaigns",
  "featured-products": "Featured",
  hero: "Hero",
  "how-it-works": "How It Works",
  newsletter: "Newsletter",
  "popular-products": "Popular",
  "rich-text-cta": "Text & CTA",
  testimonials: "Testimonials",
  "trust-grid": "Trust Grid",
};

const createBlock = (
  type: StorefrontHomeBlockType,
  index: number,
): StorefrontHomeBlock => ({
  body: type === "rich-text-cta" ? "" : undefined,
  enabled: true,
  id: `${type}-${Date.now()}-${index}`,
  title: undefined,
  type,
  variant: "default",
});

const blockOrDefault = (homePage: StorefrontHomePage | undefined) =>
  homePage?.blocks?.length
    ? homePage.blocks
    : [...DEFAULT_STOREFRONT_HOME_BLOCKS];

const serializeEditorState = (
  blocks: StorefrontHomeBlock[],
  theme: StorefrontThemeSettings,
  sharing: StorefrontSharingSettings,
) => JSON.stringify({ blocks, sharing, theme });

const getRemovedDefaultBlockTypes = (blocks: StorefrontHomeBlock[]) => {
  const blockTypes = new Set(blocks.map((block) => block.type));
  const removedBlockTypes = DEFAULT_STOREFRONT_HOME_BLOCKS.flatMap((block) =>
    blockTypes.has(block.type) ? [] : [block.type],
  );

  return removedBlockTypes.length > 0 ? removedBlockTypes : undefined;
};

const createHomePagePayload = (
  blocks: StorefrontHomeBlock[],
  sourceLocale: string,
): StorefrontHomePage => {
  const removedDefaultBlockTypes = getRemovedDefaultBlockTypes(blocks);

  return {
    blocks,
    id: "home",
    ...(removedDefaultBlockTypes ? { removedDefaultBlockTypes } : {}),
    sourceLocale,
  };
};

const storefrontBlockRadiusStyle = (
  block: StorefrontHomeBlock,
): CSSProperties => {
  const radiusOverrides = block.radiusOverrides;
  const style: Record<string, string> = {};

  if (radiusOverrides?.section) {
    style["--konfi-store-block-radius"] = storefrontRadiusCssValue(
      radiusOverrides.section,
    );
  }

  if (radiusOverrides?.buttons) {
    style["--konfi-store-button-radius"] = storefrontRadiusCssValue(
      radiusOverrides.buttons,
    );
  }

  if (radiusOverrides?.cards) {
    style["--konfi-store-card-radius"] = storefrontRadiusCssValue(
      radiusOverrides.cards,
    );
  }

  if (radiusOverrides?.media) {
    style["--konfi-store-media-radius"] = storefrontRadiusCssValue(
      radiusOverrides.media,
    );
  }

  return style as CSSProperties;
};

export default function HomePage({
  adminCmsUrl,
  editorEnabled = false,
  editorSessionExpiresAt,
  featuredProducts,
  popularProducts,
  heroCards,
  campaignsAd,
  googleReviews,
  homePage,
  lng,
  maintenance,
  storefrontSharing,
  storefrontTheme,
}: Props) {
  const { t } = useT();
  const router = useRouter();
  const initialBlocks = useMemo(() => blockOrDefault(homePage), [homePage]);
  const contentSourceLocale = homePage?.sourceLocale ?? lng;
  const [blocks, setBlocks] = useState<StorefrontHomeBlock[]>(initialBlocks);
  const [theme, setTheme] = useState<StorefrontThemeSettings>(
    storefrontTheme ?? DEFAULT_STOREFRONT_THEME,
  );
  const [sharing, setSharing] = useState<StorefrontSharingSettings>(
    storefrontSharing ?? DEFAULT_STOREFRONT_SHARING,
  );
  const [revisions, setRevisions] = useState<StorefrontEditorRevisionSummary[]>(
    [],
  );
  const [editorAction, setEditorAction] = useState<
    "maintenance" | "publish" | `rollback:${string}` | null
  >(null);
  const [autosaveState, setAutosaveState] =
    useState<StorefrontEditorAutosaveState>("idle");
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(
    maintenance?.enabled ?? false,
  );
  const [selectedBlockId, setSelectedBlockId] = useState<string | undefined>(
    initialBlocks[0]?.id,
  );
  const [editorUiVisible, setEditorUiVisible] = useState(true);
  const [editorRequestPending, setEditorRequestPending] = useState(false);
  const lastSavedStateRef = useRef(
    serializeEditorState(
      initialBlocks,
      storefrontTheme ?? DEFAULT_STOREFRONT_THEME,
      storefrontSharing ?? DEFAULT_STOREFRONT_SHARING,
    ),
  );
  const suppressNextAutosaveRef = useRef(false);
  const appliedThemeVarsRef = useRef<string[]>([]);

  const editorUiActive = editorEnabled && editorUiVisible;
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);
  const existingBlockTypes = useMemo(
    () => new Set(blocks.map((block) => block.type)),
    [blocks],
  );
  const availableBlockTypes = STOREFRONT_HOME_BLOCK_TYPES.filter(
    (type) => !existingBlockTypes.has(type),
  );
  const selectedButtonStyle: StorefrontButtonStyle =
    theme.buttonStyle ?? DEFAULT_STOREFRONT_THEME.buttonStyle;

  useEffect(() => {
    if (!editorEnabled) {
      return;
    }

    const themeVars = storefrontThemeCssVariables(theme);

    for (const name of appliedThemeVarsRef.current) {
      if (!(name in themeVars)) {
        document.body.style.removeProperty(name);
      }
    }

    for (const [name, value] of Object.entries(themeVars)) {
      document.body.style.setProperty(name, value);
    }

    appliedThemeVarsRef.current = Object.keys(themeVars);
  }, [editorEnabled, theme]);

  useEffect(() => {
    if (!editorEnabled) {
      return;
    }

    let active = true;

    fetch("/api/storefront-editor/home")
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as StorefrontEditorContentResponse;

        if (active) {
          setRevisions(data.revisions ?? []);
        }
      })
      .catch((error) => console.error(error));

    return () => {
      active = false;
    };
  }, [editorEnabled]);

  const createEditorSavePayload = () => ({
    homePage: createHomePagePayload(blocks, contentSourceLocale),
    sourceLocale: contentSourceLocale,
    sharing,
    theme,
  });

  const serializedEditorState = serializeEditorState(blocks, theme, sharing);

  useEffect(() => {
    if (!editorEnabled) {
      return;
    }

    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      lastSavedStateRef.current = serializedEditorState;
      return;
    }

    if (serializedEditorState === lastSavedStateRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      lastSavedStateRef.current = serializedEditorState;
      setAutosaveState("saving");

      const savedState = JSON.parse(serializedEditorState) as {
        blocks: StorefrontHomeBlock[];
        sharing: StorefrontSharingSettings;
        theme: StorefrontThemeSettings;
      };

      fetch("/api/storefront-editor/home", {
        body: JSON.stringify({
          autoTranslate: false,
          homePage: createHomePagePayload(
            savedState.blocks,
            contentSourceLocale,
          ),
          sharing: savedState.sharing,
          sourceLocale: contentSourceLocale,
          theme: savedState.theme,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Storefront editor autosave failed.");
          }

          setAutosaveState("saved");
        })
        .catch((error) => {
          console.error(error);
          setAutosaveState("error");
        });
    }, autosaveDelayMs);

    return () => window.clearTimeout(timeoutId);
  }, [contentSourceLocale, editorEnabled, serializedEditorState]);

  const updateBlock = (updatedBlock: StorefrontHomeBlock) => {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === updatedBlock.id ? updatedBlock : block,
      ),
    );
  };

  const addBlock = (type: StorefrontHomeBlockType, index: number) => {
    if (blocks.some((block) => block.type === type)) {
      return;
    }

    const nextBlock = createBlock(type, index);

    setBlocks((currentBlocks) => [
      ...currentBlocks.slice(0, index),
      nextBlock,
      ...currentBlocks.slice(index),
    ]);
    setSelectedBlockId(nextBlock.id);
  };

  const moveBlock = (blockId: string, direction: "down" | "up") => {
    setBlocks((currentBlocks) => {
      const index = currentBlocks.findIndex((block) => block.id === blockId);
      const targetIndex = direction === "up" ? index - 1 : index + 1;

      if (index < 0 || targetIndex < 0 || targetIndex >= currentBlocks.length) {
        return currentBlocks;
      }

      const nextBlocks = [...currentBlocks];
      const [block] = nextBlocks.splice(index, 1);

      if (!block) {
        return currentBlocks;
      }

      nextBlocks.splice(targetIndex, 0, block);
      return nextBlocks;
    });
  };

  const toggleBlock = (blockId: string) => {
    setBlocks((currentBlocks) =>
      currentBlocks.map((block) =>
        block.id === blockId ? { ...block, enabled: !block.enabled } : block,
      ),
    );
  };

  const removeBlock = (blockId: string) => {
    setBlocks((currentBlocks) =>
      currentBlocks.filter((block) => block.id !== blockId),
    );
    if (selectedBlockId === blockId) {
      setSelectedBlockId(blocks.find((block) => block.id !== blockId)?.id);
    }
  };

  const runEditorRequest = async (
    action: Exclude<typeof editorAction, null>,
    request: () => Promise<void>,
  ) => {
    setEditorAction(action);
    setEditorRequestPending(true);

    try {
      await request();
    } catch (error) {
      console.error(error);
    } finally {
      setEditorAction(null);
      setEditorRequestPending(false);
    }
  };

  const publishChanges = () => {
    void runEditorRequest("publish", async () => {
      lastSavedStateRef.current = serializeEditorState(blocks, theme, sharing);

      const draftResponse = await fetch("/api/storefront-editor/home", {
        body: JSON.stringify(createEditorSavePayload()),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!draftResponse.ok) {
        throw new Error("Storefront editor draft save failed.");
      }

      const response = await fetch("/api/storefront-editor/home", {
        body: JSON.stringify({
          action: "publish",
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Storefront editor publish failed.");
      }

      const data = (await response.json()) as StorefrontEditorContentResponse;

      setRevisions(data.revisions ?? []);
      router.refresh();
    });
  };

  const rollbackRevision = (revisionId: string) => {
    void runEditorRequest(`rollback:${revisionId}`, async () => {
      const response = await fetch("/api/storefront-editor/home", {
        body: JSON.stringify({
          action: "rollback",
          revisionId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Storefront editor rollback failed.");
      }

      const data = (await response.json()) as StorefrontEditorContentResponse;

      suppressNextAutosaveRef.current = true;

      if (data.draft?.homePage) {
        setBlocks(blockOrDefault(data.draft.homePage));
      }

      if (data.draft?.theme) {
        setTheme(data.draft.theme);
      }

      if (data.draft?.sharing) {
        setSharing(data.draft.sharing);
      }

      setRevisions(data.revisions ?? []);
      router.refresh();
    });
  };

  const updateMaintenanceMode = (enabled: boolean) => {
    void runEditorRequest("maintenance", async () => {
      const response = await fetch("/api/storefront-editor/maintenance", {
        body: JSON.stringify({ enabled }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error("Storefront maintenance update failed.");
      }

      setMaintenanceEnabled(enabled);
      router.refresh();
    });
  };

  const blockTypeLabel = (type: StorefrontHomeBlockType) =>
    t(`store.editor.presets.${type}`, {
      defaultValue: presetLabels[type],
    });

  const renderBlock = (block: StorefrontHomeBlock) => (
    <StorefrontHomeBlockRenderer
      block={block}
      buttonStyle={selectedButtonStyle}
      campaignsAd={campaignsAd}
      featuredProducts={featuredProducts}
      googleReviews={googleReviews}
      heroCards={heroCards}
      lng={lng}
      popularProducts={popularProducts}
    />
  );

  const renderEditorInsert = (index: number) =>
    editorUiActive && availableBlockTypes.length > 0 ? (
      <HStack justify="center" px={4} py={3}>
        <Menu.Root
          onSelect={({ value }) =>
            addBlock(value as StorefrontHomeBlockType, index)
          }
        >
          <Menu.Trigger asChild>
            <Button
              aria-label={t("store.editor.actions.addBlock", {
                defaultValue: "Add block",
              })}
              borderColor={{ base: "gray.300", _dark: "gray.600" }}
              borderRadius="full"
              borderWidth="1px"
              boxShadow="0 10px 28px rgba(15, 23, 42, 0.16)"
              colorPalette="gray"
              fontWeight="semibold"
              gap={2}
              h="11"
              px={5}
              size="sm"
              transition="box-shadow 0.2s ease, transform 0.2s ease"
              variant="surface"
              _hover={{
                boxShadow: "0 14px 34px rgba(15, 23, 42, 0.22)",
                transform: "translateY(-1px)",
              }}
            >
              <Box as="span" fontSize="lg" lineHeight="1">
                +
              </Box>
              {t("store.editor.actions.addSection", {
                defaultValue: "Add section",
              })}
            </Button>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content zIndex="modal">
                {availableBlockTypes.map((type) => (
                  <Menu.Item key={type} value={type}>
                    {blockTypeLabel(type)}
                  </Menu.Item>
                ))}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
    ) : null;

  const renderBlockToolbar = (block: StorefrontHomeBlock, index: number) => (
    <HStack
      bg={{ base: "whiteAlpha.900", _dark: "blackAlpha.800" }}
      borderColor={{ base: "gray.200", _dark: "gray.700" }}
      borderRadius="full"
      borderWidth="1px"
      boxShadow="0 10px 28px rgba(15, 23, 42, 0.18)"
      gap={0}
      opacity={selectedBlockId === block.id ? 1 : 0}
      p={1}
      position="absolute"
      right={3}
      top={3}
      transition="opacity 0.15s ease"
      zIndex={2}
      _groupHover={{ opacity: 1 }}
      onClick={(event) => event.stopPropagation()}
    >
      <IconButton
        aria-label={t("store.editor.actions.moveUp", {
          defaultValue: "Move Up",
        })}
        colorPalette="gray"
        disabled={index === 0}
        size="xs"
        variant="ghost"
        onClick={() => moveBlock(block.id, "up")}
      >
        <MaterialSymbol fontSize="1.1rem">arrow_upward</MaterialSymbol>
      </IconButton>
      <IconButton
        aria-label={t("store.editor.actions.moveDown", {
          defaultValue: "Move Down",
        })}
        colorPalette="gray"
        disabled={index === blocks.length - 1}
        size="xs"
        variant="ghost"
        onClick={() => moveBlock(block.id, "down")}
      >
        <MaterialSymbol fontSize="1.1rem">arrow_downward</MaterialSymbol>
      </IconButton>
      <IconButton
        aria-label={
          block.enabled
            ? t("store.editor.actions.hide", { defaultValue: "Hide" })
            : t("store.editor.actions.show", { defaultValue: "Show" })
        }
        colorPalette="gray"
        size="xs"
        variant="ghost"
        onClick={() => toggleBlock(block.id)}
      >
        <MaterialSymbol fontSize="1.1rem">
          {block.enabled ? "visibility_off" : "visibility"}
        </MaterialSymbol>
      </IconButton>
      <IconButton
        aria-label={t("store.editor.actions.remove", {
          defaultValue: "Remove",
        })}
        colorPalette="red"
        size="xs"
        variant="ghost"
        onClick={() => removeBlock(block.id)}
      >
        <MaterialSymbol fontSize="1.1rem">delete</MaterialSymbol>
      </IconButton>
    </HStack>
  );

  const renderEditableBlock = (block: StorefrontHomeBlock, index: number) => {
    // In edit mode hidden blocks stay on the canvas (dimmed) so they can be
    // re-enabled; visitors never see them.
    const previewBlock =
      editorUiActive && !block.enabled ? { ...block, enabled: true } : block;

    if (
      !storefrontHomeBlockCanRender({
        block: previewBlock,
        campaignsAd,
        googleReviews,
        popularProducts,
      })
    ) {
      return null;
    }

    const content = renderBlock(previewBlock);

    if (!content) {
      return null;
    }

    return (
      <Box key={block.id}>
        {renderEditorInsert(index)}
        <Box
          className="group"
          data-storefront-block={block.id}
          position="relative"
          borderRadius={storefrontRadiusCssVar.block}
          opacity={editorUiActive && !block.enabled ? 0.45 : undefined}
          style={storefrontBlockRadiusStyle(block)}
          _before={
            editorUiActive && selectedBlockId === block.id
              ? {
                  animation: "konfiEditorSelection 10s linear infinite",
                  background:
                    "linear-gradient(90deg, #050505, #2f3033, #8f949b, #d7d9dd, #050505)",
                  backgroundSize: "300% 100%",
                  borderRadius: `calc(${storefrontRadiusCssVar.block} + 18px)`,
                  bottom: "-18px",
                  boxShadow:
                    "0 18px 45px color-mix(in srgb, #050505 22%, transparent)",
                  content: "''",
                  left: "-18px",
                  mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  maskComposite: "exclude",
                  padding: "4px",
                  pointerEvents: "none",
                  position: "absolute",
                  right: "-18px",
                  top: "-18px",
                  WebkitMask:
                    "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                  WebkitMaskComposite: "xor",
                  zIndex: 1,
                }
              : undefined
          }
          onClick={() => {
            if (editorUiActive) {
              setSelectedBlockId(block.id);
            }
          }}
        >
          {editorUiActive && !block.enabled ? (
            <Badge
              colorPalette="gray"
              left={3}
              position="absolute"
              top={3}
              variant="solid"
              zIndex={2}
            >
              {t("store.editor.block.hidden", {
                defaultValue: "Hidden",
              })}
            </Badge>
          ) : null}
          {editorUiActive ? renderBlockToolbar(block, index) : null}
          {content}
        </Box>
      </Box>
    );
  };

  const heroBlock = blocks[0]?.type === "hero" ? blocks[0] : undefined;
  const contentBlocks = heroBlock ? blocks.slice(1) : blocks;

  return (
    <Box
      bg={{ base: "white", _dark: "gray.950" }}
      style={storefrontThemeCssVariables(theme) as CSSProperties}
    >
      {editorUiActive ? (
        <style jsx global>{`
          @keyframes konfiEditorSelection {
            0% {
              background-position: 0% 50%;
            }
            100% {
              background-position: 300% 50%;
            }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-storefront-block]::before {
              animation: none !important;
            }
          }
        `}</style>
      ) : null}
      {heroBlock ? renderEditableBlock(heroBlock, 0) : null}
      <Container maxW="7xl" pt={[6, 8, 10]} pb={[14, 16, 20]}>
        <VStack align="stretch" gap={[10, 12, 16]}>
          {contentBlocks.map((block, index) =>
            renderEditableBlock(block, heroBlock ? index + 1 : index),
          )}
          {renderEditorInsert(blocks.length)}
        </VStack>
      </Container>
      {editorEnabled && !editorUiVisible ? (
        <Box
          position="fixed"
          right={{ base: 3, md: 5 }}
          top={{ base: 3, md: 5 }}
          zIndex="modal"
          display="flex"
          flexDirection="column"
          alignItems="flex-end"
          gap={2}
        >
          <StorefrontEditorSessionCountdown
            expiresAt={editorSessionExpiresAt}
          />
          <Button
            borderRadius="full"
            boxShadow="lg"
            colorPalette="gray"
            size="sm"
            variant="surface"
            onClick={() => setEditorUiVisible(true)}
          >
            {t("store.editor.panel.showEditor", {
              defaultValue: "Show editor",
            })}
          </Button>
        </Box>
      ) : null}
      {editorUiActive && (
        <StorefrontEditorPanel
          adminCmsUrl={adminCmsUrl}
          autosaveState={autosaveState}
          block={selectedBlock}
          editorSessionExpiresAt={editorSessionExpiresAt}
          lng={lng}
          maintenanceEnabled={maintenanceEnabled}
          maintenanceSaving={
            editorRequestPending && editorAction === "maintenance"
          }
          onChangeBlock={updateBlock}
          onChangeSharing={setSharing}
          onChangeTheme={setTheme}
          onEditorUiVisibleChange={setEditorUiVisible}
          onMaintenanceEnabledChange={updateMaintenanceMode}
          onPublish={publishChanges}
          onRollback={rollbackRevision}
          publishing={editorRequestPending && editorAction === "publish"}
          revisions={revisions}
          rollingBackRevisionId={
            editorAction?.startsWith("rollback:")
              ? editorAction.replace("rollback:", "")
              : undefined
          }
          theme={theme}
          sharing={sharing}
        />
      )}
    </Box>
  );
}
