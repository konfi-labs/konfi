export const getCombinations = (arr: string[][], pre: string = ""): string[] => {
  if (!arr.length) {
    return [pre];
  }

  const ans = arr[0].reduce((acc, value) => {
    return acc.concat(
      getCombinations(arr.slice(1), pre + (pre === "" ? "" : "-") + value),
    );
  }, [] as string[]);

  return ans;
};