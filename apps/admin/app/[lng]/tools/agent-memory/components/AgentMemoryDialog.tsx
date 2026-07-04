"use client";

import { useT } from "@/i18n/client";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import { MaterialSymbol } from "@konfi/components";
import type { FormEvent } from "react";
import { AgentMemoryForm } from "./AgentMemoryForm";
import {
  isAgentMemoryFormSubmittable,
  type AgentMemoryFormState,
} from "./agent-memory-form-state";

export type AgentMemoryDialogMode = "create" | "edit" | "review";

export function AgentMemoryDialog({
  formState,
  mode,
  open,
  submitting,
  onClose,
  onFormChange,
  onSubmit,
}: {
  formState: AgentMemoryFormState;
  mode: AgentMemoryDialogMode | null;
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onFormChange: (state: AgentMemoryFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const { t } = useT();
  const title =
    mode === "create"
      ? t("agentMemory.dialog.createTitle", {
          defaultValue: "Create memory",
        })
      : mode === "review"
        ? t("agentMemory.dialog.reviewTitle", {
            defaultValue: "Review memory proposal",
          })
        : t("agentMemory.dialog.editTitle", {
            defaultValue: "Edit memory",
          });
  const submitLabel =
    mode === "review"
      ? t("agentMemory.actions.approve", { defaultValue: "Approve" })
      : mode === "edit"
        ? t("agentMemory.actions.save", { defaultValue: "Save" })
        : t("agentMemory.actions.create", { defaultValue: "Create" });

  return (
    <Dialog.Root
      lazyMount
      unmountOnExit
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size="xl"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.CloseTrigger />
            <form id="agent-memory-form" onSubmit={onSubmit}>
              <Dialog.Body pb={6}>
                <AgentMemoryForm state={formState} onChange={onFormChange} />
              </Dialog.Body>
              <Dialog.Footer>
                <Button variant="outline" onClick={onClose}>
                  {t("actions.cancel", { defaultValue: "Cancel" })}
                </Button>
                <Button
                  type="submit"
                  colorPalette="primary"
                  loading={submitting}
                  disabled={!isAgentMemoryFormSubmittable(formState)}
                >
                  <MaterialSymbol>
                    {mode === "review" ? "check" : "save"}
                  </MaterialSymbol>
                  {submitLabel}
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
