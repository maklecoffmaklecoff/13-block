// js/db.js
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, addDoc, getDocs, query, orderBy, limit, where,
  onSnapshot, deleteDoc, runTransaction,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { db } from "./firebase.js";

/* Users */
export async function ensureUserDoc(user){
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const baseStats = { hp:0, energy:0, respect:0, evasion:0, armor:0, resistance:0, bloodRes:0, poisonRes:0 };
  const baseChat = { mutedUntil: null, banned: false };

  if (!snap.exists()){
    await setDoc(ref, {
      uid: user.uid,
      displayName: user.displayName || "Игрок",
      displayNameLower: String(user.displayName || "Игрок").toLowerCase(),
      photoURL: user.photoURL || "https://img.freepik.com/premium-vector/male-criminal-bars-man-jail-flat-illustration_124715-253.jpg",
      role: "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      stats: baseStats,
      chat: baseChat
    });
  } else {
    const d = snap.data();
    const patch = {};
    if (!d.stats) patch.stats = baseStats;
    if (!d.chat) patch.chat = baseChat;
    if (!d.displayNameLower) patch.displayNameLower = String(d.displayName || "Игрок").toLowerCase();
    if (Object.keys(patch).length) await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
  }
  return ref;
}

export async function getUser(uid){
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

export async function getMyProfile(uid){
  const u = await getUser(uid);
  if (!u) throw new Error("Профиль не найден. Перезайдите.");
  return u;
}

export async function updateUserProfile(uid, patch){
  const p = { ...patch, updatedAt: serverTimestamp() };
  if (typeof p.displayName === "string"){
    p.displayNameLower = p.displayName.toLowerCase();
  }
  await updateDoc(doc(db, "users", uid), p);
}

export async function searchUsersByNamePrefix(prefix, lim = 20){
  const p = String(prefix || "").toLowerCase().trim();
  if (!p) return [];
  const qy = query(
    collection(db, "users"),
    where("displayNameLower", ">=", p),
    where("displayNameLower", "<=", p + "\uf8ff"),
    orderBy("displayNameLower"),
    limit(lim)
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data());
}

export async function setUserRole(uid, role){
  await updateDoc(doc(db, "users", uid), { role, updatedAt: serverTimestamp() });
}

/* Clan info */
export async function getClanInfo(){
  const ref = doc(db, "clan", "info");
  const snap = await getDoc(ref);
  if (!snap.exists()){
    await setDoc(ref, {
      title: "13 Блок",
      about: "Описание клана. Админ может изменить этот текст.",
      rules: "Правила клана. Админ может изменить.",
      updatedAt: serverTimestamp()
    });
    return (await getDoc(ref)).data();
  }
  return snap.data();
}

export async function updateClanInfo(patch){
  await updateDoc(doc(db, "clan", "info"), { ...patch, updatedAt: serverTimestamp() });
}

/* News */
export async function listNews(){
  const qy = query(collection(db, "news"), orderBy("createdAt", "desc"), limit(30));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function createNews(payload){
  await addDoc(collection(db, "news"), {
    title: payload.title,
    text: payload.text || "",
    createdAt: serverTimestamp(),
    createdByUid: payload.createdByUid || "",
    createdByName: payload.createdByName || ""
  });
}
export async function deleteNews(id){
  await deleteDoc(doc(db, "news", id));
}

/* Clan applications */
export async function getMyClanApplication(uid){
  const ref = doc(db, "clanApplications", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
export async function submitClanApplication(uid, payload){
  const ref = doc(db, "clanApplications", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) throw new Error("Заявка уже существует. Можно удалить и подать заново.");
  await setDoc(ref, {
    uid,
    status: "pending",
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}
export async function deleteClanApplication(uid){
  await deleteDoc(doc(db, "clanApplications", uid));
}
export async function listClanApplications(){
  const qy = query(collection(db, "clanApplications"), orderBy("createdAt", "desc"), limit(200));
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data());
}
export async function setClanApplicationStatus(uid, status){
  await updateDoc(doc(db, "clanApplications", uid), { status, updatedAt: serverTimestamp() });
}

/* Members */
export async function listMembers(){
  const qy = query(collection(db, "members"), orderBy("joinedAt", "desc"), limit(500));
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data());
}
export async function isMember(uid){
  const snap = await getDoc(doc(db, "members", uid));
  return snap.exists();
}
export async function addMemberFromApplication(appData){
  await setDoc(doc(db, "members", appData.uid), {
    uid: appData.uid,
    displayName: appData.displayName || "Игрок",
    photoURL: appData.photoURL || "",
    stats: appData.stats || {},
    joinedAt: serverTimestamp()
  }, { merge: true });
}
export async function removeMember(uid){
  await deleteDoc(doc(db, "members", uid));
}

/* Events */
export async function createEvent(payload){
  const ref = await addDoc(collection(db, "events"), {
    title: payload.title,
    desc: payload.desc || "",
    requirements: payload.requirements || { hp:0, energy:0, respect:0, evasion:0, armor:0, resistance:0, bloodRes:0, poisonRes:0 },
    capacity: Number(payload.capacity ?? 10),
    autoApprove: !!payload.autoApprove,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}
export async function listEvents(){
  const qy = query(collection(db, "events"), orderBy("createdAt", "desc"), limit(100));
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
export async function getEvent(eventId){
  const snap = await getDoc(doc(db, "events", eventId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() }) : null;
}
export async function updateEvent(eventId, patch){
  await updateDoc(doc(db, "events", eventId), { ...patch, updatedAt: serverTimestamp() });
}
export async function deleteEvent(eventId){
  await deleteDoc(doc(db, "events", eventId));
}

/* Event applications */
export async function getMyEventApplication(eventId, uid){
  const ref = doc(db, "events", eventId, "applications", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}
export function listenEventApplications(eventId, cb){
  const qy = query(collection(db, "events", eventId, "applications"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export function listenEventParticipants(eventId, cb){
  const qy = query(collection(db, "events", eventId, "participants"), orderBy("joinedAt", "asc"), limit(500));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>({ id:d.id, ...d.data() }))));
}
export async function submitEventApplication(eventId, uid, payload){
  const ref = doc(db, "events", eventId, "applications", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) throw new Error("Вы уже подали заявку. Можно удалить и подать заново.");

  await setDoc(ref, {
    uid,
    status: "pending",
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  // auto-approve if enabled and capacity allows
  const evRef = doc(db, "events", eventId);
  await runTransaction(db, async (tx)=>{
    const evSnap = await tx.get(evRef);
    if (!evSnap.exists()) return;
    const ev = evSnap.data();
    if (!ev.autoApprove) return;

    // count participants (simple, may be limited but ok for small scale)
    const partCol = collection(db, "events", eventId, "participants");
    const partSnap = await getDocs(query(partCol, limit(1000)));
    const current = partSnap.size;
    if (current >= Number(ev.capacity ?? 0)) return;

    const appSnap = await tx.get(ref);
    if (!appSnap.exists()) return;
    if (appSnap.data().status !== "pending") return;

    tx.update(ref, { status: "approved", updatedAt: serverTimestamp() });
    tx.set(doc(db, "events", eventId, "participants", uid), {
      uid,
      displayName: payload.displayName || "Игрок",
      stats: payload.stats || {},
      joinedAt: serverTimestamp()
    }, { merge:true });
  });
}
export async function deleteEventApplication(eventId, uid){
  await deleteDoc(doc(db, "events", eventId, "applications", uid));
}
export async function setEventApplicationStatus(eventId, uid, status){
  await updateDoc(doc(db, "events", eventId, "applications", uid), { status, updatedAt: serverTimestamp() });
}
export async function addParticipant(eventId, appData){
  await setDoc(doc(db, "events", eventId, "participants", appData.uid), {
    uid: appData.uid,
    displayName: appData.displayName || "Игрок",
    stats: appData.stats || {},
    joinedAt: serverTimestamp()
  }, { merge:true });
}
export async function removeParticipant(eventId, uid){
  await deleteDoc(doc(db, "events", eventId, "participants", uid));
}

/* Chat */
export async function sendChatMessage(payload){
  await addDoc(collection(db, "chatMessages"), { ...payload, createdAt: serverTimestamp() });
}
export function listenChat(cb){
  const qy = query(collection(db, "chatMessages"), orderBy("createdAt", "desc"), limit(200));
  return onSnapshot(qy, (snap)=>{
    const msgs = snap.docs.map(d=>({ id:d.id, ...d.data() })).reverse();
    cb(msgs);
  });
}
export async function updateChatMessage(msgId, newText){
  await updateDoc(doc(db, "chatMessages", msgId), { text: newText });
}
export async function deleteChatMessage(msgId){
  await deleteDoc(doc(db, "chatMessages", msgId));
}

/* Chat moderation */
export async function setChatMute(uid, untilTimestampOrNull){
  await updateDoc(doc(db, "users", uid), { "chat.mutedUntil": untilTimestampOrNull, updatedAt: serverTimestamp() });
}
export async function setChatBan(uid, banned){
  await updateDoc(doc(db, "users", uid), { "chat.banned": !!banned, updatedAt: serverTimestamp() });
}

/* Pinned */
export function listenPinned(cb){
  return onSnapshot(doc(db, "chatPinned", "main"), (snap)=> cb(snap.exists() ? snap.data() : null));
}
export async function setPinned(payload){
  await setDoc(doc(db, "chatPinned", "main"), { ...payload, pinnedAt: serverTimestamp() }, { merge:true });
}

/* Typing */
export function listenTyping(cb){
  const qy = query(collection(db, "chatTyping"), orderBy("updatedAt", "desc"), limit(20));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>d.data())));
}
export async function setTyping(uid, displayName, isTyping){
  const ref = doc(db, "chatTyping", uid);
  if (!isTyping){
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { uid, displayName, updatedAt: serverTimestamp() }, { merge:true });
}

/* Chat admin clear */
export async function adminClearChatLastN(n){
  const qy = query(collection(db, "chatMessages"), orderBy("createdAt", "desc"), limit(n));
  const snap = await getDocs(qy);
  const batch = writeBatch(db);
  snap.docs.forEach(d=> batch.delete(d.ref));
  await batch.commit();
}

/* Reactions (subcollection) */
export async function setReaction(msgId, uid, displayName, emoji){
  const ref = doc(db, "chatMessages", msgId, "reactions", uid);
  if (!emoji){
    await deleteDoc(ref);
    return;
  }
  await setDoc(ref, { uid, displayName: displayName || "Игрок", emoji, updatedAt: serverTimestamp() }, { merge:true });
}
export function listenReactions(msgId, cb){
  const qy = query(collection(db, "chatMessages", msgId, "reactions"), orderBy("updatedAt", "desc"), limit(200));
  return onSnapshot(qy, (snap)=> cb(snap.docs.map(d=>d.data())));
}
