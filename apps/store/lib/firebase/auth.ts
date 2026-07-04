import {
  NextOrObserver,
  onAuthStateChanged as _onAuthStateChanged,
  type Unsubscribe,
  User,
} from "firebase/auth";

import { auth } from "@/lib/firebase/clientApp";

export function onAuthStateChanged(
  cb: NextOrObserver<User>,
): Unsubscribe {
  return _onAuthStateChanged(auth, cb);
}
