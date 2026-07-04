import "server-only";

export interface VertexConfig {
  project: string;
  location: string;
  clientEmail: string;
  privateKey: string;
}

export function getVertexConfig(): VertexConfig {
  const project = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const location = "global";
  const clientEmail = process.env.ADMIN_FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.ADMIN_FIREBASE_SERVICE_ACCOUNT;

  if (!project) {
    throw new Error(
      "Missing ADMIN_FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID for Vertex AI.",
    );
  }

  if (!clientEmail) {
    throw new Error("Missing ADMIN_FIREBASE_CLIENT_EMAIL for Vertex AI.");
  }

  if (!privateKeyRaw) {
    throw new Error("Missing ADMIN_FIREBASE_SERVICE_ACCOUNT for Vertex AI.");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  return { project, location, clientEmail, privateKey };
}
