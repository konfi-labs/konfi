"use client";

import { Box, Heading, StackSeparator, VStack } from "@chakra-ui/react";
import { uploadMdxImage } from "@konfi/firebase";
import { FieldData } from "@konfi/types";
import { FileMimeType } from "@konfi/utils";
import {
  BlockTypeSelect,
  BoldItalicUnderlineToggles,
  CreateLink,
  diffSourcePlugin,
  DiffSourceToggleWrapper,
  headingsPlugin,
  imagePlugin,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  linkDialogPlugin,
  linkPlugin,
  listsPlugin,
  ListsToggle,
  markdownShortcutPlugin,
  MDXEditor,
  quotePlugin,
  tablePlugin,
  thematicBreakPlugin,
  toolbarPlugin,
  UndoRedo,
  type MDXEditorMethods,
  type MDXEditorProps,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import type { TFunction } from "i18next";
import { useCallback, useMemo, type ForwardedRef } from "react";
import { useColorMode } from "../../../ui";
import { Prose } from "../../../ui/prose";
import { toaster } from "../../../ui/toaster";
import { Preview } from "./MdxPreview";

const DEFAULT_MDX_IMAGE_ACCEPT_TYPES = ["jpeg", "jpg", "png", "gif", "webp"];
const DEFAULT_MDX_IMAGE_PREFIX = "cms/content";
const DEFAULT_MDX_IMAGE_MAX_FILE_SIZE = 10;

function getFileExtension(fileName: string) {
  const lastDotIndex = fileName.lastIndexOf(".");
  return lastDotIndex >= 0 ? fileName.slice(lastDotIndex + 1).toLowerCase() : "";
}

function isAcceptedImageFile(file: File, acceptedTypes: string[]) {
  const acceptedTypeSet = new Set(
    acceptedTypes.map((acceptedType) => acceptedType.toLowerCase()),
  );
  const extension = getFileExtension(file.name);
  const mimeExtension =
    file.type && Object.prototype.hasOwnProperty.call(FileMimeType, file.type)
      ? FileMimeType[file.type]?.toLowerCase()
      : "";

  return acceptedTypeSet.has(extension) || acceptedTypeSet.has(mimeExtension);
}

export default function InitializedMDXEditor({
  editorRef,
  fieldData,
  t,
  markdown,
  ...props
}: {
  editorRef: ForwardedRef<MDXEditorMethods> | null;
  fieldData?: FieldData;
  t: TFunction;
} & MDXEditorProps) {
  const { colorMode } = useColorMode();
  const normalizedMarkdown = typeof markdown === "string" ? markdown : "";
  const mdxImageProps = fieldData?.mdxImageProps;
  const acceptedTypes =
    mdxImageProps?.acceptType ?? DEFAULT_MDX_IMAGE_ACCEPT_TYPES;
  const maxFileSizeInMegabytes =
    mdxImageProps?.maxFileSize ?? DEFAULT_MDX_IMAGE_MAX_FILE_SIZE;
  const maxFileSizeInBytes = maxFileSizeInMegabytes * 1024 * 1024;

  const imageUploadHandler = useCallback(
    async (file: File) => {
      if (!isAcceptedImageFile(file, acceptedTypes)) {
        const acceptedExtensions = acceptedTypes
          .map((acceptedType) => `.${acceptedType}`)
          .join(", ");
        const error = new Error(
          `Unsupported image type for "${file.name}". Accepted types: ${acceptedExtensions}`,
        );

        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("mdxEditor.invalidImageType", {
            defaultValue: "Only {{types}} images are supported.",
            types: acceptedExtensions,
          }),
          type: "error",
        });
        throw error;
      }

      if (file.size > maxFileSizeInBytes) {
        const error = new Error(
          `Image file "${file.name}" exceeds the ${maxFileSizeInMegabytes} MB limit`,
        );

        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("mdxEditor.imageTooLarge", {
            defaultValue: "Images must be smaller than {{size}} MB.",
            size: maxFileSizeInMegabytes,
          }),
          type: "error",
        });
        throw error;
      }

      try {
        const { url } = await uploadMdxImage({
          file,
          prefix: mdxImageProps?.prefix ?? DEFAULT_MDX_IMAGE_PREFIX,
        });

        return url;
      } catch (error) {
        console.error("Error uploading MDX editor image:", error);

        toaster.create({
          title: t("common.error", { defaultValue: "Error" }),
          description: t("mdxEditor.imageUploadFailed", {
            defaultValue: "Image upload failed. Please try again.",
          }),
          type: "error",
        });

        throw error;
      }
    },
    [
      acceptedTypes,
      maxFileSizeInBytes,
      maxFileSizeInMegabytes,
      mdxImageProps?.prefix,
      t,
    ],
  );

  const plugins = useMemo(
    () => [
      headingsPlugin({
        allowedHeadingLevels: [1, 2, 3],
      }),
      listsPlugin(),
      quotePlugin(),
      thematicBreakPlugin(),
      markdownShortcutPlugin(),
      linkPlugin(),
      linkDialogPlugin(),
      tablePlugin(),
      imagePlugin({
        imageUploadHandler,
      }),
      diffSourcePlugin(),
      toolbarPlugin({
        toolbarClassName: "mdx-editor-toolbar",
        toolbarContents: () => (
          <DiffSourceToggleWrapper options={["source", "rich-text"]}>
            <UndoRedo />
            <BoldItalicUnderlineToggles />
            <BlockTypeSelect />
            <CreateLink />
            <InsertImage />
            <InsertTable />
            <InsertThematicBreak />
            <ListsToggle />
          </DiffSourceToggleWrapper>
        ),
      }),
    ],
    [imageUploadHandler],
  );

  return (
    <VStack
      bg={{ base: "white", _dark: "gray.950" }}
      alignItems={"start"}
      p={4}
      border={"1px solid"}
      borderColor={"gray.muted"}
      borderRadius={"3xl"}
      separator={<StackSeparator py={2} />}
      w="100%"
      maxW="100%"
    >
      <Box w="-webkit-fill-available">
        <Prose maxW="100%">
          <style>{`
            .prose h1 {
              font-size: 1.5rem;
              font-weight: bold;
              margin-bottom: 1rem;
            }
            .prose h2 {
              font-size: 1.25rem;
              font-weight: bold;
              margin-bottom: 1rem;
            }
            .prose h3 {
              font-size: 1.125rem;
              font-weight: bold;
              margin-bottom: 1rem;
            }
          `}</style>
          <MDXEditor
            className={colorMode === "dark" ? "dark-theme" : "light-theme"}
            translation={(key, defaultValue, interpolations) => {
              const result = t(key, {
                defaultValue,
                ...(interpolations ?? {}),
              });
              return typeof result === "string" ? result : "";
            }}
            contentEditableClassName="prose"
            plugins={plugins}
            {...props}
            markdown={normalizedMarkdown}
            ref={editorRef}
          />
        </Prose>
      </Box>
      <Box w="100%">
        <Box
          bgColor={{ base: "#f0f0f3", _dark: "#212225" }}
          borderRadius={"md"}
          mb={4}
        >
          <Heading
            size={"xl"}
            color={{ base: "#1c2024", _dark: "#edeef0" }}
            pl={3}
            py={1.5}
          >
            {t("ui.preview", "Preview")}
          </Heading>
        </Box>
        <Box p={4}>
          <Preview source={normalizedMarkdown} />
        </Box>
      </Box>
    </VStack>
  );
}
