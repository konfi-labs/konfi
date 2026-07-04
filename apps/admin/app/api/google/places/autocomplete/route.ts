import { guardAdminPlacesRequest } from "@/lib/google/places-route-guard";
import {
  getGooglePlaceAddressPredictions,
  handleGooglePlacesAutocompleteRequest,
  resolveGooglePlaceRegionCode,
} from "@konfi/google";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return handleGooglePlacesAutocompleteRequest(request, {
    guard: guardAdminPlacesRequest,
    getPredictions: getGooglePlaceAddressPredictions,
    resolveRegionCode: resolveGooglePlaceRegionCode,
  });
}
