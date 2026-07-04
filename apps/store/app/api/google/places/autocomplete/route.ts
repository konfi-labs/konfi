import { guardStorePlacesRequest } from "@/lib/google/places-route-guard";
import {
  getGooglePlaceAddressPredictions,
  handleGooglePlacesAutocompleteRequest,
  resolveGooglePlaceRegionCode,
} from "@konfi/google";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return handleGooglePlacesAutocompleteRequest(request, {
    guard: guardStorePlacesRequest,
    getPredictions: getGooglePlaceAddressPredictions,
    resolveRegionCode: resolveGooglePlaceRegionCode,
  });
}
