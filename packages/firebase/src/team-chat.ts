import type {
  Channel,
  NestedMember,
  TeamChatChannel,
  TeamChatChannelCreate,
  TeamChatThread,
  TeamChatThreadCreate,
  TeamMessage,
  TeamMessageCreate,
} from "@konfi/types";
import {
  DocumentReference,
  Firestore,
  QueryConstraint,
  Timestamp,
  collection,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { create, db } from "./firestore";

// Store per-channel chat meta in its own collection
// Collection path: /channelChatMeta (document id = channelId)
interface ChannelChatMetaDoc {
  defaultThreadId?: string;
  // future chat-scoped settings can live here (retentionDays, aiSummaryEnabled, etc.)
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

type AppChannelWithMeta = Channel & {
  teams?: never; // placeholder to prevent excess property errors
  memberIds?: string[];
  description?: string;
  defaultThreadId?: string;
};

type ChatChannelDocument =
  | {
      kind: "custom";
      ref: DocumentReference<TeamChatChannel>;
      data: TeamChatChannel;
    }
  | {
      kind: "app";
      ref: DocumentReference<Channel>;
      data: AppChannelWithMeta;
    };

const omitUndefined = <T>(data: T): T => {
  if (data === null || typeof data !== "object") {
    return data;
  }

  const result: Record<string, unknown> = {};
  Object.entries(data as Record<string, unknown>).forEach(([key, value]) => {
    if (value !== undefined) {
      result[key] = value;
    }
  });

  return result as T;
};

const mapAppChannelToTeamChatChannel = (
  channel: AppChannelWithMeta,
): TeamChatChannel => {
  return {
    id: channel.id,
    name: channel.name,
    kind: "app",
    description: channel.description,
    memberIds: channel.memberIds,
    channelType: "general",
    lastMessage: undefined,
    lastMessageAt: undefined,
    createdBy: channel.createdBy,
    createdAt: channel.createdAt,
  };
};

const normalizeCustomTeamChatChannel = (
  channel: TeamChatChannel,
): TeamChatChannel => ({
  ...channel,
  kind: channel.kind ?? "custom",
});

const filterByMember = (
  channels: TeamChatChannel[],
  memberId?: string,
): TeamChatChannel[] => {
  if (!memberId) {
    return channels;
  }

  return channels.filter((channel) => {
    if (!channel.memberIds || channel.memberIds.length === 0) {
      return true;
    }

    return channel.memberIds.includes(memberId);
  });
};

async function ensureTeamChatChannelForAppChannel(
  firestore: Firestore,
  channelId: string,
  createdBy: NestedMember,
  channelNameHint?: string,
): Promise<TeamChatChannel | undefined> {
  try {
    const chatChannelRef = db.doc<TeamChatChannel>(
      firestore,
      "/teamChatChannels",
      channelId,
    );
    const existing = await getDoc(chatChannelRef);
    if (existing.exists()) {
      const data = existing.data() as TeamChatChannel | undefined;
      return data
        ? { ...data, id: existing.id }
        : { id: existing.id, name: channelNameHint ?? "Channel", kind: "app" };
    }

    const baseChannelRef = db.doc<Channel>(firestore, "/channels", channelId);
    const baseChannelSnap = await getDoc(baseChannelRef);
    if (!baseChannelSnap.exists()) {
      return undefined;
    }

    const baseChannel = baseChannelSnap.data() as AppChannelWithMeta;
    const resolvedName = baseChannel.name ?? channelNameHint ?? "Channel";
    const memberIds = baseChannel.memberIds;
    const description = baseChannel.description;
    const channelType = "general";

    const chatChannel: TeamChatChannel = {
      id: channelId,
      name: resolvedName,
      kind: "app",
      channelType,
      createdBy,
      createdAt: serverTimestamp() as Timestamp,
      ...(description !== undefined ? { description } : {}),
      ...(memberIds && memberIds.length > 0 ? { memberIds } : {}),
    };

    const { id: _ignoredId, ...rawChatChannelData } = chatChannel;
    await setDoc(chatChannelRef, omitUndefined(rawChatChannelData));

    return chatChannel;
  } catch (error) {
    console.error("Error ensuring team chat channel for app channel:", error);
    return undefined;
  }
}

async function getChannelChatMeta(
  firestore: Firestore,
  channelId: string,
): Promise<ChannelChatMetaDoc | undefined> {
  const ref = db.doc<ChannelChatMetaDoc>(
    firestore,
    "/channelChatMeta",
    channelId,
  );
  const snap = await getDoc(ref as any);
  if (!snap.exists()) return undefined;
  return { ...(snap.data() as ChannelChatMetaDoc) };
}

async function upsertChannelChatMetaDefaultThread(
  firestore: Firestore,
  channelId: string,
  threadId: string,
): Promise<void> {
  const ref = db.doc<ChannelChatMetaDoc>(
    firestore,
    "/channelChatMeta",
    channelId,
  );
  const snap = await getDoc(ref as any);
  if (!snap.exists()) {
    await create(
      firestore,
      {
        defaultThreadId: threadId,
        createdAt: serverTimestamp() as Timestamp,
        updatedAt: serverTimestamp() as Timestamp,
      } as ChannelChatMetaDoc,
      undefined,
      {
        collectionRef: collection(firestore, "channelChatMeta"),
        customId: channelId,
      } as any,
      undefined,
    );
    return;
  }

  await updateDoc(
    ref as any,
    { defaultThreadId: threadId, updatedAt: serverTimestamp() } as any,
  );
}

// Team Messages ----------------------------------------------------------------
export async function getTeamMessages(
  firestore: Firestore,
  channelId: string,
  threadId?: string,
  limitCount: number = 50,
): Promise<TeamMessage[]> {
  if (!threadId) {
    return [];
  }

  try {
    const constraints: QueryConstraint[] = [
      where("channelId", "==", channelId),
      where("threadId", "==", threadId),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    ];

    const messagesQuery = db.query<TeamMessage>(
      firestore,
      "/teamMessages",
      limitCount,
      undefined,
      constraints,
    );

    const snapshot = await getDocs(messagesQuery);
    const messages = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));

    return messages;
  } catch (error) {
    console.error("Error fetching team messages:", error);
    return [];
  }
}

