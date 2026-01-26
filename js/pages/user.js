// js/pages/user.js
import { getUser } from "../db.js";
import { renderStatsKV } from "../ui.js";
import { go } from "../router.js";

import {
  getClanApplicationForUser,
  getEventApplicationsForUserAsAdmin,
  getEventsByIds,
} from "../services/userAdminView.js";

export async function renderUser(ctx){
  const uid = ctx.q?.uid || ctx.q?.id;
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Профиль игрока</div>
        <div class="card-sub">Просмотр</div>
      </div>
      <button class="btn" id="back" style="width:auto;">Назад</button>
    </div>
    <div class="hr"></div>
    <div id="body"></div>
  `;
  root.appendChild(card);

  card.querySelector("#back").addEventListener("click", ()=> history.back());

  const body = card.querySelector("#body");
  if (!uid){
    body.innerHTML = `<div class="muted">Не указан uid.</div>`;
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
        <img class="avatar" style="width:54px;height:54px;border-radius:18px;" alt="avatar" src="${escapeAttr(u.photoURL || "")}">
        <div>
          <div style="font-weight:1000; font-size:18px;">${escapeHtml(u.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:4px;">${escapeHtml(u.uid || uid)}</div>
        </div>
      </div>
      <span class="badge ${u.role === "admin" ? "ok" : ""}">${escapeHtml(u.role || "user")}</span>
    </div>

    <div class="hr"></div>

    <div class="grid two profile-two" style="align-items:stretch;">
      <div class="card soft profile-left">
        <div class="section-title">📌 Полезное</div>
        <div class="hr"></div>

        <div class="kv kv-2col">
          <div class="kv-row">
            <div class="kv-k">Telegram</div>
            <div class="kv-v">${escapeHtml(u.contacts?.telegram || "—")}</div>
          </div>
          <div class="kv-row">
            <div class="kv-k">Часовой пояс</div>
            <div class="kv-v">${escapeHtml(u.timezone || "—")}</div>
          </div>

          <div class="kv-row">
            <div class="kv-k">Специализация</div>
            <div class="kv-v">${escapeHtml(prettySpec(u.specialization))}</div>
          </div>
          <div class="kv-row">
            <div class="kv-k">Когда онлайн</div>
            <div class="kv-v">${escapeHtml(prettyAvailability(u.availability))}</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="section-title">🎯 Цель на неделю</div>
        <div class="muted" style="white-space:pre-wrap; line-height:1.55;">${escapeHtml(u.weeklyGoal?.text || "—")}</div>
        <div style="height:10px;"></div>
        <span class="badge ${u.weeklyGoal?.done ? "ok" : ""}">${u.weeklyGoal?.done ? "Выполнено" : "Не выполнено"}</span>

        <div class="hr"></div>

        <div class="section-title">📝 О себе / чем полезен</div>
        <div class="muted" style="white-space:pre-wrap; line-height:1.55;">${escapeHtml(u.about || "—")}</div>
      </div>

      <div class="card soft profile-right">
        <div class="section-title">📊 Статы</div>
        <div class="hr"></div>
        <div id="stats"></div>
      </div>
    </div>
  `;
  body.querySelector("#stats").appendChild(renderStatsKV(u.stats || {}));

  // ===== Admin block =====
  if (ctx.isAdmin){
    const adminCard = document.createElement("div");
    adminCard.className = "card";
    adminCard.innerHTML = `
      <div class="row">
        <div>
          <div class="card-title">Интеграция игрока (админ)</div>
          <div class="card-sub">Заявка в клан • заявки на события • события участника</div>
        </div>
        <button class="btn" id="refresh" style="width:auto;">Обновить</button>
      </div>

      <div class="hr"></div>

      <div class="grid two" style="align-items:start;">
        <div class="card soft">
          <div class="section-title">🧾 Заявки</div>
          <div class="hr"></div>
          <div id="apps" class="muted">Загрузка…</div>
        </div>

        <div class="card soft">
          <div class="section-title">📅 События</div>
          <div class="hr"></div>
          <div id="events" class="muted">Загрузка…</div>
        </div>
      </div>
    `;
    root.appendChild(adminCard);

    const $apps = adminCard.querySelector("#apps");
    const $events = adminCard.querySelector("#events");

    const load = async ()=>{
      try{
        const [clanApp, eventApps] = await Promise.all([
          getClanApplicationForUser(uid),
          getEventApplicationsForUserAsAdmin(uid),
        ]);
        $apps.innerHTML = renderAppsHtml(clanApp, eventApps);
      }catch(e){
        $apps.innerHTML = `<span class="bad">Ошибка: ${escapeHtml(e.message)}</span>`;
      }

      try{
        const ids = Array.isArray(u.myEventIds) ? u.myEventIds : [];
        const evs = await getEventsByIds(ids.slice(0, 30));
        $events.innerHTML = renderMyEventsHtml(evs);
      }catch(e){
        $events.innerHTML = `<span class="bad">Ошибка: ${escapeHtml(e.message)}</span>`;
      }
    };

    adminCard.querySelector("#refresh").addEventListener("click", load);
    await load();
  }

  return root;
}

