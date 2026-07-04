"use client";

import {
  Box,
  Button,
  type ButtonProps,
  Circle,
  CloseButton,
  Dialog,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Portal,
  Show,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { deleteObject, download, list, upload } from "@konfi/firebase";
import { FieldData } from "@konfi/types";
import { FileMimeType } from "@konfi/utils";
import { isString, isUndefined } from "es-toolkit";
import { TFunction } from "i18next";
import { type ComponentType, type ReactNode, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import useSWR from "swr";
import { toaster, ToggleTip } from "../../../ui";
import {
  FileUploadDropzone,
  FileUploadList,
  FileUploadRoot,
} from "../../../ui/file-button";
import { Skeleton } from "../../../ui/skeleton";
import { Image } from "../../Image";
import { MaterialSymbol } from "../../MaterialSymbol";

interface Props {
  fieldData: FieldData;
  t?: TFunction;
  Actions?: ComponentType<{
    fieldData: FieldData;
  }>;
  showSelectedFiles?: boolean;
  triggerAriaLabel?: string;
  triggerContent?: ReactNode;
  triggerSize?: ButtonProps["size"];
}

async function fetchFiles(key: string) {
  try {
    if (!key) return;
    return await list(`images/${key}`);
  } catch (error) {
    console.error(error);
    return;
  }
}

function getFileName(path: string) {
  const segments = path.split("/");
  return segments[segments.length - 1] || path;
}

export default function FileManager({
  fieldData,
  t,
  Actions,
  showSelectedFiles = true,
  triggerAriaLabel,
  triggerContent,
  triggerSize,
}: Props) {
  const [isUploading, setIsUploading] = useState(false);
  const { data, mutate, isValidating, isLoading } = useSWR(
    fieldData.imageProps?.prefix,
    fetchFiles,
  );
  const {
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext();
  const value = useWatch({ name: fieldData.name });
  const isInvalid = !!errors[fieldData.name];
  const includePrefix =
    isUndefined(fieldData.imageProps?.includePrefix) ||
    fieldData.imageProps?.includePrefix;
  const selectedValues = getSelectedValues(value, includePrefix);
  const listedFiles = data ?? [];
  const selectedListedFiles = listedFiles.filter((item) =>
    selectedValues.includes(getStoredValue(item.fullPath, includePrefix)),
  );
  const orphanedSelectedValues = selectedValues.filter(
    (selectedValue) =>
      !listedFiles.some(
        (item) =>
          getStoredValue(item.fullPath, includePrefix) === selectedValue,
      ),
  );

  async function handleFileAccept(files: File[]) {
    const prefix = fieldData.imageProps?.prefix;

    if (!prefix || files.length === 0) {
      return;
    }

    setIsUploading(true);

    try {
      const uploadedFullPaths = files.map(
        (file) => `images/${prefix}/${file.name}`,
      );

      await upload(
        files.map((file, index) => ({
          file,
          url: uploadedFullPaths[index],
        })),
      );

      await mutate();

      const currentValue = getValues(fieldData.name);
      const currentSelectedValues = getSelectedValues(
        currentValue,
        includePrefix,
      );
      const uploadedStoredValues = uploadedFullPaths.map((fullPath) =>
        getStoredValue(fullPath, includePrefix),
      );
      const maxSelected = fieldData.imageProps?.maxNumber;
      const nextSelectedValues = Array.from(
        new Set([...currentSelectedValues, ...uploadedStoredValues]),
      );

      setSelectedValues(
        currentValue,
        fieldData,
        typeof maxSelected === "number" && maxSelected > 0
          ? nextSelectedValues.slice(-maxSelected)
          : nextSelectedValues,
        setValue,
      );

      toaster.success({
        title:
          files.length === 1
            ? t?.("fileManager.uploadedAndSelected", {
                defaultValue: "Image uploaded and selected",
              })
            : t?.("fileManager.uploadedAndSelectedMultiple", {
                count: files.length,
                defaultValue: "{{count}} images uploaded and selected",
              }),
      });
    } catch (error) {
      console.error("Error uploading files:", error);
      toaster.error({
        title: t?.("fileManager.uploadFailed", {
          defaultValue: "Upload failed",
        }),
        description: t?.("fileManager.uploadFailedDescription", {
          defaultValue: "Try uploading the file again.",
        }),
      });
    } finally {
      setIsUploading(false);
    }
  }

  function onImageClick(fullPath: string) {
    const currentValue = getValues(fieldData.name);
    const currentSelectedValues = getSelectedValues(
      currentValue,
      includePrefix,
    );
    const storedValue = getStoredValue(fullPath, includePrefix);
    const nextSelectedValues = currentSelectedValues.includes(storedValue)
      ? currentSelectedValues.filter((item) => item !== storedValue)
      : fieldData.imageProps?.maxNumber === 1
        ? [storedValue]
        : [...currentSelectedValues, storedValue];

    setSelectedValues(currentValue, fieldData, nextSelectedValues, setValue);
  }

  async function onImageRemove(fullPath: string) {
    await deleteObject(fullPath);
    const refreshedFiles = await mutate();
    if (!Array.isArray(refreshedFiles)) {
      return;
    }

    const storedValue = getStoredValue(fullPath, includePrefix);
    const stillExists = refreshedFiles.some(
      (item) => getStoredValue(item.fullPath, includePrefix) === storedValue,
    );

    if (stillExists) {
      return;
    }

    const currentValue = getValues(fieldData.name);
    const currentSelectedValues = getSelectedValues(
      currentValue,
      includePrefix,
    );
    if (!currentSelectedValues.includes(storedValue)) {
      return;
    }

    setSelectedValues(
      currentValue,
      fieldData,
      currentSelectedValues.filter((item) => item !== storedValue),
      setValue,
    );
  }

  function onImageDownload(fullPath: string) {
    download(fullPath);
  }

  function isSelected(fullPath: string) {
    return selectedValues.includes(getStoredValue(fullPath, includePrefix));
  }

  const selectFilesLabel = t
    ? t("fileManager.selectFiles", { defaultValue: "Select files" })
    : "Select files";

  return (
    <Box
      w={"full"}
      borderRadius="md"
      outline={isInvalid ? "2px solid" : undefined}
      outlineColor={isInvalid ? "border.error" : undefined}
      outlineOffset="2px"
    >
      {showSelectedFiles &&
        (selectedListedFiles.length > 0 ||
          orphanedSelectedValues.length > 0) && (
          <Skeleton loading={isLoading || isValidating}>
            <Grid templateColumns={"repeat(4, 1fr)"} gap={4} mb={2}>
              {selectedListedFiles.map((item) => {
                return (
                  <ImageItem
                    key={item.fullPath}
                    src={`https://${process.env.NEXT_PUBLIC_CDN_URL}/${item.fullPath.replace("images/", "")}`}
                    fullPath={item.fullPath}
                    onImageClick={onImageClick}
                    onImageDownload={onImageDownload}
                    onImageRemove={onImageRemove}
                    selected={isSelected(item.fullPath)}
                    t={t}
                  />
                );
              })}
              {orphanedSelectedValues.map((selectedValue) => (
                <ImageItem
                  key={selectedValue}
                  fullPath={selectedValue}
                  onImageClick={onImageClick}
                  selected
                  missing
                  t={t}
                />
              ))}
            </Grid>
          </Skeleton>
        )}
      {Actions && (
        <Box mb={3}>
          <Actions fieldData={fieldData} />
        </Box>
      )}
      <Dialog.Root
        placement={"center"}
        motionPreset={"slide-in-bottom"}
        size={"xl"}
        lazyMount
      >
        <Dialog.Trigger asChild>
          <Button
            aria-label={triggerAriaLabel ?? selectFilesLabel}
            size={triggerSize}
            variant={"outline"}
          >
            {triggerContent ?? selectFilesLabel}
          </Button>
        </Dialog.Trigger>
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>
                  {t
                    ? t("fileManager.selectFiles", {
                        defaultValue: "Select files",
                      })
                    : "Select files"}
                </Dialog.Title>
              </Dialog.Header>
              <Dialog.Body minH={{ base: "100vh", md: "50vh" }}>
                <Tabs.Root defaultValue={"choose"}>
                  <Tabs.List>
                    <Tabs.Trigger value={"choose"}>
                      <MaterialSymbol>folder_open</MaterialSymbol>
                      {t
                        ? t("fileManager.selectFiles", {
                            defaultValue: "Select files",
                          })
                        : "Select files"}
                    </Tabs.Trigger>
                    <Tabs.Trigger value={"upload"}>
                      <MaterialSymbol>upload_file</MaterialSymbol>
                      {t
                        ? t("fileManager.uploadFiles", {
                            defaultValue: "Upload files",
                          })
                        : "Upload files"}
                    </Tabs.Trigger>
                    <Tabs.Indicator />
                  </Tabs.List>
                  <Tabs.Content value={"choose"}>
                    <Skeleton loading={isLoading || isValidating}>
                      <Grid templateColumns={"repeat(4, 1fr)"} gap={4}>
                        {listedFiles.map((item) => {
                          return (
                            <ImageItem
                              key={item.fullPath}
                              src={`https://${process.env.NEXT_PUBLIC_CDN_URL}/${item.fullPath.replace("images/", "")}`}
                              fullPath={item.fullPath}
                              onImageClick={onImageClick}
                              onImageDownload={onImageDownload}
                              onImageRemove={onImageRemove}
                              selected={isSelected(item.fullPath)}
                              t={t}
                            />
                          );
                        })}
                      </Grid>
                    </Skeleton>
                  </Tabs.Content>
                  <Tabs.Content value={"upload"}>
                    <FileUploadRoot
                      name={"fileUpload"}
                      alignItems={"stretch"}
                      disabled={isUploading || !fieldData.imageProps?.prefix}
                      maxFiles={fieldData.imageProps?.maxFiles ?? 1}
                      maxFileSize={
                        !isUndefined(fieldData.imageProps?.maxFileSize)
                          ? fieldData.imageProps.maxFileSize * 1024 * 1024
                          : 5 * 1024 * 1024
                      }
                      accept={
                        fieldData.imageProps?.acceptType ?? [
                          "image/jpeg",
                          "image/jpg",
                          "image/png",
                        ]
                      }
                      onFileAccept={({ files }) => handleFileAccept(files)}
                    >
                      <FileUploadDropzone
                        label={
                          t
                            ? isUploading
                              ? t("fileManager.uploading", {
                                  defaultValue: "Uploading...",
                                })
                              : t("fileManager.dropOrClick", {
                                  defaultValue:
                                    "Drag and drop a file or click to select",
                                })
                            : "Drag and drop a file or click to select"
                        }
                        description={
                          t
                            ? t("fileManager.fileDescription", {
                                defaultValue: `${fieldData.imageProps?.acceptType?.map((type) => `.${FileMimeType[type]}`).join(", ") ?? ".jpeg, .jpg, .png"} up to ${!isUndefined(fieldData.imageProps?.maxFileSize) ? fieldData.imageProps.maxFileSize : 5} MB, max ${fieldData.imageProps?.maxNumber ?? 1} files`,
                                types:
                                  fieldData.imageProps?.acceptType
                                    ?.map((type) => `.${FileMimeType[type]}`)
                                    .join(", ") ?? ".jpeg, .jpg, .png",
                                maxSize: !isUndefined(
                                  fieldData.imageProps?.maxFileSize,
                                )
                                  ? fieldData.imageProps.maxFileSize
                                  : 5,
                                maxFiles: fieldData.imageProps?.maxNumber ?? 1,
                              })
                            : `${fieldData.imageProps?.acceptType?.map((type) => `.${FileMimeType[type]}`).join(", ") ?? ".jpeg, .jpg, .png"} do ${!isUndefined(fieldData.imageProps?.maxFileSize) ? fieldData.imageProps.maxFileSize : 5} MB, maksymalnie ${fieldData.imageProps?.maxNumber ?? 1} plików`
                        }
                      />
                      <FileUploadList />
                    </FileUploadRoot>
                  </Tabs.Content>
                </Tabs.Root>
              </Dialog.Body>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}

interface ImageItemProps {
  src?: string;
  fullPath?: string;
  onImageClick?: (fullPath: string) => void;
  onImageDownload?: (fullPath: string) => void;
  onImageRemove?: (fullPath: string) => void;
  selected?: boolean;
  missing?: boolean;
  t?: TFunction;
}

const ImageItem = ({
  src,
  fullPath,
  onImageClick,
  onImageDownload,
  onImageRemove,
  selected,
  missing,
  t,
}: ImageItemProps) => {
  function handleOnImageSelect(e: React.MouseEvent, targetPath: string) {
    e.stopPropagation();
    if (onImageClick) {
      onImageClick(targetPath);
    }
  }

  function handleOnImageRemove(e: React.MouseEvent, targetPath: string) {
    e.stopPropagation();
    if (onImageRemove) {
      onImageRemove(targetPath);
    }
  }

  function handleOnImageDownload(e: React.MouseEvent, targetPath: string) {
    e.stopPropagation();
    if (onImageDownload) {
      onImageDownload(targetPath);
    }
  }

  return (
    <GridItem
      position={"relative"}
      borderRadius={"3xl"}
      shadowColor={"primary.solid"}
      cursor={!onImageClick ? undefined : "pointer"}
      transition={"opacity 0.15s ease-in-out"}
      onClick={(e) => fullPath && handleOnImageSelect(e, fullPath)}
    >
      {missing ? (
        <Box
          borderRadius={"3xl"}
          borderWidth={"1px"}
          borderStyle={"dashed"}
          minH={"200px"}
          bg={{ base: "gray.50", _dark: "gray.900" }}
          display={"flex"}
          alignItems={"center"}
          justifyContent={"center"}
          textAlign={"center"}
          px={4}
          opacity={selected ? "0.75" : "1"}
        >
          <Box>
            <MaterialSymbol>image</MaterialSymbol>
            <Text fontSize={"sm"} fontWeight={"semibold"}>
              {typeof t === "function"
                ? t("fileManager.missingSelectedFile", {
                    defaultValue:
                      "Selected image is no longer available in this folder",
                  })
                : "Selected image is no longer available in this folder"}
            </Text>
          </Box>
        </Box>
      ) : (
        <Image
          borderRadius={"3xl"}
          ratio={1}
          width={200}
          height={200}
          src={src ?? ""}
          alt={
            typeof t === "function"
              ? t("fileManager.loadedImage", { defaultValue: "Loaded image" })
              : "Loaded image"
          }
          priority={false}
          opacity={selected ? "0.5" : "1"}
          objectFit={"contain"}
        />
      )}
      {fullPath && (
        <ToggleTip content={fullPath}>
          <Button
            onClick={(e) => e.stopPropagation()}
            pos={"absolute"}
            top={"2"}
            left={"2"}
            maxW={"100px"}
            size={"xs"}
            variant={"ghost"}
          >
            ...{fullPath.slice(fullPath.length - 10, fullPath.length)}
          </Button>
        </ToggleTip>
      )}
      <Show when={selected}>
        <Circle
          pos={"absolute"}
          left={"4"}
          bottom={"4"}
          size={6}
          bg={"primary.solid"}
          color={"white"}
        >
          <MaterialSymbol>check</MaterialSymbol>
        </Circle>
      </Show>
      {fullPath && (onImageDownload || onImageRemove) && (
        <HStack position={"absolute"} right={"2"} top={"2"}>
          {onImageDownload && (
            <IconButton
              variant={"ghost"}
              size={"xs"}
              onClick={(e) => handleOnImageDownload(e, fullPath)}
              aria-label={
                typeof t === "function"
                  ? t("fileManager.download", { defaultValue: "Download" })
                  : "Download"
              }
            >
              <MaterialSymbol>download</MaterialSymbol>
            </IconButton>
          )}
          {onImageRemove && (
            <IconButton
              variant={"ghost"}
              size={"xs"}
              onClick={(e) => handleOnImageRemove(e, fullPath)}
              aria-label={
                typeof t === "function"
                  ? t("fileManager.delete", { defaultValue: "Delete" })
                  : "Delete"
              }
              colorPalette={"red"}
            >
              <MaterialSymbol>delete</MaterialSymbol>
            </IconButton>
          )}
        </HStack>
      )}
    </GridItem>
  );
};

function getStoredValue(fullPath: string, includePrefix: boolean) {
  return includePrefix ? fullPath : getFileName(fullPath);
}

function getSelectedValues(value: unknown, includePrefix: boolean) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter(isString)
          .map((item) => getStoredValue(item, includePrefix)),
      ),
    );
  }

  if (isString(value) && value.trim() !== "") {
    return [getStoredValue(value, includePrefix)];
  }

  return [];
}

function setSelectedValues(
  currentValue: unknown,
  fieldData: FieldData,
  nextSelectedValues: string[],
  setValue: ReturnType<typeof useFormContext>["setValue"],
) {
  const shouldStoreArray =
    Array.isArray(currentValue) || (fieldData.imageProps?.maxNumber ?? 1) !== 1;

  setValue(
    fieldData.name,
    shouldStoreArray ? nextSelectedValues : (nextSelectedValues[0] ?? ""),
    {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    },
  );
}
