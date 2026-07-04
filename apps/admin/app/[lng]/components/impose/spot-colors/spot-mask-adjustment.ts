export const DEFAULT_SPOT_CHOKE_BLEED_MM = 0;
export const MIN_SPOT_CHOKE_BLEED_MM = -10;
export const MAX_SPOT_CHOKE_BLEED_MM = 10;

export function normalizeSpotChokeBleedMm(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SPOT_CHOKE_BLEED_MM;
  }

  return Math.min(
    MAX_SPOT_CHOKE_BLEED_MM,
    Math.max(MIN_SPOT_CHOKE_BLEED_MM, value),
  );
}

export function adjustSpotMask(params: {
  height: number;
  mask: Uint8Array;
  pageHeightPt: number;
  pageWidthPt: number;
  width: number;
  chokeBleedMm: number;
}): Uint8Array {
  const { height, mask, pageHeightPt, pageWidthPt, width } = params;
  const chokeBleedMm = normalizeSpotChokeBleedMm(params.chokeBleedMm);

  if (chokeBleedMm === 0 || width <= 0 || height <= 0) {
    return mask;
  }

  const widthMm = pointsToMillimeters(pageWidthPt);
  const heightMm = pointsToMillimeters(pageHeightPt);
  const radiusX = millimetersToPixels(Math.abs(chokeBleedMm), width, widthMm);
  const radiusY = millimetersToPixels(Math.abs(chokeBleedMm), height, heightMm);

  if (radiusX === 0 && radiusY === 0) {
    return mask;
  }

  const operation = chokeBleedMm > 0 ? "dilate" : "erode";
  const horizontal =
    radiusX > 0
      ? applyHorizontalMaskWindow({
          height,
          mask,
          operation,
          radius: radiusX,
          width,
        })
      : mask;

  return radiusY > 0
    ? applyVerticalMaskWindow({
        height,
        mask: horizontal,
        operation,
        radius: radiusY,
        width,
      })
    : horizontal;
}

function pointsToMillimeters(points: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0;

  return (points / 72) * 25.4;
}

function millimetersToPixels(
  millimeters: number,
  pixelLength: number,
  millimeterLength: number,
): number {
  if (millimeterLength <= 0 || pixelLength <= 0) return 0;

  return Math.round((millimeters / millimeterLength) * pixelLength);
}

function applyHorizontalMaskWindow(params: {
  height: number;
  mask: Uint8Array;
  operation: "dilate" | "erode";
  radius: number;
  width: number;
}): Uint8Array {
  const { height, mask, operation, radius, width } = params;
  const output = new Uint8Array(mask.length);
  const indexes = new Int32Array(width);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    let head = 0;
    let tail = 0;
    let right = -1;

    for (let x = 0; x < width; x += 1) {
      const windowRight = Math.min(width - 1, x + radius);

      while (right < windowRight) {
        right += 1;
        const value = mask[rowOffset + right];

        while (
          head < tail &&
          shouldReplaceDequeTail({
            candidate: value,
            current: mask[rowOffset + indexes[tail - 1]],
            operation,
          })
        ) {
          tail -= 1;
        }

        indexes[tail] = right;
        tail += 1;
      }

      const windowLeft = x - radius;
      while (head < tail && indexes[head] < windowLeft) {
        head += 1;
      }

      output[rowOffset + x] =
        operation === "erode" && (windowLeft < 0 || x + radius >= width)
          ? 0
          : mask[rowOffset + indexes[head]];
    }
  }

  return output;
}

function applyVerticalMaskWindow(params: {
  height: number;
  mask: Uint8Array;
  operation: "dilate" | "erode";
  radius: number;
  width: number;
}): Uint8Array {
  const { height, mask, operation, radius, width } = params;
  const output = new Uint8Array(mask.length);
  const indexes = new Int32Array(height);

  for (let x = 0; x < width; x += 1) {
    let head = 0;
    let tail = 0;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
      const windowBottom = Math.min(height - 1, y + radius);

      while (bottom < windowBottom) {
        bottom += 1;
        const value = mask[bottom * width + x];

        while (
          head < tail &&
          shouldReplaceDequeTail({
            candidate: value,
            current: mask[indexes[tail - 1] * width + x],
            operation,
          })
        ) {
          tail -= 1;
        }

        indexes[tail] = bottom;
        tail += 1;
      }

      const windowTop = y - radius;
      while (head < tail && indexes[head] < windowTop) {
        head += 1;
      }

      output[y * width + x] =
        operation === "erode" && (windowTop < 0 || y + radius >= height)
          ? 0
          : mask[indexes[head] * width + x];
    }
  }

  return output;
}

function shouldReplaceDequeTail(params: {
  candidate: number;
  current: number;
  operation: "dilate" | "erode";
}): boolean {
  return params.operation === "dilate"
    ? params.candidate >= params.current
    : params.candidate <= params.current;
}