/* ---- helpers ---- */

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  return d.toLocaleString("ru-RU", { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function prettyStatus(s) {
  const map = { pending:"На рассмотрении", approved:"Одобрено", rejected:"Отклонено", canceled:"Отменено", unknown:"Неизвестно" };
  return map[s] || s;
}

function renderAppsHtml(clanApp, eventApps) {
  const clanHtml = clanApp
    ? `
      <div class="stat"><span>Заявка в клан</span><b>${escapeHtml(prettyStatus(clanApp.status))}</b></div>
      <div class="stat"><span>Дата</span><b>${escapeHtml(fmtDate(clanApp.createdAt))}</b></div>
    `
    : `<div class="muted">Заявки в клан нет</div>`;

  const evHtml = (eventApps && eventApps.length)
    ? eventApps.map(a => `
      <div class="npc-item" style="justify-content:space-between;">
        <div style="display:grid; gap:2px;">
          <div style="font-weight:1000;">${escapeHtml(a.title || "Событие")}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(fmtDate(a.date))}</div>
          <div class="muted" style="font-size:12px;">Статус: <b>${escapeHtml(prettyStatus(a.status))}</b></div>
        </div>
        <a class="btn" style="width:auto;" href="#events">Открыть</a>
      </div>
    `).join("")
    : `<div class="muted" style="margin-top:10px;">Заявок на события нет</div>`;

  return `
    <div class="muted" style="font-size:12px; margin-bottom:6px;">Клан</div>
    ${clanHtml}
    <div class="hr"></div>
    <div class="muted" style="font-size:12px; margin-bottom:6px;">События</div>
    ${evHtml}
  `;
}

function renderMyEventsHtml(list) {
  if (!list || !list.length) return `<div class="muted">Нет событий</div>`;
  return `
    <div class="grid" style="gap:10px;">
      ${list.map(e => `
        <div class="npc-item" style="justify-content:space-between;">
          <div style="display:grid; gap:2px;">
            <div style="font-weight:1000;">${escapeHtml(e.title || "Событие")}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(fmtDate(e.date))}</div>
          </div>
          <a class="btn" style="width:auto;" href="#events">Открыть</a>
        </div>
      `).join("")}
    </div>
  `;
}

function prettyAvailability(av) {
  if (!av) return "—";
  const items = [];
  if (av.morning) items.push("утро");
  if (av.day) items.push("день");
  if (av.evening) items.push("вечер");
  if (av.night) items.push("ночь");
  return items.length ? items.join(", ") : "—";
}

function prettySpec(v) {
  const map = { none:"Не указано", tank:"Танк", dps:"ДПС", support:"Саппорт", universal:"Универсал" };
  return map[v] || "Не указано";
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
