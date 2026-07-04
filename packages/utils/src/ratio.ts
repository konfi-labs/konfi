export function getRatio(width: number, height: number) {
  if (width === 0 || height === 0) return 0;
  return (width / height).toFixed(2);
}

export function isValidRatio(
  width: number,
  height: number,
  minRatio: number,
  maxRatio: number,
  ratio: number | string,
) {
  const currentRatio = Number(getRatio(width, height));
  if (currentRatio === 0) return false;
  if (!isFinite(Number(currentRatio))) return false;
  if (currentRatio < minRatio || currentRatio > maxRatio) return false;
  if (Number(ratio) !== 0 && currentRatio !== Number(ratio)) return false;
  return true;
}
