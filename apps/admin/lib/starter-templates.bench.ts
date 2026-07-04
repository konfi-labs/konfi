import { setTimeout as delay } from "node:timers/promises";
import { bench, describe } from "vitest";
import {
  STARTER_TEMPLATE_FORMAT,
  STARTER_TEMPLATE_VERSION,
  importStarterTemplate,
  type CollectionReferenceLike,
  type DocumentReferenceLike,
  type DocumentSnapshotLike,
  type FirestoreLike,
  type QueryLike,
  type QuerySnapshotLike,
  type StarterTemplateManifest,
  type WriteBatchLike,
} from "./starter-templates";

class BenchmarkDocumentSnapshot implements DocumentSnapshotLike {
  id: string;
  ref: DocumentReferenceLike;

  constructor(path: string) {
    this.id = path.split("/").at(-1) ?? path;
    this.ref = { id: this.id, path };
  }

  get exists() {
    return false;
  }

  data(): Record<string, unknown> | undefined {
    return undefined;
  }
}

class BenchmarkDocumentReference implements DocumentReferenceLike {
  id: string;

  constructor(
    readonly path: string,
    private readonly readDelayMs: number,
  ) {
    this.id = path.split("/").at(-1) ?? path;
  }

  async get(): Promise<DocumentSnapshotLike> {
    await delay(this.readDelayMs);
    return new BenchmarkDocumentSnapshot(this.path);
  }
}

class BenchmarkCollectionReference
  implements CollectionReferenceLike, QueryLike
{
  constructor(readonly path: string) {}

  doc(id = "doc"): DocumentReferenceLike {
    return { id, path: `${this.path}/${id}` };
  }

  async get(): Promise<QuerySnapshotLike> {
    return { docs: [] };
  }

  where(): QueryLike {
    return this;
  }
}

class BenchmarkWriteBatch implements WriteBatchLike {
  set(): WriteBatchLike {
    return this;
  }

  async commit(): Promise<void> {}
}

class BenchmarkFirestore implements FirestoreLike {
  constructor(private readonly readDelayMs: number) {}

  batch(): WriteBatchLike {
    return new BenchmarkWriteBatch();
  }

  collection(path: string): CollectionReferenceLike {
    return new BenchmarkCollectionReference(path);
  }

  doc(path: string): DocumentReferenceLike & {
    get(): Promise<DocumentSnapshotLike>;
  } {
    return new BenchmarkDocumentReference(path, this.readDelayMs);
  }
}

function createManifest(documentCount: number): StarterTemplateManifest {
  const sourceChannelId = "source-channel";

  return {
    counts: {} as StarterTemplateManifest["counts"],
    exportedAt: "2026-07-03T00:00:00.000Z",
    format: STARTER_TEMPLATE_FORMAT,
    name: "Benchmark starter",
    resources: [
      {
        data: {
          active: true,
          currency: "PLN",
          id: sourceChannelId,
          name: "Source",
        },
        id: sourceChannelId,
        resource: "channel",
        sourcePath: `channels/${sourceChannelId}`,
      },
      ...Array.from({ length: documentCount - 1 }, (_, index) => ({
        data: {
          enabled: true,
          id: `setting-${index}`,
        },
        id: `setting-${index}`,
        resource: "channelSetting" as const,
        sourcePath: `channels/${sourceChannelId}/settings/setting-${index}`,
      })),
    ],
    source: {
      channelId: sourceChannelId,
      deploymentMode: "saas",
      tenantId: "tenant-a",
    },
    storagePolicy: {
      includeObjects: false,
      productMedia: "filename-only",
    },
    version: STARTER_TEMPLATE_VERSION,
  };
}

describe("starter template target assertions", () => {
  bench(
    "imports 40 new documents with delayed target reads",
    async () => {
      await importStarterTemplate({
        actor: {
          id: "admin-1",
          name: "Admin",
        },
        db: new BenchmarkFirestore(5),
        manifest: createManifest(40),
        targetChannelId: "target-channel",
        targetTenantContext: {
          deploymentMode: "saas",
          requireTenantId: true,
          tenantId: "tenant-b",
        },
      });
    },
    {
      iterations: 10,
      time: 1_000,
      warmupIterations: 1,
      warmupTime: 250,
    },
  );
});
