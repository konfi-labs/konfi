import { generateAdminText } from "@/actions/ai";
import { Button } from "@chakra-ui/react";
import { MaterialSymbol, toaster } from "@konfi/components";
import { FieldData } from "@konfi/types";
import { startTransition } from "react";
import { FieldValues, UseFormSetValue } from "react-hook-form";

async function streamGenerateAdminText(params: {
  systemPrompt: string;
  context: string;
  modelId?: string;
  onUpdate: (fullText: string) => void;
}): Promise<string> {
  const response = await fetch("/api/ai/generate-stream", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemPrompt: params.systemPrompt,
      context: params.context,
      modelId: params.modelId,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `AI generate stream failed: ${response.status} ${response.statusText}. ${text}`,
    );
  }

  if (!response.body) {
    const text = await response.text();
    params.onUpdate(text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let fullText = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
    params.onUpdate(fullText);
  }

  return fullText;
}

const Generate = ({
  fieldData,
  setValue,
  systemPrompt,
  context,
  onLoadingChange,
}: {
  fieldData: FieldData;
  setValue: UseFormSetValue<FieldValues>;
  systemPrompt: string;
  context: string;
  onLoadingChange?: (loading: boolean) => void;
}) => {
  function generateValue(systemPrompt: string, context: string) {
    onLoadingChange?.(true);
    startTransition(async () => {
      const modelId = fieldData.generate?.model;

      const promise = fieldData.generate?.stream
        ? streamGenerateAdminText({
          systemPrompt,
          context,
          modelId,
          onUpdate: (text) => {
            setValue(fieldData.name, text);
          },
        })
        : generateAdminText({
          systemPrompt,
          context,
          modelId,
        });

      toaster.promise(promise, {
        loading: {
          title: "Generowanie",
          description: "Generowanie wartości...",
        },
        success: {
          title: "Wygenerowano",
          description: "Wartość została wygenerowana",
        },
        error: {
          title: "Błąd",
          description: "Wystąpił błąd podczas generowania wartości",
        },
      });
      try {
        const result = await promise;
        startTransition(() => {
          setValue(fieldData.name, result);
        });
      } catch (error) {
        console.error("Error generating value:", error);
        toaster.error({
          title: "Błąd",
          description: "Wystąpił błąd podczas generowania wartości",
        });
      } finally {
        onLoadingChange?.(false);
      }
    });
  }

  return (
    <Button
      top={"0"}
      right={"0"}
      position={"absolute"}
      zIndex={2}
      size={"xs"}
      colorPalette={"primary"}
      onClick={() => generateValue(systemPrompt, context)}
      aria-label={"Wygeneruj"}
    >
      <MaterialSymbol>wand_sparkles</MaterialSymbol>
      Wygeneruj
    </Button>
  );
};

export default Generate;
