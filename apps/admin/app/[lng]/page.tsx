import { verifySessionCookie } from "@/lib/firebase/serverApp";
import { cookies } from "next/headers";
import HomePage from "./home-page";

export default async function Page() {
  const cookieStore = await cookies();

  const sessionCookie = cookieStore.get("__session")?.value;
  const decodedClaims = sessionCookie
    ? await verifySessionCookie(sessionCookie)
    : null;
  const isAdmin = decodedClaims?.admin === true;

  if (!isAdmin) {
    return null;
  }

  return <HomePage />;
}
