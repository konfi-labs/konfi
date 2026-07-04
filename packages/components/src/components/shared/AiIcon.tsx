import { Sparkle, type LucideProps } from "lucide-react";
import * as React from "react";

const SPARKLES = [
  {
    key: "center",
    transform: "",
    fill: "none",
  },
  {
    key: "top-right",
    transform: "translate(17 3) scale(0.33) translate(-6 -6)",
    fill: "currentColor",
  },

] as const;

export const AiIcon = React.forwardRef<SVGSVGElement, LucideProps>(
  function AiIcon(
    {
      color = "currentColor",
      size = 24,
      strokeWidth = 2,
      absoluteStrokeWidth = false,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    const numericSize =
      typeof size === "number" ? size : Number.parseFloat(size);
    const numericStrokeWidth =
      typeof strokeWidth === "number"
        ? strokeWidth
        : Number.parseFloat(strokeWidth);
    const shouldHideFromAssistiveTech =
      children == null &&
      rest["aria-hidden"] === undefined &&
      rest["aria-label"] === undefined &&
      rest["aria-labelledby"] === undefined &&
      rest.role === undefined;
    const resolvedStrokeWidth =
      absoluteStrokeWidth &&
        Number.isFinite(numericSize) &&
        numericSize > 0 &&
        Number.isFinite(numericStrokeWidth)
        ? (numericStrokeWidth * 24) / numericSize
        : strokeWidth;

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={resolvedStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...(shouldHideFromAssistiveTech ? { "aria-hidden": true } : {})}
        {...rest}
      >
        {SPARKLES.map(({ key, transform, fill }) => (
          <Sparkle key={key} transform={transform} fill={fill} />
        ))}
        {children}
      </svg>
    );
  },
);

AiIcon.displayName = "AiIcon";
