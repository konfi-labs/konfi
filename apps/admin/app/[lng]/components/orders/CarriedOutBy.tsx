import { useT } from "@/i18n/client";
import { Box, Button, Dialog, IconButton, Portal } from "@chakra-ui/react";
import {
  Avatar,
  AvatarGroup,
  type DataGridDensity,
  MaterialSymbol,
  Tooltip,
} from "@konfi/components";
import { memo, useMemo } from "react";
import CarriedOutByForm from "./CarriedOutByForm";

interface CarriedOutByCellProps {
  density?: DataGridDensity;
  value: string[] | undefined;
  updateCarriedOutBy: (carriedOutBy: string[]) => void;
  createdBy: string;
  updatedBy: string;
}

export const CarriedOutByCell = memo(
  ({
    density = "comfortable",
    value,
    updateCarriedOutBy,
    createdBy,
    updatedBy,
  }: CarriedOutByCellProps) => {
    const { t } = useT();
    const avatarSize = density === "compact" ? "xs" : "md";
    const valueWithCreatedByAndUpdatedBy = useMemo(() => {
      const members = [...(value ?? [])];
      members.unshift(createdBy);
      members.push(updatedBy);
      // Remove duplicates
      const uniqueValues = new Set(members);
      return Array.from(uniqueValues);
    }, [value, createdBy, updatedBy]);
    return (
      <Box onClick={(e) => e.stopPropagation()} position={"relative"}>
        <Tooltip
          content={valueWithCreatedByAndUpdatedBy?.join(", ")}
          lazyMount={true}
        >
          <AvatarGroup size={avatarSize} stacking={"first-on-top"}>
            {valueWithCreatedByAndUpdatedBy?.map(
              (item: string, index: number) => (
                <Avatar key={index} name={item} size={avatarSize} />
              ),
            )}
          </AvatarGroup>
        </Tooltip>
        <Dialog.Root lazyMount={true}>
          <Dialog.Trigger asChild ml={2}>
            <IconButton size={"2xs"} variant={"ghost"}>
              <MaterialSymbol>person_edit</MaterialSymbol>
            </IconButton>
          </Dialog.Trigger>
          <Portal>
            <Dialog.Backdrop />
            <Dialog.Positioner>
              <Dialog.Content>
                <Dialog.Header>
                  <Dialog.Title>
                    {t("admin.executors", { defaultValue: "Carried out by" })}
                  </Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <CarriedOutByForm
                    carriedOutBy={value}
                    updateCarriedOutBy={updateCarriedOutBy}
                  />
                </Dialog.Body>
                <Dialog.Footer>
                  <Dialog.ActionTrigger asChild>
                    <Button variant="outline">
                      {t("common.cancel", { defaultValue: "Cancel" })}
                    </Button>
                  </Dialog.ActionTrigger>
                </Dialog.Footer>
              </Dialog.Content>
            </Dialog.Positioner>
          </Portal>
        </Dialog.Root>
      </Box>
    );
  },
);
