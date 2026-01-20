// js/pages/user.js
import { getUser } from "../db.js";
import { renderStatsKV } from "../ui.js";
import { go } from "../router.js";

export async function renderUser(ctx){
  const uid = ctx.q?.uid;
  const root = document.createElement("div");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Профиль игрока</div>
        <div class="card-sub">Просмотр</div>
      </div>
      <div class="row">
        <button class="btn" id="back">Назад</button>
      </div>
    </div>
    <div class="hr"></div>
    <div id="body"></div>
  `;
  root.appendChild(card);

  card.querySelector("#back").addEventListener("click", ()=>{
    history.back();
  });

  const body = card.querySelector("#body");

  if (!uid){
    body.innerHTML = `<div class="muted">Не указан uid. Пример: #user?uid=...</div>`;
    return root;
  }

  const u = await getUser(uid);
  if (!u){
    body.innerHTML = `<div class="muted">Пользователь не найден.</div>`;
    return root;
  }

  body.innerHTML = `
    <div class="row">
      <div style="display:flex; gap:12px; align-items:center;">
        <img id="ava" class="avatar" style="width:48px;height:48px;" alt="avatar" />
        <div>
          <div style="font-weight:1000; font-size:18px;">${escapeHtml(u.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:4px;">${escapeHtml(u.uid || uid)}</div>
        </div>
      </div>
      <span class="badge">${escapeHtml(u.role || "user")}</span>
    </div>
    <div class="hr"></div>
    <div class="section-title">Статы</div>
  `;
  const ava = body.querySelector("#ava");
  ava.src = u.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";

  body.appendChild(renderStatsKV(u.stats || {}));

  // удобная кнопка “написать в чат” (возврат)
  const quick = document.createElement("div");
  quick.className = "card soft";
  quick.style.marginTop = "14px";
  quick.innerHTML = `
    <div class="row">
      <div class="muted">Быстрое действие</div>
      <button class="btn primary" id="toChat">Открыть чат</button>
    </div>
  `;
  quick.querySelector("#toChat").addEventListener("click", ()=> go("chat"));
  root.appendChild(quick);

  return root;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