export async function createTeamMessage(
  firestore: Firestore,
  message: TeamMessageCreate,
): Promise<string | undefined> {
  try {
    await ensureTeamChatChannelForAppChannel(
      firestore,
      message.channelId,
      message.member,
      message.text,
    );

    let threadId = message.threadId;

    if (!threadId) {
      const defaultThread = await ensureDefaultTeamChatThread(
        firestore,
        message.channelId,
        message.member,
      );
      threadId = defaultThread?.id;
    }

    const messageData = omitUndefined({
      ...message,
      threadId,
      id: "",
      createdAt: serverTimestamp() as Timestamp,
    }) as TeamMessage;

    const messagesRef = db.collection<TeamMessage>(firestore, "/teamMessages");
    const docId = await create(
      firestore,
      messageData,
      undefined,
      messagesRef,
      undefined,
    );
    return docId;
  } catch (error) {
    console.error("Error creating team message:", error);
    throw error;
  }
}

export async function updateTeamMessage(
  firestore: Firestore,
  messageId: string,
  updates: Partial<TeamMessage>,
): Promise<void> {
  try {
    const messageRef = db.doc<TeamMessage>(
      firestore,
      "/teamMessages",
      messageId,
    );
    const sanitizedUpdates = omitUndefined({ ...updates });
    await updateDoc(messageRef, {
      ...sanitizedUpdates,
      editedAt: serverTimestamp() as Timestamp,
    });
  } catch (error) {
    console.error("Error updating team message:", error);
    throw error;
  }
}

export async function deleteTeamMessage(
  firestore: Firestore,
  messageId: string,
): Promise<void> {
  try {
    const messageRef = db.doc<TeamMessage>(
      firestore,
      "/teamMessages",
      messageId,
    );
    await updateDoc(messageRef, { isDeleted: true } as any);
  } catch (error) {
    console.error("Error deleting team message:", error);
    throw error;
  }
}

