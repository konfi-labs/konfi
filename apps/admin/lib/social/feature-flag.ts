export function isSocialFeatureEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_SOCIAL_SCHEDULER_ENABLED === "true" ||
    // oxlint-disable-next-line turbo/no-undeclared-env-vars -- NODE_ENV is provided by Next.js.
    process.env.NODE_ENV === "development"
  );
}
