import { chakra } from "@chakra-ui/react";
import * as React from "react";
import { getLucideIconForMaterialSymbol } from "./materialSymbolToLucide";

export interface MaterialSymbolProps extends React.ComponentPropsWithoutRef<
  typeof chakra.span
> {
  children: React.ReactNode;
  fontSize?: string | number;
  strokeWidth?: number;
  absoluteStrokeWidth?: boolean;
}

interface ResolvedSize {
  cssSize: string;
  lucideSize: string | number;
  numericSize: number | undefined;
}

function resolveSize(fontSize: string | number): ResolvedSize {
  if (typeof fontSize === "number") {
    return {
      cssSize: `${fontSize}px`,
      lucideSize: fontSize,
      numericSize: fontSize,
    };
  }

  if (/^\d+(\.\d+)?$/.test(fontSize)) {
    const num = parseFloat(fontSize);
    return { cssSize: `${num}px`, lucideSize: num, numericSize: num };
  }

  if (/^\d+(\.\d+)?px$/i.test(fontSize)) {
    const num = parseFloat(fontSize);
    return { cssSize: fontSize, lucideSize: num, numericSize: num };
  }

  // Relative unit (em, rem, %, etc.) — pass through as string
  return { cssSize: fontSize, lucideSize: fontSize, numericSize: undefined };
}

function getIconName(children: React.ReactNode) {
  const text = React.Children.toArray(children)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : "",
    )
    .join("")
    .trim();

  return text || undefined;
}

function getDerivedStrokeWidth(
  fontWeight: React.ComponentPropsWithoutRef<typeof chakra.span>["fontWeight"],
  strokeWidth: number | undefined,
) {
  if (strokeWidth !== undefined) {
    return strokeWidth;
  }

  if (typeof fontWeight === "number") {
    if (fontWeight >= 700) {
      return 3;
    }

    if (fontWeight >= 600) {
      return 2.75;
    }

    if (fontWeight <= 300) {
      return 2;
    }

    return 2.5;
  }

  if (fontWeight === "bold") {
    return 3;
  }

  if (fontWeight === "semibold") {
    return 2.75;
  }

  return 2.5;
}

export const MaterialSymbol = React.forwardRef<
  HTMLSpanElement,
  MaterialSymbolProps
>(function MaterialSymbol(props, ref) {
  const {
    children,
    className,
    fontSize = "1.1em",
    strokeWidth,
    absoluteStrokeWidth = true,
    ...rest
  } = props;
  const { cssSize, lucideSize, numericSize } = resolveSize(fontSize);
  const iconName = getIconName(children);
  const IconComponent = getLucideIconForMaterialSymbol(iconName);
  const baseStrokeWidth = getDerivedStrokeWidth(
    rest.fontWeight,
    strokeWidth,
  );
  // Boost stroke weight for smaller icons (perceptual compensation)
  const derivedStrokeWidth =
    numericSize !== undefined && numericSize < 24
      ? baseStrokeWidth * (1 + ((24 - numericSize) / 24) * 0.5)
      : baseStrokeWidth;

  return (
    <chakra.span
      ref={ref}
      className={className}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      lineHeight="1"
      fontSize={cssSize}
      userSelect="none"
      verticalAlign="middle"
      {...rest}
    >
      <IconComponent
        size={lucideSize}
        color="currentColor"
        strokeWidth={derivedStrokeWidth}
        absoluteStrokeWidth={
          numericSize !== undefined && absoluteStrokeWidth
        }
        aria-hidden="true"
        focusable="false"
      />
    </chakra.span>
  );
});

export const Icon = MaterialSymbol;
export type IconProps = MaterialSymbolProps;
