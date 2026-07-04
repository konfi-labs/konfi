export interface TextureAspectTransform {
  offset: readonly [number, number];
  repeat: readonly [number, number];
}

export const IDENTITY_TEXTURE_ASPECT_TRANSFORM: TextureAspectTransform = {
  offset: [0, 0],
  repeat: [1, 1],
};

export function getTextureAspectTransform({
  sourceHeight,
  sourceWidth,
  targetHeight,
  targetWidth,
}: {
  sourceHeight: number;
  sourceWidth: number;
  targetHeight: number;
  targetWidth: number;
}): TextureAspectTransform {
  if (
    sourceHeight <= 0 ||
    sourceWidth <= 0 ||
    targetHeight <= 0 ||
    targetWidth <= 0
  ) {
    return IDENTITY_TEXTURE_ASPECT_TRANSFORM;
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;

  if (!Number.isFinite(sourceAspect) || !Number.isFinite(targetAspect)) {
    return IDENTITY_TEXTURE_ASPECT_TRANSFORM;
  }

  if (Math.abs(sourceAspect - targetAspect) < 0.001) {
    return IDENTITY_TEXTURE_ASPECT_TRANSFORM;
  }

  if (sourceAspect > targetAspect) {
    const repeatX = targetAspect / sourceAspect;

    return {
      offset: [(1 - repeatX) / 2, 0],
      repeat: [repeatX, 1],
    };
  }

  const repeatY = sourceAspect / targetAspect;

  return {
    offset: [0, (1 - repeatY) / 2],
    repeat: [1, repeatY],
  };
}