// Team Chat Channels
export async function getTeamChatChannels(
  firestore: Firestore,
  memberId?: string,
): Promise<TeamChatChannel[]> {
  try {
    const appChannelsRef = db.collection<Channel>(firestore, "/channels");
    const customChannelsRef = memberId
      ? db.query<TeamChatChannel>(
          firestore,
          "/teamChatChannels",
          100,
          undefined,
          [where("memberIds", "array-contains", memberId)],
        )
      : db.collection<TeamChatChannel>(firestore, "/teamChatChannels");

    // load sidecar meta docs (not filtered by membership for now)
    const metaSnapshotPromise = getDocs(
      collection(firestore, "channelChatMeta"),
    );

    const [appSnapshot, customSnapshot, metaSnapshot] = await Promise.all([
      getDocs(appChannelsRef),
      getDocs(customChannelsRef),
      metaSnapshotPromise,
    ]);

    const metaMap = new Map<string, ChannelChatMetaDoc>();
    metaSnapshot.forEach((docSnap: any) => {
      metaMap.set(docSnap.id, docSnap.data() as ChannelChatMetaDoc);
    });

    const appChannelEntries = appSnapshot.docs.map((doc) => {
      const data = doc.data() as AppChannelWithMeta;
      return {
        raw: data,
        mapped: mapAppChannelToTeamChatChannel(data),
      };
    });

    const filteredAppChannels = filterByMember(
      appChannelEntries
        .filter(({ raw }) => raw.active !== false)
        .map(({ mapped, raw }) => ({
          ...mapped,
          id: mapped.id ?? raw.id,
          defaultThreadId: metaMap.get(raw.id)?.defaultThreadId,
        })),
      memberId,
    );

    const customChannels = customSnapshot.docs.map((doc) =>
      normalizeCustomTeamChatChannel({
        ...doc.data(),
        id: doc.id,
      } as TeamChatChannel),
    );

    const channelMap = new Map<string, TeamChatChannel>();

    filteredAppChannels.forEach((channel) => {
      channelMap.set(channel.id, channel);
    });

    customChannels.forEach((channel) => {
      const meta = metaMap.get(channel.id);
      const existing = channelMap.get(channel.id);
      if (existing) {
        const merged = { ...existing, ...channel } as TeamChatChannel;
        channelMap.set(channel.id, {
          ...merged,
          defaultThreadId: meta?.defaultThreadId ?? existing.defaultThreadId,
        });
        return;
      }

      channelMap.set(channel.id, {
        ...channel,
        defaultThreadId: meta?.defaultThreadId,
      });
    });

    // Add Global channel as the first channel (independent from app channels)
    const globalChannel: TeamChatChannel = {
      id: "global",
      name: "Global",
      kind: "global",
      channelType: "general",
      defaultThreadId: metaMap.get("global")?.defaultThreadId,
    };

    const combined = [globalChannel, ...Array.from(channelMap.values())];
    // Sort only the non-global channels
    const sortedNonGlobal = combined
      .slice(1)
      .sort((a, b) => a.name.localeCompare(b.name));

    return [globalChannel, ...sortedNonGlobal];
  } catch (error) {
    console.error("Error fetching team chat channels:", error);
    return [];
  }
}

export async function createTeamChatChannel(
  firestore: Firestore,
  channel: TeamChatChannelCreate,
): Promise<string | undefined> {
  try {
    const channelData = omitUndefined({
      ...channel,
      kind: channel.kind ?? "custom",
      id: "",
      createdAt: serverTimestamp() as Timestamp,
    }) as TeamChatChannel;

    const channelsRef = db.collection<TeamChatChannel>(
      firestore,
      "/teamChatChannels",
    );
    const docId = await create(
      firestore,
      channelData,
      undefined,
      channelsRef,
      undefined,
    );

    return docId;
  } catch (error) {
    console.error("Error creating team chat channel:", error);
    throw error;
  }
}

// Team Chat Threads
export async function getTeamChatThreads(
  firestore: Firestore,
  channelId: string,
): Promise<TeamChatThread[]> {
  try {
    const constraints = [
      where("channelId", "==", channelId),
      orderBy("createdAt", "asc"),
    ];

    const threadsQuery = db.query<TeamChatThread>(
      firestore,
      "/teamChatThreads",
      20,
      undefined,
      constraints,
    );

    const snapshot = await getDocs(threadsQuery);
    return snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));
  } catch (error) {
    console.error("Error fetching team chat threads:", error);
    return [];
  }
}

export async function createTeamChatThread(
  firestore: Firestore,
  thread: TeamChatThreadCreate,
): Promise<string | undefined> {
  try {
    const threadData = omitUndefined({
      ...thread,
      id: "",
      createdAt: serverTimestamp() as Timestamp,
    }) as TeamChatThread;

    const threadsRef = db.collection<TeamChatThread>(
      firestore,
      "/teamChatThreads",
    );
    const docId = await create(
      firestore,
      threadData,
      undefined,
      threadsRef,
      undefined,
    );
    return docId;
  } catch (error) {
    console.error("Error creating team chat thread:", error);
    throw error;
  }
}

