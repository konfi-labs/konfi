import { getStoreRuntimeConfigForRequest } from "@/lib/firebase/serverApp";
import {
  getStorefrontEditorDraftContent,
  listStorefrontEditorRevisions,
  publishStorefrontEditorDraft,
  rollbackStorefrontEditorRevision,
  saveStorefrontHomePageDraft,
  saveStorefrontSharingDraft,
  saveStorefrontThemeDraft,
} from "@/lib/storefront-editor/content";
import {
  autoTranslateStorefrontHomePage,
  normalizeStorefrontContentLocale,
} from "@/lib/storefront-editor/translate";
import {
  STOREFRONT_EDITOR_COOKIE,
  verifyStorefrontEditorToken,
} from "@/lib/storefront-editor/session";
import { readRuntimeString } from "@/lib/runtime-config";
import type {
  StorefrontHomePage,
  StorefrontSharingSettings,
  StorefrontThemeSettings,
} from "@konfi/types";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

interface StorefrontEditorSaveBody {
  /**
   * Set to false for autosaves: machine translations are deferred to the next
   * explicit save or publish so drafts don't trigger an LLM call per edit.
   */
  autoTranslate?: boolean;
  homePage?: StorefrontHomePage;
  sharing?: StorefrontSharingSettings;
  sourceLocale?: string;
  theme?: StorefrontThemeSettings;
}

interface StorefrontEditorPublishBody {
  action?: "publish" | "rollback";
  revisionId?: string;
}

const parseBody = async (request: Request) => {
  try {
    const body = (await request.json()) as unknown;

    if (!body || typeof body !== "object") {
      return null;
    }

    return body as StorefrontEditorSaveBody;
  } catch {
    return null;
  }
};

async function getStorefrontEditorRequestContext() {
  const token = (await cookies()).get(STOREFRONT_EDITOR_COOKIE)?.value;
  const session = verifyStorefrontEditorToken(token);

  if (!session) {
    return {
      response: NextResponse.json(
        { error: "Preview session expired." },
        {
          status: 401,
        },
      ),
    };
  }

  const runtimeConfig = await getStoreRuntimeConfigForRequest();

  if (
    !runtimeConfig ||
    runtimeConfig.channelId !== session.channelId ||
    runtimeConfig.tenantContext.tenantId !== session.tenantId
  ) {
    return {
      response: NextResponse.json(
        { error: "Preview tenant mismatch." },
        {
          status: 403,
        },
      ),
    };
  }

  return { runtimeConfig, session };
}

export async function GET() {
  const context = await getStorefrontEditorRequestContext();

  if (context.response) {
    return context.response;
  }

  const [draft, revisions] = await Promise.all([
    getStorefrontEditorDraftContent(context.runtimeConfig.channelId),
    listStorefrontEditorRevisions({
      channelId: context.runtimeConfig.channelId,
      limit: 8,
    }),
  ]);

  return NextResponse.json({ draft, ok: true, revisions });
}

export async function POST(request: Request) {
  const context = await getStorefrontEditorRequestContext();

  if (context.response) {
    return context.response;
  }

  const body = (await parseBody(request)) as StorefrontEditorPublishBody | null;

  if (body?.action === "publish") {
    const revision = await publishStorefrontEditorDraft({
      channelId: context.runtimeConfig.channelId,
      uid: context.session.uid,
    });
    const revisions = await listStorefrontEditorRevisions({
      channelId: context.runtimeConfig.channelId,
      limit: 8,
    });

    return NextResponse.json({ ok: true, revision, revisions });
  }

  if (body?.action === "rollback" && body.revisionId) {
    const revision = await rollbackStorefrontEditorRevision({
      channelId: context.runtimeConfig.channelId,
      revisionId: body.revisionId,
      uid: context.session.uid,
    });
    const revisions = await listStorefrontEditorRevisions({
      channelId: context.runtimeConfig.channelId,
      limit: 8,
    });

    return NextResponse.json({
      draft: {
        homePage: revision.homePage,
        sharing: revision.sharing,
        theme: revision.theme,
      },
      ok: true,
      revision,
      revisions,
    });
  }

  return NextResponse.json(
    { error: "Unsupported storefront editor action." },
    {
      status: 400,
    },
  );
}

export async function PATCH(request: Request) {
  const context = await getStorefrontEditorRequestContext();

  if (context.response) {
    return context.response;
  }

  const body = await parseBody(request);

  if (!body || !(body.homePage || body.sharing || body.theme)) {
    return NextResponse.json(
      { error: "No storefront changes provided." },
      {
        status: 400,
      },
    );
  }

  const sourceLocale = normalizeStorefrontContentLocale(
    body.sourceLocale ??
      body.homePage?.sourceLocale ??
      readRuntimeString(
        context.runtimeConfig.metadata,
        "defaultLocale",
        "locale",
        "language",
      ),
  );
  const homePagePromise = body.homePage
    ? (body.autoTranslate === false
        ? Promise.resolve(body.homePage)
        : autoTranslateStorefrontHomePage({
            homePage: body.homePage,
            sourceLocale,
          })
      ).then((homePageToSave) =>
        saveStorefrontHomePageDraft({
          channelId: context.runtimeConfig.channelId,
          homePage: homePageToSave,
          uid: context.session.uid,
        }),
      )
    : Promise.resolve(undefined);
  const themePromise = body.theme
    ? saveStorefrontThemeDraft({
        channelId: context.runtimeConfig.channelId,
        theme: body.theme,
        uid: context.session.uid,
      })
    : Promise.resolve(undefined);
  const sharingPromise = body.sharing
    ? saveStorefrontSharingDraft({
        channelId: context.runtimeConfig.channelId,
        sharing: body.sharing,
        uid: context.session.uid,
      })
    : Promise.resolve(undefined);

  const [homePage, theme, sharing] = await Promise.all([
    homePagePromise,
    themePromise,
    sharingPromise,
  ]);

  return NextResponse.json({ homePage, ok: true, sharing, theme });
}
