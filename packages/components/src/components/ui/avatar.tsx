"use client";

import type { GroupProps, SlotRecipeProps } from "@chakra-ui/react";
import { Avatar as ChakraAvatar, Group } from "@chakra-ui/react";
import * as React from "react";

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement>;

export interface AvatarProps extends ChakraAvatar.RootProps {
  name?: string;
  src?: string;
  srcSet?: string;
  loading?: ImageProps["loading"];
  icon?: React.ReactElement<any>;
  fallback?: React.ReactNode;
}

export const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  function Avatar(props, ref) {
    const { name, src, srcSet, loading, icon, fallback, children, ...rest } =
      props;
    return (
      <ChakraAvatar.Root ref={ref} {...rest}>
        <AvatarFallback name={name} icon={icon}>
          {fallback}
        </AvatarFallback>
        <ChakraAvatar.Image src={src} srcSet={srcSet} loading={loading} />
        {children}
      </ChakraAvatar.Root>
    );
  },
);

interface AvatarFallbackProps extends ChakraAvatar.FallbackProps {
  name?: string;
  icon?: React.ReactElement<any>;
}

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  function AvatarFallback(props, ref) {
    const { name, icon, children, style, ...rest } = props;
    const fallbackStyle = React.useMemo(() => {
      if (name == null || name.trim().length === 0) {
        return undefined;
      }
      return getAvatarGradientStyle(name);
    }, [name]);
    const mergedStyle =
      fallbackStyle == null ? style : { ...fallbackStyle, ...style };
    return (
      <ChakraAvatar.Fallback ref={ref} style={mergedStyle} {...rest}>
        {children}
        {name != null && children == null && <>{getInitials(name)}</>}
        {name == null && children == null && (
          <ChakraAvatar.Icon asChild={!!icon}>{icon}</ChakraAvatar.Icon>
        )}
      </ChakraAvatar.Fallback>
    );
  },
);

function getInitials(name: string) {
  const names = name.trim().split(" ");
  const firstName = names[0] != null ? names[0] : "";
  const lastName = names.length > 1 ? names[names.length - 1] : "";
  return firstName && lastName
    ? `${firstName.charAt(0)}${lastName.charAt(0)}`
    : firstName.charAt(0);
}

function getAvatarGradientStyle(name: string): React.CSSProperties {
  const normalizedName = name.trim().toLowerCase();
  const seed = hashString(normalizedName);
  const rng = mulberry32(seed);
  const palette = buildGradientPalette(rng);
  const radialLayerCount = 3 + Math.floor(randomBetween(rng, 0, 2));
  const radialLayers = Array.from({ length: radialLayerCount }, (_, index) => {
    const sizeX = Math.round(randomBetween(rng, 60, 120));
    const sizeY = Math.round(randomBetween(rng, 65, 125));
    const posX = Math.round(randomBetween(rng, 0, 100));
    const posY = Math.round(randomBetween(rng, 0, 100));
    const midStop = Math.round(randomBetween(rng, 42, 62));
    const color = palette.vivid[index % palette.vivid.length];
    const mist = palette.mist[index % palette.mist.length];
    return `radial-gradient(${sizeX}% ${sizeY}% at ${posX}% ${posY}%, ${color} 0%, ${mist} ${midStop}%, transparent 100%)`;
  });

  const angle = Math.round(randomBetween(rng, 95, 165));
  const linearLayer = `linear-gradient(${angle}deg, ${palette.vivid[0]} 0%, ${palette.vivid[1]} 100%)`;
  const softOverlay = `radial-gradient(90% 90% at 50% 50%, ${palette.soft} 0%, transparent 70%)`;
  const layerCount = radialLayers.length + 2;
  const backgroundPosition = Array(layerCount).fill("0px 0px").join(",");
  const backgroundSize = Array(layerCount).fill("100% 100%").join(",");

  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundImage: [...radialLayers, softOverlay, linearLayer].join(","),
    backgroundPosition,
    backgroundSize,
    backgroundRepeat: "no-repeat",
    backgroundColor: "transparent",
    color: "#fff",
  };
}

function buildGradientPalette(rng: () => number): GradientPalette {
  const paletteIndex = Math.floor(
    randomBetween(rng, 0, GRADIENT_PALETTES.length),
  );
  const palette = GRADIENT_PALETTES[paletteIndex] ?? GRADIENT_PALETTES[0];
  const vivid = palette.map((color) =>
    toHsla(
      color.hue,
      color.saturation,
      color.lightness,
      randomBetween(rng, 0.62, 0.86),
    ),
  );
  const mist = palette.map((color) =>
    toHsla(
      color.hue,
      Math.max(40, color.saturation - 18),
      Math.min(78, color.lightness + 6),
      randomBetween(rng, 0.16, 0.32),
    ),
  );
  const softWhite = `hsla(0 0% 100% / ${randomBetween(rng, 0.1, 0.26).toFixed(2)})`;
  return { vivid, mist, soft: softWhite };
}

