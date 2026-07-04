import { getApps, initializeApp } from "firebase/app";
import { firebaseConfig } from "./config";

if (!getApps().length) {
  initializeApp(firebaseConfig, "store");
}
