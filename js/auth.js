// js/auth.js
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,

  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,

  linkWithCredential,
  EmailAuthProvider,

  reauthenticateWithCredential,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import { auth } from "./firebase.js";
import { ensureUserDoc, getUser } from "./db.js";

export function initAuth(onChange){
  return onAuthStateChanged(auth, async (user)=>{
    if (user){
      await ensureUserDoc(user);
      const u = await getUser(user.uid);
      onChange({ firebaseUser: user, userDoc: u });
    } else {
      onChange({ firebaseUser: null, userDoc: null });
    }
  });
}

/* Google */
export async function loginGoogle(){
  const provider = new GoogleAuthProvider();
  await signInWithPopup(auth, provider);
}

/* Email/Password */
export async function registerEmail({ email, password, displayName }){
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName){
    await updateProfile(cred.user, { displayName });
  }
  return cred.user;
}

export async function loginEmail({ email, password }){
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function resetPassword(email){
  await sendPasswordResetEmail(auth, email);
}

/* Link email/pass to existing account (например, вошёл через Google и хочет пароль) */
export async function linkEmailPassword({ email, password }){
  const user = auth.currentUser;
  if (!user) throw new Error("Нужно быть авторизованным, чтобы привязать почту/пароль.");
  const credential = EmailAuthProvider.credential(email, password);
  await linkWithCredential(user, credential);
}

/**
 * Change password for current user.
 * Требует "недавнюю авторизацию", поэтому мы реаутентифицируем по старому паролю.
 * Работает только если у пользователя есть Email/Password аккаунт.
 */
export async function changePasswordWithOld({ email, oldPassword, newPassword }){
  const user = auth.currentUser;
  if (!user) throw new Error("Нужно войти в аккаунт.");
  if (!email) throw new Error("Укажите email.");
  if (!oldPassword) throw new Error("Укажите текущий пароль.");
  if (!newPassword || newPassword.length < 6) throw new Error("Новый пароль должен быть минимум 6 символов.");

  const cred = EmailAuthProvider.credential(email, oldPassword);
  await reauthenticateWithCredential(user, cred);
  await updatePassword(user, newPassword);
}

export async function logout(){
  await signOut(auth);
}
