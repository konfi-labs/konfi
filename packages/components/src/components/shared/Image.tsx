"use client";

import { AspectRatio } from "@chakra-ui/react";
import NextImage from "next/image";
import { useEffect, useState } from "react";
import { useColorMode } from "../ui";

export const Image = ({
  ratio,
  width,
  height,
  src,
  alt,
  priority = false,
  preload,
  fetchPriority,
  loading,
  sizes,
  objectFit = "cover",
  minW = "4em",
  transparentBackground = false,
  style,
  ...rest
}: {
  ratio: number | number[];
  width: number | `${number}` | undefined;
  height: number | `${number}` | undefined;
  src: string;
  alt: string;
  priority?: boolean;
  preload?: boolean;
  fetchPriority?: "high" | "low" | "auto";
  loading?: "eager" | "lazy";
  sizes?: string;
  objectFit?: "fill" | "contain" | "cover" | "none" | "scale-down";
  minW?: string;
  transparentBackground?: boolean;
  style?: React.CSSProperties;
  [x: string]: any;
}) => {
  const [_src, setSrc] = useState(src);
  const { colorMode } = useColorMode();

  const shimmer = (w: number, h: number) => {
    const isDark = colorMode === "dark";
    const baseColor = isDark ? "#1a1a1a" : "#f6f7f8";
    const shimmerColor = isDark ? "#2d2d2d" : "#edeef1";

    return `
    <svg width="${w}" height="${h}" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <defs>
        <linearGradient id="g">
          <stop stop-color="${baseColor}" offset="20%" />
          <stop stop-color="${shimmerColor}" offset="50%" />
          <stop stop-color="${baseColor}" offset="70%" />
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="${baseColor}" />
      <rect id="r" width="${w}" height="${h}" fill="url(#g)" />
      <animate xlink:href="#r" attributeName="x" from="-${w}" to="${w}" dur="1.5s" repeatCount="indefinite" />
    </svg>`;
  };

  useEffect(() => {
    setSrc(src);
  }, [src]);

  const toBase64 = (str: string) =>
    typeof window === "undefined"
      ? Buffer.from(str).toString("base64")
      : window.btoa(str);

  // Use fill prop when we have an aspect ratio container
  const useFill = ratio !== undefined;
  const resolvedPreload = preload ?? priority;
  const resolvedFetchPriority = fetchPriority ??
    (resolvedPreload ? "high" : undefined);
  const resolvedSizes = useFill
    ? (sizes ?? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw")
    : sizes;

  return (
    <AspectRatio
      bgColor={
        transparentBackground
          ? "transparent"
          : { base: "gray.50", _dark: "gray.900" }
      }
      position="relative"
      minW={minW}
      ratio={ratio}
      overflow="hidden"
      {...rest}
    >
      {useFill ? (
        <NextImage
          fill
          style={{ objectFit, ...style }}
          preload={resolvedPreload}
          fetchPriority={resolvedFetchPriority}
          loading={loading}
          src={_src}
          alt={alt}
          onError={() => setSrc("/assets/empty.avif")}
          placeholder={`data:image/svg+xml;base64,${toBase64(shimmer(Number(width) || 700, Number(height) || 700))}`}
          sizes={resolvedSizes}
        />
      ) : (
        <NextImage
          style={{ objectFit, ...style }}
          width={width}
          height={height}
          preload={resolvedPreload}
          fetchPriority={resolvedFetchPriority}
          loading={loading}
          sizes={resolvedSizes}
          src={_src}
          alt={alt}
          onError={() => setSrc("/assets/empty.avif")}
          placeholder={`data:image/svg+xml;base64,${toBase64(shimmer(Number(width), Number(height)))}`}
        />
      )}
    </AspectRatio>
  );
};
