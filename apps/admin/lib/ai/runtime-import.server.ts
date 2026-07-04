import "server-only";

type RuntimeImport = <T>(specifier: string) => Promise<T>;

const runtimeImport = new Function(
  "specifier",
  "return import(specifier)",
) as RuntimeImport;

export function importServerModule<T>(specifier: string): Promise<T> {
  return runtimeImport<T>(specifier);
}