type GradientColor = {
  hue: number;
  saturation: number;
  lightness: number;
};

type GradientPalette = {
  vivid: string[];
  mist: string[];
  soft: string;
};

const GRADIENT_PALETTES: GradientColor[][] = [
  [
    { hue: 12, saturation: 92, lightness: 64 },
    { hue: 34, saturation: 90, lightness: 66 },
    { hue: 56, saturation: 88, lightness: 64 },
    { hue: 198, saturation: 82, lightness: 64 },
  ],
  [
    { hue: 328, saturation: 86, lightness: 66 },
    { hue: 298, saturation: 82, lightness: 64 },
    { hue: 24, saturation: 90, lightness: 66 },
    { hue: 160, saturation: 78, lightness: 62 },
  ],
  [
    { hue: 6, saturation: 88, lightness: 64 },
    { hue: 42, saturation: 92, lightness: 66 },
    { hue: 78, saturation: 84, lightness: 62 },
    { hue: 210, saturation: 82, lightness: 64 },
  ],
  [
    { hue: 190, saturation: 88, lightness: 66 },
    { hue: 222, saturation: 84, lightness: 64 },
    { hue: 252, saturation: 80, lightness: 63 },
    { hue: 284, saturation: 78, lightness: 65 },
  ],
  [
    { hue: 150, saturation: 80, lightness: 60 },
    { hue: 170, saturation: 84, lightness: 62 },
    { hue: 195, saturation: 86, lightness: 64 },
    { hue: 220, saturation: 82, lightness: 66 },
  ],
  [
    { hue: 120, saturation: 78, lightness: 60 },
    { hue: 145, saturation: 82, lightness: 62 },
    { hue: 170, saturation: 84, lightness: 64 },
    { hue: 200, saturation: 82, lightness: 66 },
  ],
  [
    { hue: 230, saturation: 86, lightness: 66 },
    { hue: 260, saturation: 82, lightness: 64 },
    { hue: 288, saturation: 78, lightness: 64 },
    { hue: 316, saturation: 76, lightness: 66 },
  ],
  [
    { hue: 210, saturation: 86, lightness: 64 },
    { hue: 240, saturation: 84, lightness: 66 },
    { hue: 268, saturation: 80, lightness: 64 },
    { hue: 296, saturation: 78, lightness: 66 },
  ],
  [
    { hue: 176, saturation: 82, lightness: 62 },
    { hue: 196, saturation: 86, lightness: 64 },
    { hue: 218, saturation: 84, lightness: 66 },
    { hue: 242, saturation: 78, lightness: 66 },
  ],
  [
    { hue: 260, saturation: 82, lightness: 64 },
    { hue: 286, saturation: 80, lightness: 66 },
    { hue: 314, saturation: 78, lightness: 66 },
    { hue: 338, saturation: 76, lightness: 66 },
  ],
  [
    { hue: 132, saturation: 76, lightness: 60 },
    { hue: 156, saturation: 82, lightness: 62 },
    { hue: 182, saturation: 86, lightness: 64 },
    { hue: 208, saturation: 84, lightness: 66 },
  ],
  [
    { hue: 18, saturation: 90, lightness: 65 },
    { hue: 52, saturation: 92, lightness: 66 },
    { hue: 286, saturation: 80, lightness: 64 },
    { hue: 196, saturation: 82, lightness: 64 },
  ],
  [
    { hue: 340, saturation: 84, lightness: 66 },
    { hue: 14, saturation: 90, lightness: 64 },
    { hue: 44, saturation: 92, lightness: 66 },
    { hue: 170, saturation: 80, lightness: 62 },
  ],
  [
    { hue: 26, saturation: 92, lightness: 66 },
    { hue: 64, saturation: 88, lightness: 64 },
    { hue: 112, saturation: 78, lightness: 60 },
    { hue: 216, saturation: 82, lightness: 64 },
  ],
];

function toHsla(
  hue: number,
  saturation: number,
  lightness: number,
  alpha: number,
): string {
  return `hsla(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(lightness)}% / ${alpha.toFixed(2)})`;
}

function randomBetween(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface AvatarGroupProps extends GroupProps, SlotRecipeProps<"avatar"> { }

export const AvatarGroup = React.forwardRef<HTMLDivElement, AvatarGroupProps>(
  function AvatarGroup(props, ref) {
    const { size, variant, borderless, ...rest } = props;
    return (
      <ChakraAvatar.PropsProvider value={{ size, variant, borderless }}>
        <Group gap="0" spaceX="-3" ref={ref} {...rest} />
      </ChakraAvatar.PropsProvider>
    );
  },
);
