export {};

declare global {
  interface PeriodicSyncEvent extends Event {
    readonly tag: string;
    waitUntil(promise: Promise<unknown>): void;
  }

  interface ServiceWorkerGlobalScopeEventMap {
    periodicsync: PeriodicSyncEvent;
  }

  interface PeriodicSyncManager {
    register(tag: string, options: { minInterval: number }): Promise<void>;
    unregister(tag: string): Promise<void>;
    getTags(): Promise<string[]>;
  }

  interface ServiceWorkerRegistration {
    periodicSync?: PeriodicSyncManager;
  }

  type PeriodicBackgroundSyncPermissionDescriptor = PermissionDescriptor & {
    name: "periodic-background-sync";
  };
}
