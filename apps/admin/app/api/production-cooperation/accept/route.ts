import {
  handleProductionCooperationActionGet,
  handleProductionCooperationActionPost,
} from "@/lib/production-cooperation/route-utils";

export async function GET(request: Request) {
  return handleProductionCooperationActionGet(request, "accept");
}

export async function POST(request: Request) {
  return handleProductionCooperationActionPost(request, "accept");
}
