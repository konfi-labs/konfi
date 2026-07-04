import { Text } from "@chakra-ui/react";
import { Order } from "@konfi/types";
import { formatDate } from "@konfi/utils";
import { TFunction } from "i18next";

interface Props {
  id: string;
  updatedAt: Order["updatedAt"];
  updatedBy?: Order["updatedBy"];
  createdAt: Order["createdAt"];
  createdBy?: Order["createdBy"];
  t: TFunction;
  lng?: string;
}

export function CustomerInfo({
  id,
  updatedAt,
  updatedBy,
  createdAt,
  createdBy,
  t,
  lng,
}: Props) {
  return (
    <Text mt={["6", "8"]} color={{ base: "gray.600", _dark: "gray.400" }}>
      {t("orderPage.detailsInfo.id")}: {id},{" "}
      {t("orderPage.detailsInfo.updatedAt")}:{" "}
      {formatDate(updatedAt, lng ?? "pl", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
      , {updatedBy?.name}, {t("orderPage.detailsInfo.createdAt")}:{" "}
      {formatDate(createdAt, lng ?? "pl", {
        dateStyle: "medium",
        timeStyle: "short",
      })}
      , {createdBy?.name}
    </Text>
  );
}
