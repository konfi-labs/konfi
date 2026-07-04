import { useT } from "@/i18n/client";
import type {
  FileUploadFileError,
  FileUploadFileRejection,
  FileUploadRootProps,
} from "@chakra-ui/react";
import {
  Box,
  Center,
  FileUpload,
  Heading,
  HStack,
  List,
  Text,
} from "@chakra-ui/react";
import { MaterialSymbol, Tag } from "@konfi/components";
import { FileMimeType } from "@konfi/utils";
import { useState } from "react";

type DropzoneAccept = FileUploadRootProps["accept"];

export default function Dropzone({
  onFilesAccepted,
  accept,
}: {
  onFilesAccepted: (files: File[]) => void;
  accept: DropzoneAccept | undefined;
}) {
  const { t, i18n } = useT();
  const [acceptedFiles, setAcceptedFiles] = useState<File[]>([]);
  const [fileRejections, setFileRejections] = useState<
    FileUploadFileRejection[]
  >([]);
  const maxSize = 52428800;
  const maxFiles = 10;

  const formatter = new Intl.NumberFormat(i18n.resolvedLanguage, {
    style: "decimal",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

  const activeBg = { base: "blackAlpha.50", _dark: "whiteAlpha.50" };

  const acceptedFormatLabels = getAcceptedFormatLabels(accept);

  const acceptedFileItems = acceptedFiles.map((file, index) => (
    <List.Item key={getFileKey(file, index)}>
      {file.name} - {formatter.format(file.size / (1024 * 1024))} MB
    </List.Item>
  ));

  const getFileErrorMessage = (error: FileUploadFileError): string => {
    switch (error) {
      case "FILE_INVALID_TYPE":
        return t("store.fileInvalidType", {
          defaultValue: "Invalid file type",
        });
      case "FILE_TOO_LARGE":
        return t("store.fileTooLarge", {
          defaultValue: "File is too large",
        });
      case "FILE_TOO_SMALL":
        return t("store.fileTooSmall", {
          defaultValue: "File is too small",
        });
      case "TOO_MANY_FILES":
        return t("store.tooManyFiles", {
          defaultValue: "Too many files",
        });
      case "FILE_EXISTS":
        return t("store.fileExists", {
          defaultValue: "File already selected",
        });
      case "FILE_INVALID":
        return t("store.fileInvalid", {
          defaultValue: "File couldn't be uploaded",
        });
      default:
        return String(error);
    }
  };

  const fileRejectionItems = fileRejections.map(({ file, errors }, index) => (
    <List.Item key={getFileKey(file, index)}>
      {file.name} - {formatter.format(file.size / (1024 * 1024))} MB
      <List.Root variant={"plain"}>
        {errors.map((error) => (
          <List.Item key={error}>{getFileErrorMessage(error)}</List.Item>
        ))}
      </List.Root>
    </List.Item>
  ));

  return (
    <Box>
      <FileUpload.Root
        accept={accept}
        alignItems="stretch"
        maxFiles={maxFiles}
        maxFileSize={maxSize}
        onFileAccept={({ files }) => {
          setFileRejections([]);
          onFilesAccepted(files);
        }}
        onFileChange={({
          acceptedFiles: nextAcceptedFiles,
          rejectedFiles: nextRejectedFiles,
        }) => {
          setAcceptedFiles(nextAcceptedFiles);
          setFileRejections(nextRejectedFiles);
        }}
        onFileReject={({ files }) => setFileRejections(files)}
      >
        <FileUpload.HiddenInput />
        <FileUpload.Context>
          {({ dragging }) => {
            const dropText = dragging
              ? t("store.dropFilesHere", {
                  defaultValue: "Drop files here...",
                })
              : t("store.dragFileHere", {
                  defaultValue: "Drag file here or click to select file.",
                });
            const borderColor = dragging
              ? { base: "blackAlpha.600", _dark: "whiteAlpha.600" }
              : { base: "blackAlpha.900", _dark: "whiteAlpha.900" };

            return (
              <FileUpload.Dropzone asChild>
                <Center
                  p={4}
                  cursor="pointer"
                  bg={dragging ? activeBg : "transparent"}
                  _hover={{ bg: activeBg }}
                  transition="background-color 0.2s ease"
                  borderRadius="3xl"
                  border="3px dashed"
                  borderColor={borderColor}
                  minH={"200px"}
                >
                  <MaterialSymbol aria-hidden="true">
                    cloud_upload
                  </MaterialSymbol>
                  <Text ml={2}>{dropText}</Text>
                </Center>
              </FileUpload.Dropzone>
            );
          }}
        </FileUpload.Context>
      </FileUpload.Root>
      <HStack mt={"6"}>
        <Text mt={0} fontWeight={"600"} fontSize={"sm"}>
          {t("store.acceptedFileFormats", {
            defaultValue: "Accepted file formats:",
          })}{" "}
        </Text>
        <Box>
          {acceptedFormatLabels.map((label) => (
            <Tag m={"2px"} size={"sm"} key={label}>
              {label}
            </Tag>
          ))}
        </Box>
      </HStack>
      <Text fontWeight={"600"} fontSize={"sm"}>
        {t("store.maxFileSize", { defaultValue: "Maximum file size:" })}{" "}
        {formatter.format(maxSize / (1024 * 1024))} MB
      </Text>
      {acceptedFileItems.length >= 1 && (
        <Box mt={"6"}>
          <Heading mt={"2"} size={"sm"}>
            {t("store.acceptedFiles", { defaultValue: "Accepted files:" })}
          </Heading>
          <List.Root variant={"plain"}>{acceptedFileItems}</List.Root>
        </Box>
      )}
      {fileRejectionItems.length >= 1 && (
        <Box mt={acceptedFileItems.length >= 1 ? "2" : "6"}>
          <Heading mt={"2"} size={"sm"}>
            {t("store.rejectedFiles", { defaultValue: "Rejected files:" })}
          </Heading>
          <List.Root variant={"plain"}>{fileRejectionItems}</List.Root>
        </Box>
      )}
    </Box>
  );
}

function getAcceptedFormatLabels(accept: DropzoneAccept | undefined): string[] {
  if (accept === undefined) return [];

  if (typeof accept === "string") {
    return [getAcceptedFormatLabel(accept)];
  }

  if (Array.isArray(accept)) {
    return accept.map(getAcceptedFormatLabel);
  }

  return Object.keys(accept).map(getAcceptedFormatLabel);
}

function getAcceptedFormatLabel(mimeType: string): string {
  const extension = FileMimeType[mimeType];
  if (extension === undefined) return mimeType;
  return `.${extension}`;
}

function getFileKey(file: File, index: number): string {
  return `${file.name}-${file.size}-${file.lastModified}-${index}`;
}
