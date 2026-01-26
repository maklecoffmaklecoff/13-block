// js/services/myEventsIds.js
import { db } from "../firebase.js";
import { doc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function rememberMyEvent(eventId, userId){
  const ref = doc(db, "users", userId);
  await updateDoc(ref, {
    myEventIds: arrayUnion(eventId),
    updatedAt: serverTimestamp()
  });
}

export async function forgetMyEvent(eventId, userId){
  const ref = doc(db, "users", userId);
  await updateDoc(ref, {
    myEventIds: arrayRemove(eventId),
    updatedAt: serverTimestamp()
  });
}
