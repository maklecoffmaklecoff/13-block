// js/pages/roster.js
import {
  listMembers, getMyClanApplication, submitClanApplication,
  listClanApplications, setClanApplicationStatus, addMemberFromApplication,
  deleteClanApplication
} from "../db.js";
import { notify } from "../notify.js";
import { buildStatsForm, readStatsForm, renderStatsKV, openModal } from "../ui.js";
import { validateStats } from "../validators.js";
import { go } from "../router.js";

export async function renderRoster(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const head = document.createElement("div");
  head.className = "card";
  head.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Состав клана</div>
        <div class="card-sub">Участники и заявки на вступление</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
        <input class="input" id="search" placeholder="Поиск по нику${ctx.isAdmin ? " или UID" : ""}..." style="max-width:320px;" />
        <select class="input" id="sort" style="max-width:220px;">
          <option value="joinedAt">Сортировка: новые</option>
          <option value="respect">Топ: уважение</option>
          <option value="energy">Топ: энергия</option>
          <option value="hp">Топ: хп</option>
        </select>
        ${ctx.authed ? `<span class="badge ok">Вы авторизованы</span>` : `<span class="badge warn">Гость</span>`}
      </div>
    </div>
  `;
  root.appendChild(head);

  const membersCard = document.createElement("div");
  membersCard.className = "card";
  membersCard.innerHTML = `
    <div class="row">
      <div>
        <div class="section-title">Участники</div>
        <div class="muted">Открыть профиль — посмотреть статы</div>
      </div>
      <span class="badge" id="count">0</span>
    </div>
    <div class="hr"></div>
    <div class="member-grid" id="mg"></div>
  `;
  root.appendChild(membersCard);

  const members = await listMembers();
  membersCard.querySelector("#count").textContent = String(members.length);

  const mg = membersCard.querySelector("#mg");

  const renderMembers = ()=>{
    mg.innerHTML = "";
    const f = (head.querySelector("#search").value || "").toLowerCase().trim();
    const sortMode = head.querySelector("#sort").value || "joinedAt";

    const sorted = [...members].sort((a,b)=>{
      if (sortMode === "joinedAt") return 0; // уже пришло отсортированным из БД
      return Number(b.stats?.[sortMode] ?? 0) - Number(a.stats?.[sortMode] ?? 0);
    });

    const filtered = sorted.filter(m=>{
      const name = String(m.displayName || "").toLowerCase();
      const uid = String(m.uid || "").toLowerCase();
      return !f || name.includes(f) || (ctx.isAdmin && uid.includes(f));
    });

    if (!filtered.length){
      mg.innerHTML = `<div class="muted">Ничего не найдено</div>`;
      return;
    }

    for (const m of filtered){
      const el = document.createElement("div");
      el.className = "member";

      const uidLine = ctx.isAdmin
        ? `<div class="member-uid">${escapeHtml(m.uid || "")}</div>`
        : `<div class="member-uid">UID скрыт</div>`;

      el.innerHTML = `
        <div class="member-head">
          <div class="member-face">
            <img class="member-ava" src="${escapeAttr(m.photoURL || "")}" alt="avatar" />
            <div class="member-meta">
              <div class="member-name">${escapeHtml(m.displayName || "Игрок")}</div>
              ${uidLine}
            </div>
          </div>

          <div class="member-actions">
            <button class="btn small" data-open="${escapeAttr(m.uid)}">Профиль</button>
            <button class="btn small" data-stats="${escapeAttr(m.uid)}">Статы</button>
          </div>
        </div>

        <div class="member-mini">
          hp:${m.stats?.hp ?? 0}, en:${m.stats?.energy ?? 0}, rep:${m.stats?.respect ?? 0}<br/>
          ev:${m.stats?.evasion ?? 0}, arm:${m.stats?.armor ?? 0}, res:${m.stats?.resistance ?? 0}
        </div>
      `;
      mg.appendChild(el);

      const img = el.querySelector(".member-ava");
      img.addEventListener("error", ()=>{
        img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";
      }, { once:true });

      el.querySelector(`[data-open="${m.uid}"]`).addEventListener("click", ()=> go("user", { uid: m.uid }));
      el.querySelector(`[data-stats="${m.uid}"]`).addEventListener("click", ()=>{
        const node = document.createElement("div");
        node.appendChild(renderStatsKV(m.stats || {}));
        openModal(`Статы: ${m.displayName || "Игрок"}`, node);
      });
    }
  };

  renderMembers();
  head.querySelector("#search").addEventListener("input", renderMembers);
  head.querySelector("#sort").addEventListener("change", renderMembers);

  // Apply + admin apps
  const bottom = document.createElement("div");
  bottom.className = "grid two";
  bottom.innerHTML = `
    <div class="card" id="applyCard"></div>
    <div class="card" id="adminCard" style="display:${ctx.isAdmin ? "" : "none"};"></div>
  `;
  root.appendChild(bottom);

  const applyCard = bottom.querySelector("#applyCard");
  if (!ctx.authed){
    applyCard.innerHTML = `
      <div class="card-title">Заявка в клан</div>
      <div class="card-sub">Чтобы подать заявку — нужно войти</div>
      <div class="muted">Авторизуйся через кнопку «Войти» сверху.</div>
    `;
  } else {
    const myApp = await getMyClanApplication(ctx.uid);
    const statusHtml = !myApp
      ? `<span class="badge warn">Нет заявки</span>`
      : myApp.status === "approved"
        ? `<span class="badge ok">Принята</span>`
        : myApp.status === "rejected"
          ? `<span class="badge bad">Отклонена</span>`
          : `<span class="badge warn">На рассмотрении</span>`;

    applyCard.innerHTML = `
      <div class="row">
        <div>
          <div class="card-title">Заявка в клан</div>
          <div class="card-sub">Одна заявка на человека</div>
        </div>
        <div>${statusHtml}</div>
      </div>
      <div class="hr"></div>
      <div id="area"></div>
    `;

    const area = applyCard.querySelector("#area");
    if (!myApp){
      const statsForm = buildStatsForm(ctx.userDoc?.stats || {});
      area.innerHTML = `
        <div class="label">Комментарий (необязательно)</div>
        <textarea class="textarea" id="comment" placeholder="Активность, время, роль..."></textarea>
        <div class="hr"></div>
        <div class="section-title">Статы (обязательно)</div>
        <div id="sf"></div>
        <div class="hr"></div>
        <button class="btn primary" id="btnApply">Подать заявку</button>
      `;
      area.querySelector("#sf").appendChild(statsForm);

      area.querySelector("#btnApply").addEventListener("click", async ()=>{
        try{
          const v = validateStats(readStatsForm(statsForm));
          if (!v.ok) throw new Error(v.error);

          await submitClanApplication(ctx.uid, {
            displayName: ctx.userDoc?.displayName || "Игрок",
            photoURL: ctx.userDoc?.photoURL || "",
            comment: area.querySelector("#comment").value.trim(),
            stats: v.value
          });

          notify("ok", "Отправлено", "Заявка в клан отправлена");
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    } else {
      area.innerHTML = `
        <div class="muted">Заявка уже создана. Можно удалить и подать заново.</div>
        <div style="height:10px"></div>
        <div class="row">
          <button class="btn danger" id="delMyApp">Удалить мою заявку</button>
          <button class="btn" id="openMyProfile">Мой профиль</button>
        </div>
      `;
      area.querySelector("#delMyApp").addEventListener("click", async ()=>{
        try{
          await deleteClanApplication(ctx.uid);
          notify("warn", "Удалено", "Ваша заявка удалена");
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
      area.querySelector("#openMyProfile").addEventListener("click", ()=> go("profile"));
    }
  }

  if (ctx.isAdmin){
    const adminCard = bottom.querySelector("#adminCard");
    const apps = await listClanApplications();

    adminCard.innerHTML = `
      <div class="card-title">Админ: заявки</div>
      <div class="card-sub">Принять/отклонить/удалить</div>
      <div class="hr"></div>
      <table class="table">
        <thead><tr><th>Игрок</th><th>Статус</th><th>Действия</th></tr></thead>
        <tbody id="appsBody"></tbody>
      </table>
    `;

    const body = adminCard.querySelector("#appsBody");
    body.innerHTML = apps.length ? "" : `<tr><td colspan="3" class="muted">Нет заявок</td></tr>`;

    for (const a of apps){
      const cls = a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div style="font-weight:1000;">${escapeHtml(a.displayName || a.uid)}</div>
          <div class="muted" style="font-size:12px; font-family:var(--mono);">${escapeHtml(a.uid)}</div>
          <button class="btn small" data-open="${escapeAttr(a.uid)}">Профиль</button>
        </td>
        <td><span class="badge ${cls}">${escapeHtml(a.status)}</span></td>
        <td>
          <div class="row">
            <button class="btn ok small" data-approve="${escapeAttr(a.uid)}">Принять</button>
            <button class="btn danger small" data-reject="${escapeAttr(a.uid)}">Отклонить</button>
            <button class="btn danger small" data-del="${escapeAttr(a.uid)}">Удалить</button>
          </div>
        </td>
      `;
      body.appendChild(tr);

      tr.querySelector(`[data-open="${a.uid}"]`).addEventListener("click", ()=> go("user", { uid: a.uid }));

      tr.querySelector(`[data-approve="${a.uid}"]`).addEventListener("click", async ()=>{
        try{
          await setClanApplicationStatus(a.uid, "approved");
          await addMemberFromApplication(a);
          notify("ok", "Готово", "Заявка принята, участник добавлен");
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });

      tr.querySelector(`[data-reject="${a.uid}"]`).addEventListener("click", async ()=>{
        try{
          await setClanApplicationStatus(a.uid, "rejected");
          notify("warn", "Готово", "Заявка отклонена");
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });

      tr.querySelector(`[data-del="${a.uid}"]`).addEventListener("click", async ()=>{
        try{
          await deleteClanApplication(a.uid);
          notify("warn", "Удалено", "Заявка удалена");
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    }
  }

  return root;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s).replace(/"/g, "&quot;");
}
