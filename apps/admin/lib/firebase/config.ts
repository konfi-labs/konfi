// Default/fallback values for CI builds and local development
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_ADMIN_API_KEY || "demo-api-key",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "demo-project",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "demo-project.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_ADMIN_APP_ID ||
    "1:000000000000:web:0000000000000000000000",
};

// When deployed, there are quotes that need to be stripped
Object.keys(config).forEach((key) => {
  const configValue = config[key as keyof typeof config] + "";
  if (configValue.charAt(0) === '"') {
    config[key as keyof typeof config] = configValue.substring(
      1,
      configValue.length - 1,
    );
  }
});

export const firebaseConfig = config;
