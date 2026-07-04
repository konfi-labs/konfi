export function getClosestVolume(
  selectedVolume: number,
  volumes: number[],
): number {
  return volumes.reduce((closest, current) => {
    return Math.abs(current - selectedVolume) <
      Math.abs(closest - selectedVolume)
      ? current
      : closest;
  });
}
