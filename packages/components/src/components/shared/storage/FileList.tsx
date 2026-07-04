"use client";

import { Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ListResults } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { i18n, TFunction } from "i18next";
import { SetStateAction } from "react";
import { MaterialSymbol } from "../MaterialSymbol";

export const FileList = ({
  listResults,
  onFilePreview,
  onFileDownload,
  onFileDelete,
  setDirtyFlag,
  dirtyFlag,
  t,
  i18n,
}: {
  listResults: ListResults[];
  onFilePreview?: (url?: string) => Promise<void>;
  onFileDownload: (url?: string) => Promise<void>;
  onFileDelete?: (
    url?: string,
    setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined,
    dirtyFlag?: boolean,
  ) => Promise<void>;
  setDirtyFlag?: ((value: SetStateAction<boolean>) => void) | undefined;
  dirtyFlag?: boolean;
  t: TFunction;
  i18n: i18n;
}) => {
  return (
    <VStack gap={2}>
      {listResults?.map((listResult: ListResults, index) => (
        <Box
          key={index}
          p={4}
          w={"100%"}
          border={"1px solid"}
          borderRadius="3xl"
          borderColor={"gray.muted"}
        >
          <HStack gap={4} w={"full"} align={"start"}>
            <Box
              p={"6px"}
              top={"2px"}
              pb={0}
              borderRadius={"md"}
              border={"1px solid"}
              borderColor={"gray.muted"}
            >
              <MaterialSymbol>insert_drive_file</MaterialSymbol>
            </Box>
            <VStack gap={0} align={"start"}>
              <Text fontWeight={"600"}>{listResult.storageReference.name}</Text>
              <Text>
                {new Intl.NumberFormat(i18n.resolvedLanguage, {
                  style: "decimal",
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                }).format(listResult.metadata.size / (1024 * 1024))}{" "}
                MB
              </Text>
            </VStack>
            <HStack ml={"auto"}>
              {!isUndefined(onFilePreview) && (
                <IconButton
                  variant={"ghost"}
                  onClick={() =>
                    onFilePreview(listResult.storageReference.fullPath)
                  }
                  aria-label={"Pobierz"}
                >
                  <MaterialSymbol>preview</MaterialSymbol>
                </IconButton>
              )}
              <IconButton
                variant={"ghost"}
                onClick={() =>
                  onFileDownload(listResult.storageReference.fullPath)
                }
                aria-label={"Pobierz"}
              >
                <MaterialSymbol>download</MaterialSymbol>
              </IconButton>
              {!isUndefined(onFileDelete) &&
                !isUndefined(setDirtyFlag) &&
                !isUndefined(dirtyFlag) && (
                  <IconButton
                    variant={"ghost"}
                    onClick={() =>
                      onFileDelete(
                        listResult.storageReference.fullPath,
                        setDirtyFlag,
                        dirtyFlag,
                      )
                    }
                    aria-label={"Pobierz"}
                  >
                    <MaterialSymbol>delete</MaterialSymbol>
                  </IconButton>
                )}
            </HStack>
          </HStack>
        </Box>
      ))}
    </VStack>
  );
};
