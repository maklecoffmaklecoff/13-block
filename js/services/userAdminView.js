// js/services/userAdminView.js
import { db } from "../firebase.js";
import {
  doc,
  getDoc,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function getClanApplicationForUser(uid){
  const snap = await getDoc(doc(db, "clanApplications", uid));
  return snap.exists() ? snap.data() : null;
}

export async function getEventApplicationsForUserAsAdmin(uid){
  const q = query(
    collectionGroup(db, "applications"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const snap = await getDocs(q);
  const out = [];

  for (const d of snap.docs){
    const data = d.data();
    const eventId = d.ref.parent?.parent?.id;
    const ev = await getEventMeta(eventId);

    out.push({
      eventId,
      status: data.status || "pending",
      createdAt: data.createdAt || null,
      title: ev?.title || "Событие",
      date: ev?.date || null,
    });
  }

  return out;
}

export async function getEventsByIds(ids){
  const out = [];
  for (const id of (ids || [])){
    const snap = await getDoc(doc(db, "events", id));
    if (!snap.exists()) continue;
    const d = snap.data();
    out.push({
      id,
      title: d.title || "Событие",
      date: d.date || d.startAt || d.createdAt || null,
    });
  }
  return out;
}

async function getEventMeta(eventId){
  if (!eventId) return null;
  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { title: d.title || "Событие", date: d.date || d.startAt || d.createdAt || null };
}
