function formatUuid(bytes: Uint8Array): string {
  const normalizedBytes = [...bytes];

  normalizedBytes[6] = (normalizedBytes[6] & 0x0f) | 0x40;
  normalizedBytes[8] = (normalizedBytes[8] & 0x3f) | 0x80;

  const hex = normalizedBytes
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function createMathRandomUuid(): string {
  const bytes = new Uint8Array(16);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return formatUuid(bytes);
}

export function getRandomId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    return formatUuid(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  }

  return createMathRandomUuid();
}
