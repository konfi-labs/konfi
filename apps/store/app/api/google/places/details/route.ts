import { guardStorePlacesRequest } from "@/lib/google/places-route-guard";
import {
  getGooglePlaceAddressDetails,
  handleGooglePlacesDetailsRequest,
} from "@konfi/google";
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  return handleGooglePlacesDetailsRequest(request, {
    guard: guardStorePlacesRequest,
    getDetails: getGooglePlaceAddressDetails,
  });
}
