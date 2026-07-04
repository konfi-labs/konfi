"use client";

import { useSocial } from "@/context/social";
import { useTenantContext } from "@/context/tenant";
import { useT } from "@/i18n/client";
import {
  createSocialPost,
  updateSocialPost,
  scheduleSocialPost,
  cancelSocialPostSchedule,
  deleteSocialPost,
  generateSocialPostText,
  type SocialPostInput,
  type SocialPostView,
} from "@/actions/social";
import {
  Alert,
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  Flex,
  HStack,
  IconButton,
  Image,
  Input,
  Spinner,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { AlertDialog, MaterialSymbol, toaster } from "@konfi/components";
import { tenantStoragePaths } from "@konfi/firebase";
import { Dispatch, SetStateAction, useId, useRef, useState } from "react";
import Drawer from "@/components/Drawer";

const FB_CHAR_LIMIT = 63206;
const IG_CHAR_LIMIT = 2200;

interface MediaItem {
  storagePath: string;
  downloadUrl: string;
  contentType: string;
  previewUrl: string;
}

interface TargetOption {
  provider: "facebook" | "instagram";
  targetId: string;
  targetName: string;
  label: string;
}

function getCharLimit(selectedProviders: string[]): number {
  if (selectedProviders.includes("instagram")) return IG_CHAR_LIMIT;
  if (selectedProviders.includes("facebook")) return FB_CHAR_LIMIT;
  return FB_CHAR_LIMIT;
}

export default function PostComposer({
  open,
  setOpen,
  post,
  onSuccess,
}: {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  post?: SocialPostView | null;
  onSuccess?: () => void;
}) {
  const { t } = useT();
  const { metaStatus, refreshPosts } = useSocial();
  const tenantContext = useTenantContext();

  const isEditing = !!post;
  const isReadOnly =
    post?.status === "publishing" || post?.status === "published";

  // Build target options from metaStatus.pages
  const targetOptions: TargetOption[] = (metaStatus?.pages ?? []).flatMap(
    (page) => {
      const options: TargetOption[] = [
        {
          provider: "facebook",
          targetId: page.id,
          targetName: page.name,
          label: page.name,
        },
      ];
      if (page.igAccount) {
        options.push({
          provider: "instagram",
          targetId: page.igAccount.id,
          targetName: page.igAccount.username,
          label: `@${page.igAccount.username}`,
        });
      }
      return options;
    },
  );

  // Form state
  const [content, setContent] = useState(post?.content ?? "");
  const [selectedTargetKeys, setSelectedTargetKeys] = useState<Set<string>>(
    () => {
      if (!post) return new Set();
      return new Set(
        post.targets.map((t) => `${t.provider}:${t.targetId}`),
      );
    },
  );
  const [media, setMedia] = useState<MediaItem[]>(() => {
    if (!post) return [];
    return post.media.map((m) => ({
      ...m,
      previewUrl: m.downloadUrl,
    }));
  });
  const [scheduledAtValue, setScheduledAtValue] = useState(() => {
    if (!post?.scheduledAt) return "";
    return new Date(post.scheduledAt).toISOString().slice(0, 16);
  });

  // Draft post id (created silently on first media upload)
  const [draftPostId, setDraftPostId] = useState<string | null>(
    post?.id ?? null,
  );

  // UI state
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [scheduleIssues, setScheduleIssues] = useState<string[]>([]);

  // AI assist
  const [aiBrief, setAiBrief] = useState("");
  const [generating, setGenerating] = useState(false);

  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProviders = Array.from(selectedTargetKeys).map(
    (key) => key.split(":")[0] ?? "",
  );
  const charLimit = getCharLimit(selectedProviders);
  const charCount = content.length;
  const charOver = charCount > charLimit;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function buildTargets() {
    return targetOptions.filter((opt) =>
      selectedTargetKeys.has(`${opt.provider}:${opt.targetId}`),
    );
  }

  function buildInput(): SocialPostInput {
    return {
      content,
      media: media.map(({ storagePath, downloadUrl, contentType }) => ({
        storagePath,
        downloadUrl,
        contentType,
      })),
      targets: buildTargets().map(({ provider, targetId, targetName }) => ({
        provider,
        targetId,
        targetName,
      })),
    };
  }

  async function ensureDraftId(): Promise<string> {
    if (draftPostId) return draftPostId;
    const result = await createSocialPost(buildInput());
    setDraftPostId(result.id);
    return result.id;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleMediaFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const postId = await ensureDraftId();
      const { getDownloadURL, ref, uploadBytes } = await import(
        "firebase/storage"
      );
      const { storage } = await import("@/lib/firebase/clientApp");

      const uploaded: MediaItem[] = await Promise.all(
        files.map(async (file) => {
          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const folder = tenantStoragePaths.socialPostMediaFolder(
            tenantContext,
            postId,
          );
          const storagePath = `${folder}/${Date.now()}-${safeName}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file, { contentType: file.type });
          const downloadUrl = await getDownloadURL(storageRef);
          return {
            storagePath,
            downloadUrl,
            contentType: file.type,
            previewUrl: downloadUrl,
          };
        }),
      );

      setMedia((prev) => [...prev, ...uploaded]);
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error
            ? error.message
            : t("social.uploadError", { defaultValue: "Failed to upload media" }),
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveDraft() {
    setSaving(true);
    try {
      const input = buildInput();
      if (draftPostId) {
        await updateSocialPost(draftPostId, input);
      } else {
        const result = await createSocialPost(input);
        setDraftPostId(result.id);
      }
      toaster.success({
        title: t("social.draftSaved", { defaultValue: "Draft saved" }),
      });
      refreshPosts();
      onSuccess?.();
      setOpen(false);
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleSchedule() {
    if (!scheduledAtValue) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("social.scheduleDateRequired", {
          defaultValue: "Please pick a scheduled date and time.",
        }),
      });
      return;
    }
    setScheduling(true);
    setScheduleIssues([]);
    try {
      // Persist latest edits first
      const input = buildInput();
      const postId = draftPostId ?? (await ensureDraftId());
      if (draftPostId) {
        await updateSocialPost(postId, input);
      }

      const scheduledAt = new Date(scheduledAtValue).getTime();
      const result = await scheduleSocialPost(postId, scheduledAt);
      if ("issues" in result) {
        setScheduleIssues(result.issues);
      } else {
        toaster.success({
          title: t("social.scheduled", { defaultValue: "Post scheduled" }),
        });
        refreshPosts();
        onSuccess?.();
        setOpen(false);
      }
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      setScheduling(false);
    }
  }

  async function handleCancelSchedule() {
    if (!draftPostId) return;
    setCancelling(true);
    try {
      await cancelSocialPostSchedule(draftPostId);
      toaster.success({
        title: t("social.scheduleCancelled", {
          defaultValue: "Schedule cancelled",
        }),
      });
      refreshPosts();
      onSuccess?.();
      setOpen(false);
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!draftPostId) return;
    setDeleting(true);
    try {
      await deleteSocialPost(draftPostId);
      toaster.success({
        title: t("social.postDeleted", { defaultValue: "Post deleted" }),
      });
      refreshPosts();
      onSuccess?.();
      setOpen(false);
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleGenerate() {
    if (!aiBrief.trim()) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description: t("social.aiBriefRequired", {
          defaultValue: "Enter a brief first.",
        }),
      });
      return;
    }
    setGenerating(true);
    try {
      const firstProvider = buildTargets()[0]?.provider;
      const text = await generateSocialPostText({
        brief: aiBrief.trim(),
        provider: firstProvider,
      });
      setContent(text);
    } catch (error) {
      toaster.error({
        title: t("common.error", { defaultValue: "Error" }),
        description:
          error instanceof Error ? error.message : String(error),
      });
    } finally {
      setGenerating(false);
    }
  }

  const drawerHeader = isEditing
    ? t("social.editPost", { defaultValue: "Edit post" })
    : t("social.newPost", { defaultValue: "New post" });

  return (
    <>
      <Drawer
        header={drawerHeader}
        open={open}
        setOpen={setOpen}
        size="lg"
        lazyMount
        unmountOnExit
      >
        <VStack align="stretch" gap={5} pb={6}>
          {/* Targets */}
          <Field.Root>
            <Field.Label>
              {t("social.targets", { defaultValue: "Publish to" })}
            </Field.Label>
            <VStack align="stretch" gap={2} mt={1}>
              {targetOptions.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  {t("social.noTargets", {
                    defaultValue:
                      "No pages connected. Connect Meta to add targets.",
                  })}
                </Text>
              ) : (
                targetOptions.map((opt) => {
                  const key = `${opt.provider}:${opt.targetId}`;
                  return (
                    <Checkbox.Root
                      key={key}
                      checked={selectedTargetKeys.has(key)}
                      onCheckedChange={(details) => {
                        if (isReadOnly) return;
                        setSelectedTargetKeys((prev) => {
                          const next = new Set(prev);
                          if (details.checked) {
                            next.add(key);
                          } else {
                            next.delete(key);
                          }
                          return next;
                        });
                      }}
                      disabled={isReadOnly}
                    >
                      <Checkbox.HiddenInput />
                      <Checkbox.Control />
                      <Checkbox.Label>
                        <HStack gap={2}>
                          <Badge
                            colorPalette={
                              opt.provider === "facebook" ? "blue" : "purple"
                            }
                            size="sm"
                          >
                            {opt.provider === "facebook" ? "FB" : "IG"}
                          </Badge>
                          <Text fontSize="sm">{opt.label}</Text>
                        </HStack>
                      </Checkbox.Label>
                    </Checkbox.Root>
                  );
                })
              )}
            </VStack>
          </Field.Root>

          {/* Content */}
          <Field.Root invalid={charOver}>
            <Field.Label>
              {t("social.content", { defaultValue: "Post content" })}
            </Field.Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={isReadOnly}
              minH="160px"
              placeholder={t("social.contentPlaceholder", {
                defaultValue: "Write your post…",
              })}
            />
            <Field.HelperText>
              <Text
                fontSize="xs"
                color={charOver ? "fg.error" : "fg.muted"}
                textAlign="right"
              >
                {charCount} / {charLimit}
              </Text>
            </Field.HelperText>
          </Field.Root>

          {/* AI Assist */}
          {!isReadOnly && (
            <Field.Root>
              <Field.Label>
                {t("social.aiAssist", { defaultValue: "AI assist" })}
              </Field.Label>
              <HStack gap={2}>
                <Input
                  value={aiBrief}
                  onChange={(e) => setAiBrief(e.target.value)}
                  placeholder={t("social.aiBriefPlaceholder", {
                    defaultValue: "Describe the post in a few words…",
                  })}
                  flex={1}
                />
                <Button
                  variant="outline"
                  loading={generating}
                  disabled={!aiBrief.trim()}
                  onClick={() => void handleGenerate()}
                >
                  <MaterialSymbol>auto_awesome</MaterialSymbol>
                  {t("social.generate", { defaultValue: "Generate" })}
                </Button>
              </HStack>
            </Field.Root>
          )}

          {/* Media */}
          {!isReadOnly && (
            <Field.Root>
              <Field.Label>
                {t("social.media", { defaultValue: "Media" })}
              </Field.Label>
              <input
                ref={fileInputRef}
                id={fileInputId}
                type="file"
                hidden
                multiple
                accept="image/*,video/*"
                onChange={(e) => {
                  const files = Array.from(e.currentTarget.files ?? []);
                  e.currentTarget.value = "";
                  void handleMediaFiles(files);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
                alignSelf="flex-start"
              >
                <MaterialSymbol>upload</MaterialSymbol>
                {t("social.addMedia", { defaultValue: "Add media" })}
              </Button>
            </Field.Root>
          )}

          {/* Media previews */}
          {media.length > 0 && (
            <Flex gap={2} flexWrap="wrap">
              {media.map((item, index) => (
                <Box key={item.storagePath} position="relative">
                  <Image
                    src={item.previewUrl}
                    alt={`media-${index}`}
                    boxSize="80px"
                    objectFit="cover"
                    borderRadius="lg"
                  />
                  {!isReadOnly && (
                    <IconButton
                      aria-label={t("common.remove", {
                        defaultValue: "Remove",
                      })}
                      size="2xs"
                      colorPalette="red"
                      variant="solid"
                      position="absolute"
                      top={1}
                      right={1}
                      onClick={() =>
                        setMedia((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <MaterialSymbol>close</MaterialSymbol>
                    </IconButton>
                  )}
                </Box>
              ))}
            </Flex>
          )}

          {/* Scheduled time */}
          <Field.Root>
            <Field.Label>
              {t("social.scheduleAt", { defaultValue: "Schedule date & time" })}
            </Field.Label>
            <Input
              type="datetime-local"
              value={scheduledAtValue}
              onChange={(e) => setScheduledAtValue(e.target.value)}
              disabled={isReadOnly}
            />
          </Field.Root>

          {/* Schedule issues */}
          {scheduleIssues.length > 0 && (
            <Alert.Root status="error">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>
                  {t("social.scheduleIssues", {
                    defaultValue: "Cannot schedule",
                  })}
                </Alert.Title>
                <Alert.Description>
                  <VStack align="stretch" gap={1}>
                    {scheduleIssues.map((issue, i) => (
                      <Text key={i} fontSize="sm">
                        {issue}
                      </Text>
                    ))}
                  </VStack>
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}

          {/* Footer actions */}
          {!isReadOnly && (
            <Flex gap={2} flexWrap="wrap" pt={2}>
              <Button
                colorPalette="primary"
                variant="solid"
                loading={scheduling}
                disabled={saving || !scheduledAtValue || selectedTargetKeys.size === 0}
                onClick={() => void handleSchedule()}
              >
                <MaterialSymbol>schedule_send</MaterialSymbol>
                {t("social.schedule", { defaultValue: "Schedule" })}
              </Button>
              <Button
                variant="outline"
                loading={saving}
                disabled={scheduling}
                onClick={() => void handleSaveDraft()}
              >
                <MaterialSymbol>save</MaterialSymbol>
                {t("social.saveDraft", { defaultValue: "Save draft" })}
              </Button>
              {post?.status === "scheduled" && (
                <Button
                  variant="outline"
                  loading={cancelling}
                  onClick={() => void handleCancelSchedule()}
                >
                  <MaterialSymbol>cancel</MaterialSymbol>
                  {t("social.cancelSchedule", {
                    defaultValue: "Cancel schedule",
                  })}
                </Button>
              )}
              {draftPostId && (
                <Button
                  variant="ghost"
                  colorPalette="red"
                  loading={deleting}
                  onClick={() => setShowDeleteDialog(true)}
                >
                  <MaterialSymbol>delete</MaterialSymbol>
                  {t("social.delete", { defaultValue: "Delete" })}
                </Button>
              )}
            </Flex>
          )}
        </VStack>
      </Drawer>

      <AlertDialog
        header={t("social.deletePostConfirmHeader", {
          defaultValue: "Delete this post?",
        })}
        handle={() => void handleDelete()}
        open={showDeleteDialog}
        setOpen={setShowDeleteDialog}
        t={t}
      >
        <Text>
          {t("social.deletePostConfirm", {
            defaultValue: "This will permanently delete the post.",
          })}
        </Text>
      </AlertDialog>
    </>
  );
}
