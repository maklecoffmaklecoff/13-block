// js/services/profileIntegrations.js
import { db } from "../firebase.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  getDoc,
  deleteDoc,
  updateDoc,
  arrayRemove,
  arrayUnion,
  collectionGroup,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CFG = {
  users: { collection: "users", myEventIdsField: "myEventIds" },

  clanApplications: {
    collection: "clanApplications",
    uidField: "uid",
    createdAtField: "createdAt",
    statusField: "status",
  },

  events: {
    collection: "events",
    applicationsSubcol: "applications",
    participantsSubcol: "participants",
    titleFieldCandidates: ["title", "name"],
    dateFieldCandidates: ["date", "startAt", "createdAt"],
  },

  chat: {
    messages: "chatMessages",
    createdAtField: "createdAt",
    uidField: "uid",
    reactionsSubcol: "reactions",
    scanLastMessages: 400, // сколько последних сообщений анализировать
    scanReactionsPerMessage: 50, // ограничение на реакции в 1 сообщении
  },
};

/* ---------------- Clan application ---------------- */

export async function getClanApplication(uid) {
  const q = query(
    collection(db, CFG.clanApplications.collection),
    where(CFG.clanApplications.uidField, "==", uid),
    orderBy(CFG.clanApplications.createdAtField, "desc"),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  const data = d.data();
  return {
    id: d.id,
    status: data[CFG.clanApplications.statusField] || "unknown",
    createdAt: data[CFG.clanApplications.createdAtField] || null,
  };
}

/* ---------------- Event applications (subcollection) ---------------- */

export async function getMyEventApplications(uid) {
  const q = query(
    collectionGroup(db, CFG.events.applicationsSubcol),
    where("uid", "==", uid),
    orderBy("createdAt", "desc"),
    limit(30)
  );

  const snap = await getDocs(q);
  const out = [];

  for (const d of snap.docs) {
    const data = d.data();
    const eventId = parentEventIdFromDocRef(d.ref);
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

/* ---------------- My events (fast: users.myEventIds) ---------------- */

export async function getMyEvents(uid) {
  const uref = doc(db, CFG.users.collection, uid);
  const usnap = await getDoc(uref);
  if (!usnap.exists()) return [];

  const udata = usnap.data();
  const ids = Array.isArray(udata[CFG.users.myEventIdsField]) ? udata[CFG.users.myEventIdsField] : [];
  if (!ids.length) return [];

  const out = [];
  for (const eventId of ids.slice(0, 40)) {
    const ev = await getEventMeta(eventId);
    if (!ev) continue;
    out.push({ id: eventId, title: ev.title, date: ev.date });
  }

  out.sort((a, b) => toMillis(b.date) - toMillis(a.date));
  return out.slice(0, 30);
}

/**
 * Выйти из события:
 * - удалить events/{eventId}/participants/{uid} (разрешено rules)
 * - удалить eventId из users/{uid}.myEventIds (разрешено rules)
 */
export async function leaveEvent(eventId, uid) {
  const pref = doc(db, CFG.events.collection, eventId, CFG.events.participantsSubcol, uid);
  await deleteDoc(pref);

  const uref = doc(db, CFG.users.collection, uid);
  await updateDoc(uref, {
    [CFG.users.myEventIdsField]: arrayRemove(eventId),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Добавить eventId в users/{uid}.myEventIds
 * Использовать в админке/странице событий при добавлении участника.
 */
export async function rememberMyEvent(eventId, uid) {
  const uref = doc(db, CFG.users.collection, uid);
  await updateDoc(uref, {
    [CFG.users.myEventIdsField]: arrayUnion(eventId),
    updatedAt: serverTimestamp(),
  });
}

/* ---------------- Chat stats (messages + reactions subcollection) ---------------- */

export async function getChatStats(uid) {
  const q = query(
    collection(db, CFG.chat.messages),
    orderBy(CFG.chat.createdAtField, "desc"),
    limit(CFG.chat.scanLastMessages)
  );

  const snap = await getDocs(q);

  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  let total = 0;
  let week = 0;

  const reactCount = Object.create(null);

  for (const d of snap.docs) {
    const m = d.data();
    if (m[CFG.chat.uidField] !== uid) continue;

    total++;

    const t = toMillis(m[CFG.chat.createdAtField]);
    if (t && now - t <= weekMs) week++;

    // реакции: chatMessages/{msgId}/reactions/{userId}
    const rq = query(
      collection(db, CFG.chat.messages, d.id, CFG.chat.reactionsSubcol),
      limit(CFG.chat.scanReactionsPerMessage)
    );
    const rs = await getDocs(rq);

    rs.forEach((rd) => {
      const r = rd.data();
      if (!r?.emoji) return;
      reactCount[r.emoji] = (reactCount[r.emoji] || 0) + 1;
    });
  }

  const top = Object.entries(reactCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([emoji, count]) => ({ emoji, count }));

  return { total, week, top };
}


/* ---------------- helpers ---------------- */

async function getEventMeta(eventId) {
  if (!eventId) return null;
  const ref = doc(db, CFG.events.collection, eventId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  const title = pickFirst(data, CFG.events.titleFieldCandidates) || "Событие";
  const date = pickFirst(data, CFG.events.dateFieldCandidates) || null;
  return { title, date };
}

function pickFirst(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function parentEventIdFromDocRef(ref) {
  // .../events/{eventId}/applications/{docId}
  return ref.parent?.parent?.id || null;
}