async function getChatChannelDocument(
  firestore: Firestore,
  channelId: string,
): Promise<ChatChannelDocument | undefined> {
  const customRef = db.doc<TeamChatChannel>(
    firestore,
    "/teamChatChannels",
    channelId,
  );
  const customSnapshot = await getDoc(customRef);

  if (customSnapshot.exists()) {
    const customData = normalizeCustomTeamChatChannel({
      ...customSnapshot.data(),
      id: customSnapshot.id,
    } as TeamChatChannel);

    return {
      kind: "custom",
      ref: customRef,
      data: customData,
    };
  }

  const appRef = db.doc<Channel>(firestore, "/channels", channelId);
  const appSnapshot = await getDoc(appRef);

  if (appSnapshot.exists()) {
    const appData = appSnapshot.data() as AppChannelWithMeta;
    return {
      kind: "app",
      ref: appRef,
      data: appData,
    };
  }

  return undefined;
}

async function getTeamChatThreadById(
  firestore: Firestore,
  threadId: string,
): Promise<TeamChatThread | undefined> {
  const threadRef = db.doc<TeamChatThread>(
    firestore,
    "/teamChatThreads",
    threadId,
  );
  const snapshot = await getDoc(threadRef);

  if (!snapshot.exists()) {
    return undefined;
  }

  return {
    ...snapshot.data(),
    id: snapshot.id,
  };
}

async function findDefaultThreadForChannel(
  firestore: Firestore,
  channelId: string,
): Promise<TeamChatThread | undefined> {
  const defaultThreadQuery = query(
    collection(firestore, "teamChatThreads"),
    where("channelId", "==", channelId),
    where("isDefault", "==", true),
    limit(1),
  );

  const snapshot = await getDocs(defaultThreadQuery);
  if (!snapshot.empty) {
    const docSnap = snapshot.docs[0];
    const data = docSnap.data() as TeamChatThread;
    return {
      ...data,
      id: docSnap.id,
    };
  }

  return undefined;
}

export async function ensureDefaultTeamChatThread(
  firestore: Firestore,
  channelId: string,
  createdBy: NestedMember,
  channelName?: string,
): Promise<TeamChatThread | undefined> {
  try {
    await ensureTeamChatChannelForAppChannel(
      firestore,
      channelId,
      createdBy,
      channelName,
    );

    // 1. sidecar meta first
    const sidecar = await getChannelChatMeta(firestore, channelId);
    if (sidecar?.defaultThreadId) {
      const existing = await getTeamChatThreadById(
        firestore,
        sidecar.defaultThreadId,
      );
      if (existing) return existing;
    }

    // 2. fallback: find any thread marked default (legacy or concurrent creators)
    const existingDefault = await findDefaultThreadForChannel(
      firestore,
      channelId,
    );
    if (existingDefault) return existingDefault;

    // 3. need channel for name + author info
    const channelDoc = await getChatChannelDocument(firestore, channelId);
    if (!channelDoc) {
      console.warn(`Team chat channel ${channelId} not found.`);
      return undefined;
    }
    const channelData =
      channelDoc.kind === "custom"
        ? channelDoc.data
        : mapAppChannelToTeamChatChannel(channelDoc.data);

    const author = createdBy ?? channelData.createdBy;
    if (!author)
      throw new Error(
        "Cannot create default team chat thread without creator info.",
      );

    const threadTitle = channelName ?? channelData.name ?? "General";
    const threadId = await createTeamChatThread(firestore, {
      title: threadTitle,
      channelId,
      createdBy: author,
      isDefault: true,
    });
    if (!threadId) return undefined;

    await upsertChannelChatMetaDefaultThread(firestore, channelId, threadId);
    return await getTeamChatThreadById(firestore, threadId);
  } catch (error) {
    console.error("Error ensuring default team chat thread:", error);
    throw error;
  }
}

// Subscribe to messages (for real-time updates)
export function subscribeToTeamMessages(
  firestore: Firestore,
  channelId: string,
  threadId: string | undefined,
  callback: (messages: TeamMessage[]) => void,
  limitCount: number = 50,
): () => void {
  if (!threadId) {
    return () => undefined;
  }

  const constraints: QueryConstraint[] = [
    where("channelId", "==", channelId),
    where("threadId", "==", threadId),
    orderBy("createdAt", "desc"),
    limit(limitCount),
  ];

  const messagesQuery = query(
    collection(firestore, "teamMessages"),
    ...constraints,
  );

  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as TeamMessage[];

    callback(messages);
  });
}
