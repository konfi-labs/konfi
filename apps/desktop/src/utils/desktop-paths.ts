import * as path from "node:path";

export const isPathInside = (parentPath: string, childPath: string) => {
  const relative = path.relative(parentPath, childPath);
  return (
    relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

export const normalizeRelativePath = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) {
    return null;
  }
  const resolved = path.normalize(normalized);
  if (resolved === "." || resolved.startsWith("..") || path.isAbsolute(resolved)) {
    return null;
  }
  return normalized;
};

export const resolveOrderFolderPath = (
  baseFolderPath: string,
  orderNumber: number,
) => path.resolve(path.join(path.resolve(baseFolderPath), String(orderNumber)));

export const resolveOrderRelativePath = (
  baseFolderPath: string,
  orderNumber: number,
  relativePath: string,
): string | null => {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  if (!normalizedRelativePath) return null;

  const orderFolderPath = resolveOrderFolderPath(baseFolderPath, orderNumber);
  const resolvedPath = path.resolve(path.join(orderFolderPath, normalizedRelativePath));
  return isPathInside(orderFolderPath, resolvedPath) ? resolvedPath : null;
};

export const getOrderRelativePath = (
  baseFolderPath: string,
  orderNumber: number,
  filePath: string,
): string | null => {
  const orderFolderPath = resolveOrderFolderPath(baseFolderPath, orderNumber);
  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(orderFolderPath, resolvedPath)) return null;
  const relativePath = path.relative(orderFolderPath, resolvedPath);
  return relativePath.split(path.sep).join("/");
};
