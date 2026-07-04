"use client";

import { Preview3D } from "./Preview3D";

export interface BoxPreviewProps {
  width: number;
  height: number;
  previewURLs: string[];
  fallbackMessage?: string;
}

export function BoxPreview({
  width,
  height,
  previewURLs,
  fallbackMessage = "WebGL is not supported on this device.",
}: BoxPreviewProps) {
  return (
    <Preview3D
      fallbackMessage={fallbackMessage}
      height={height}
      previewURLs={previewURLs}
      template="BOX"
      width={width}
    />
  );
}
