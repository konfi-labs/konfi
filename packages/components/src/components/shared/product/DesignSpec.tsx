"use client";

import { Box, Button, Heading, Table, VStack } from "@chakra-ui/react";
import { Configuration, Product } from "@konfi/types";
import { isUndefined } from "es-toolkit";
import { isEmpty } from "es-toolkit/compat";
import { TFunction } from "i18next";
import { MaterialSymbol } from "../MaterialSymbol";

interface Props {
  product: Product;
  configuration: Configuration;
  format: (number | null)[];
  download:
  | ((
    url?: string | undefined,
    preview?: boolean | undefined,
  ) => Promise<void>)
  | undefined;
  templates:
  | {
    name: string;
    url: string;
    attributeOptions?: string[];
  }[]
  | undefined;
  t: TFunction;
}

export function DesignSpec({
  product,
  configuration,
  format,
  download,
  templates,
  t,
}: Props) {
  return (
    <Box mt={"8"} pl={[0, 6]} textAlign={"right"}>
      <Heading fontSize={"xl"} mb={"3"}>
        {t("designSpec.heading", { defaultValue: "How to prepare files?" })}
      </Heading>
      <Table.Root size="sm">
        <Table.Body>
          {product.designSpec?.dpi && (
            <Table.Row>
              <Table.Cell>
                {t("designSpec.minResolution", {
                  defaultValue: "Minimum resolution",
                })}
              </Table.Cell>
              <Table.Cell textAlign={"end"}>
                {product.designSpec.dpi} dpi
              </Table.Cell>
            </Table.Row>
          )}
          <Table.Row>
            <Table.Cell>
              {t("designSpec.colors", { defaultValue: "Colors" })}
            </Table.Cell>
            <Table.Cell textAlign={"end"}>CMYK</Table.Cell>
          </Table.Row>
          {configuration.customFormat ? (
            product.designSpec?.bleed ? (
              <Table.Row>
                <Table.Cell>
                  {t("designSpec.grossFormat", {
                    defaultValue: "Gross format (before trimming)",
                  })}
                </Table.Cell>
                <Table.Cell
                  textAlign={"end"}
                >{`${configuration.width + product.designSpec.bleed} x ${configuration.height + product.designSpec.bleed} mm`}</Table.Cell>
              </Table.Row>
            ) : null
          ) : format[format.length > 2 ? 1 : 0] &&
            format[1] &&
            product.designSpec?.bleed ? (
            <Table.Row>
              <Table.Cell>
                {t("designSpec.grossFormat", {
                  defaultValue: "Gross format (before trimming)",
                })}
              </Table.Cell>
              {format[0] && (
                <Table.Cell
                  textAlign={"end"}
                >{`${format[0] + product.designSpec.bleed} x ${format[1] + product.designSpec.bleed} mm`}</Table.Cell>
              )}
            </Table.Row>
          ) : null}
          {configuration.customFormat ? (
            <Table.Row>
              <Table.Cell>
                {t("designSpec.netFormat", {
                  defaultValue: "Net format (after trimming)",
                })}
              </Table.Cell>
              <Table.Cell
                textAlign={"end"}
              >{`${configuration.width} x ${configuration.height} mm`}</Table.Cell>
            </Table.Row>
          ) : (
            format[0] &&
            format[1] && (
              <Table.Row>
                <Table.Cell>
                  {t("designSpec.netFormat", {
                    defaultValue: "Net format (after trimming)",
                  })}
                </Table.Cell>
                <Table.Cell
                  textAlign={"end"}
                >{`${format[0]} x ${format[1]} mm`}</Table.Cell>
              </Table.Row>
            )
          )}
          {product.designSpec?.bleed ? (
            <Table.Row>
              <Table.Cell>
                {t("designSpec.bleed", { defaultValue: "Bleed" })}
              </Table.Cell>
              <Table.Cell textAlign={"end"}>
                {product.designSpec?.bleed} mm
              </Table.Cell>
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table.Root>
      {!isUndefined(download) && templates && !isEmpty(templates) && (
        <VStack align={"end"} mt={"6"} gap={2}>
          <Heading fontSize={"xl"}>
            {t("designSpec.templates", { defaultValue: "Templates" })}
          </Heading>
          {templates.map((template, index) => (
            <Button
              key={index}
              colorPalette={"primary"}
              mt={2}
              onClick={() => download(template.url)}
            >
              <MaterialSymbol style={{ fontSize: "20px" }}>
                download
              </MaterialSymbol>
              {t("designSpec.downloadTemplate", {
                defaultValue: "Download template {{name}}",
                name: template.name,
              })}

              <MaterialSymbol style={{ fontSize: "20px" }}>
                picture_as_pdf
              </MaterialSymbol>
            </Button>
          ))}
        </VStack>
      )}
    </Box>
  );
}
