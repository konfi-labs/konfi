import type {
  getGooglePlaceAddressDetails,
  getGooglePlaceAddressPredictions,
  resolveGooglePlaceRegionCode,
} from "./places";

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,36}$/;

interface AutocompleteRequestBody {
  input?: string;
  country?: string;
  languageCode?: string;
  sessionToken?: string;
}

interface DetailsRequestBody {
  placeId?: string;
  languageCode?: string;
  sessionToken?: string;
}

/**
 * App-specific access checks (security validation, tenant/runtime context).
 * Return a Response to short-circuit the request, or null/undefined to proceed.
 */
export type GooglePlacesRouteGuard<R extends Request = Request> = (
  request: R,
) => Promise<Response | null | undefined> | Response | null | undefined;

export interface GooglePlacesAutocompleteRouteOptions<
  R extends Request = Request,
> {
  guard: GooglePlacesRouteGuard<R>;
  getPredictions: typeof getGooglePlaceAddressPredictions;
  resolveRegionCode: typeof resolveGooglePlaceRegionCode;
}

export interface GooglePlacesDetailsRouteOptions<R extends Request = Request> {
  guard: GooglePlacesRouteGuard<R>;
  getDetails: typeof getGooglePlaceAddressDetails;
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status });
}

function getGooglePlacesApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}

export async function handleGooglePlacesAutocompleteRequest<R extends Request>(
  request: R,
  {
    guard,
    getPredictions,
    resolveRegionCode,
  }: GooglePlacesAutocompleteRouteOptions<R>,
): Promise<Response> {
  const guardResponse = await guard(request);

  if (guardResponse) {
    return guardResponse;
  }

  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return jsonError("GOOGLE_PLACES_API_KEY is not configured.", 500);
  }

  let body: AutocompleteRequestBody;

  try {
    body = (await request.json()) as AutocompleteRequestBody;
  } catch (error) {
    console.error("Error parsing Google Places autocomplete request:", error);
    return jsonError("Invalid request body.", 400);
  }

  const input = body.input?.trim();
  const sessionToken = body.sessionToken?.trim();

  if (!input || input.length < 3) {
    return jsonError("Input must contain at least 3 characters.", 400);
  }

  if (!sessionToken || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
    return jsonError("Invalid session token.", 400);
  }

  try {
    const suggestions = await getPredictions({
      apiKey,
      input,
      countryCode: resolveRegionCode(body.country),
      languageCode: body.languageCode,
      sessionToken,
    });

    return Response.json({ suggestions });
  } catch (error) {
    console.error("Error fetching Google Places autocomplete:", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unknown Google Places autocomplete error.",
      500,
    );
  }
}

export async function handleGooglePlacesDetailsRequest<R extends Request>(
  request: R,
  { guard, getDetails }: GooglePlacesDetailsRouteOptions<R>,
): Promise<Response> {
  const guardResponse = await guard(request);

  if (guardResponse) {
    return guardResponse;
  }

  const apiKey = getGooglePlacesApiKey();

  if (!apiKey) {
    return jsonError("GOOGLE_PLACES_API_KEY is not configured.", 500);
  }

  let body: DetailsRequestBody;

  try {
    body = (await request.json()) as DetailsRequestBody;
  } catch (error) {
    console.error("Error parsing Google Places details request:", error);
    return jsonError("Invalid request body.", 400);
  }

  const placeId = body.placeId?.trim();
  const sessionToken = body.sessionToken?.trim();

  if (!placeId) {
    return jsonError("Place ID is required.", 400);
  }

  if (!sessionToken || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
    return jsonError("Invalid session token.", 400);
  }

  try {
    const address = await getDetails({
      apiKey,
      placeId,
      languageCode: body.languageCode,
      sessionToken,
    });

    return Response.json({ address });
  } catch (error) {
    console.error("Error fetching Google Places details:", error);
    return jsonError(
      error instanceof Error
        ? error.message
        : "Unknown Google Places details error.",
      500,
    );
  }
}
