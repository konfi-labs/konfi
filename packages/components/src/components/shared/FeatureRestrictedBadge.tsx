import { Badge, type BadgeProps } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface FeatureRestrictedBadgeProps extends BadgeProps {
  children: ReactNode;
}

export function FeatureRestrictedBadge({
  children,
  ...props
}: FeatureRestrictedBadgeProps) {
  return (
    <Badge colorPalette="orange" variant="subtle" {...props}>
      {children}
    </Badge>
  );
}
