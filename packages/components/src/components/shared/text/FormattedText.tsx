import { Text } from "@chakra-ui/react";
import { ReactNode } from "react";

interface FormattedTextProps {
  children: string;
}

export function FormattedText({ children }: FormattedTextProps) {
  if (!children) {
    return null;
  }

  // Simple function to convert basic markdown-like formatting
  const formatText = (text: string): ReactNode[] => {
    const lines = text.split("\n");

    return lines.map((line, lineIndex) => {
      // Handle basic bold (**text**) and italic (*text*) formatting
      const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);

      const formattedLine = parts.map((part, partIndex) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          // Bold text
          return (
            <Text
              as="strong"
              key={`${lineIndex}-${partIndex}`}
              fontWeight="bold"
            >
              {part.slice(2, -2)}
            </Text>
          );
        } else if (part.startsWith("*") && part.endsWith("*")) {
          // Italic text
          return (
            <Text as="em" key={`${lineIndex}-${partIndex}`} fontStyle="italic">
              {part.slice(1, -1)}
            </Text>
          );
        } else {
          // Regular text
          return part;
        }
      });

      // Add line break after each line except the last one
      return (
        <span key={lineIndex}>
          {formattedLine}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      );
    });
  };

  return <Text whiteSpace="pre-wrap">{formatText(children)}</Text>;
}
