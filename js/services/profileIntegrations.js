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
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

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
  const ref = doc(db, CFG.clanApplications.collection, uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data();
  return {
    id: snap.id,
    status: data[CFG.clanApplications.statusField] || "unknown",
    createdAt: data[CFG.clanApplications.createdAtField] || null,
  };
}


/* ---------------- Event applications (subcollection) ---------------- */

export async function getMyEventApplications(uid) {
  // Без collectionGroup, чтобы не ловить permission-denied на rules.
  // Берём последние события и проверяем наличие заявки в каждом.
  const evQ = query(
    collection(db, CFG.events.collection),
    orderBy("createdAt", "desc"),
    limit(100)
  );
  const evSnap = await getDocs(evQ);

  const out = [];

  for (const evDoc of evSnap.docs) {
    const eventId = evDoc.id;

    // пробуем получить МОЮ заявку как документ events/{eventId}/applications/{uid}
    const appRef = doc(db, CFG.events.collection, eventId, CFG.events.applicationsSubcol, uid);
    const appSnap = await getDoc(appRef);
    if (!appSnap.exists()) continue;

    const app = appSnap.data();
    const ev = evDoc.data();

    out.push({
      eventId,
      status: app.status || "pending",
      createdAt: app.createdAt || null,
      title: pickFirst(ev, CFG.events.titleFieldCandidates) || "Событие",
      date: pickFirst(ev, CFG.events.dateFieldCandidates) || null,
    });
  }

  // сортируем по createdAt заявки
  out.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return out.slice(0, 30);
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
