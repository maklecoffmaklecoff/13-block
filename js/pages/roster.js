// js/pages/roster.js
import {
  listMembers,
  isMember,
  getMyClanApplication,
  submitClanApplication,
  deleteClanApplication,
  listClanApplications,
  setClanApplicationStatus,
  addMemberFromApplication
} from "../db.js";
import { notify } from "../notify.js";
import { buildStatsForm, readStatsForm, renderStatsKV, openModal } from "../ui.js";
import { validateStats } from "../validators.js";
import { go } from "../router.js";

export async function renderRoster(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const members = await listMembers();

  // TOP panels
  const top3Respect = [...members].sort((a,b)=> (b.stats?.respect ?? 0) - (a.stats?.respect ?? 0)).slice(0,3);
  const top3Energy  = [...members].sort((a,b)=> (b.stats?.energy ?? 0) - (a.stats?.energy ?? 0)).slice(0,3);

  const topPanel = document.createElement("div");
  topPanel.className = "grid two";
  topPanel.innerHTML = `
    <div class="card soft">
      <div class="row"><div class="section-title">TOP‑3 👥 Уважение</div><span class="badge">Клан</span></div>
      <div class="hr"></div>
      <div id="topR"></div>
    </div>
    <div class="card soft">
      <div class="row"><div class="section-title">TOP‑3 ⚡️ Энергия</div><span class="badge">Клан</span></div>
      <div class="hr"></div>
      <div id="topE"></div>
    </div>
  `;
  root.appendChild(topPanel);

  renderTopList(topPanel.querySelector("#topR"), top3Respect, "respect");
  renderTopList(topPanel.querySelector("#topE"), top3Energy, "energy");

  // Controls
  const controls = document.createElement("div");
  controls.className = "card";
  controls.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Состав клана</div>
        <div class="card-sub">Карточки участников • быстрый просмотр по клику</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <input class="input" id="search" placeholder="Поиск по нику${ctx.isAdmin ? " или UID" : ""}..." style="max-width:320px;" />
        <select class="input" id="sort" style="max-width:220px;">
          <option value="joinedAt">Сортировка: новые</option>
          <option value="respect">Топ: уважение</option>
          <option value="energy">Топ: энергия</option>
          <option value="hp">Топ: хп</option>
        </select>
        <span class="badge" id="count">Участников: ${members.length}</span>
        <button class="btn primary" id="applyBtn" style="display:none; width:auto;">Заявка в клан</button>
        ${ctx.isAdmin ? `<button class="btn" id="adminApps" style="width:auto;">Админ: заявки</button>` : ``}
      </div>
    </div>
  `;
  root.appendChild(controls);

  // show apply only if authed and NOT member
  let member = false;
  if (ctx.authed) member = await isMember(ctx.uid);
  const applyBtn = controls.querySelector("#applyBtn");
  if (ctx.authed && !member) applyBtn.style.display = "";

  // Members list
  const membersCard = document.createElement("div");
  membersCard.className = "card";
  membersCard.innerHTML = `<div class="member-grid" id="mg"></div>`;
  root.appendChild(membersCard);

  const mg = membersCard.querySelector("#mg");

  const openQuickProfile = (m)=>{
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="row">
        <div style="display:flex; gap:10px; align-items:center;">
          <img class="member-ava" style="width:46px;height:46px;border-radius:16px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
          <div>
            <div style="font-weight:1000; font-size:16px;">${escapeHtml(m.displayName || "Игрок")}</div>
            ${ctx.isAdmin ? `<div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid)}</div>` : ``}
          </div>
        </div>
        <button class="btn small" id="full" style="width:auto;">Профиль</button>
      </div>
      <div class="hr"></div>
    `;
    node.querySelector("#full").addEventListener("click", ()=> go("user", { uid: m.uid }));
    node.appendChild(renderStatsKV(m.stats || {}));
    openModal("Быстрый профиль", node);
  };

  const renderMembers = ()=>{
    mg.innerHTML = "";
    const f = (controls.querySelector("#search").value || "").toLowerCase().trim();
    const sortMode = controls.querySelector("#sort").value || "joinedAt";

    const sorted = [...members].sort((a,b)=>{
      if (sortMode === "joinedAt") return 0;
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
      el.style.cursor = "pointer";

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
            <button class="btn small" data-open="${escapeAttr(m.uid)}" style="width:auto;">Профиль</button>
          </div>
        </div>

        <div class="member-mini">
          hp:${m.stats?.hp ?? 0}, en:${m.stats?.energy ?? 0}, rep:${m.stats?.respect ?? 0}<br/>
          ev:${m.stats?.evasion ?? 0}, arm:${m.stats?.armor ?? 0}, res:${m.stats?.resistance ?? 0}
        </div>
      `;
      mg.appendChild(el);

      el.querySelector(`[data-open="${m.uid}"]`).addEventListener("click", (e)=>{
        e.stopPropagation();
        go("user", { uid: m.uid });
      });

      el.addEventListener("click", ()=> openQuickProfile(m));
    }
  };

  renderMembers();
  controls.querySelector("#search").addEventListener("input", renderMembers);
  controls.querySelector("#sort").addEventListener("change", renderMembers);

  // Apply modal
  if (ctx.authed && !member){
    applyBtn.addEventListener("click", async ()=>{
      const myApp = await getMyClanApplication(ctx.uid);
      openMyClanApplicationModal(ctx, myApp);
    });
  }

  // Admin apps modal button
  if (ctx.isAdmin){
    controls.querySelector("#adminApps").addEventListener("click", async ()=>{
      const apps = await listClanApplications();
      // filter: hide those already in members
      const memberSet = new Set(members.map(m=>m.uid));
      const filtered = apps.filter(a => !memberSet.has(a.uid));

      const node = document.createElement("div");
      node.innerHTML = `
        <div class="row">
          <div>
            <div class="section-title">Админ: заявки в клан</div>
            <div class="muted">Показаны только те, кто ещё НЕ в составе</div>
          </div>
          <span class="badge">Всего: ${filtered.length}</span>
        </div>
        <div class="hr"></div>
        <table class="table">
          <thead><tr><th>Игрок</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody id="ab"></tbody>
        </table>
      `;
      const close = openModal("Админ: заявки", node);
      const tbody = node.querySelector("#ab");

      tbody.innerHTML = filtered.length ? "" : `<tr><td colspan="3" class="muted">Нет заявок</td></tr>`;

      for (const a of filtered){
        const cls = a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div style="font-weight:1000;">${escapeHtml(a.displayName || a.uid)}</div>
            <div class="muted" style="font-size:12px; font-family:var(--mono);">${escapeHtml(a.uid)}</div>
            <button class="btn small" data-open="${escapeAttr(a.uid)}">Профиль</button>
            <button class="btn small" data-view="${escapeAttr(a.uid)}">Статы</button>
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
        tbody.appendChild(tr);

        tr.querySelector(`[data-open="${a.uid}"]`).addEventListener("click", ()=> go("user", { uid: a.uid }));
        tr.querySelector(`[data-view="${a.uid}"]`).addEventListener("click", ()=>{
          const n = document.createElement("div");
          n.appendChild(renderStatsKV(a.stats || {}));
          openModal(`Статы заявки: ${a.displayName || a.uid}`, n);
        });

        tr.querySelector(`[data-approve="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setClanApplicationStatus(a.uid, "approved");
            await addMemberFromApplication(a);
            notify("ok", "Готово", "Принят в клан");
            close();
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-reject="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setClanApplicationStatus(a.uid, "rejected");
            notify("warn", "Готово", "Отклонено");
            close();
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-del="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await deleteClanApplication(a.uid);
            notify("warn", "Удалено", "Заявка удалена");
            close();
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
      }
    });
  }

  return root;
}

function openMyClanApplicationModal(ctx, myApp){
  const node = document.createElement("div");
  node.innerHTML = `
    <div class="row">
      <div>
        <div class="section-title">Заявка в клан</div>
        <div class="muted">Одна заявка на человека (можно удалить и подать заново)</div>
      </div>
      <div id="status"></div>
    </div>
    <div class="hr"></div>
    <div id="body"></div>
  `;
  const status = node.querySelector("#status");

  if (!myApp) status.innerHTML = `<span class="badge warn">Нет заявки</span>`;
  else if (myApp.status === "approved") status.innerHTML = `<span class="badge ok">Принята</span>`;
  else if (myApp.status === "rejected") status.innerHTML = `<span class="badge bad">Отклонена</span>`;
  else status.innerHTML = `<span class="badge warn">На рассмотрении</span>`;

  const body = node.querySelector("#body");

  if (!myApp){
    const statsForm = buildStatsForm(ctx.userDoc?.stats || {});
    body.innerHTML = `
      <div class="label">Комментарий (необязательно)</div>
      <textarea class="textarea" id="comment" placeholder="Активность, время, роль..."></textarea>
      <div class="hr"></div>
      <div class="section-title">Статы (обязательно)</div>
      <div id="sf"></div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn primary" id="send" style="width:auto;">Отправить</button>
      </div>
    `;
    body.querySelector("#sf").appendChild(statsForm);

    const close = openModal("Заявка в клан", node);
    body.querySelector("#send").addEventListener("click", async ()=>{
      try{
        const v = validateStats(readStatsForm(statsForm));
        if (!v.ok) throw new Error(v.error);

        await submitClanApplication(ctx.uid, {
          displayName: ctx.userDoc?.displayName || "Игрок",
          photoURL: ctx.userDoc?.photoURL || "",
          comment: body.querySelector("#comment").value.trim(),
          stats: v.value
        });

        notify("ok", "Отправлено", "Заявка отправлена");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  } else {
    body.innerHTML = `
      <div class="muted">Заявка уже есть.</div>
      <div style="height:10px"></div>
      <div class="row">
        <button class="btn danger" id="del" style="width:auto;">Удалить</button>
        <button class="btn" id="myProfile" style="width:auto;">Мой профиль</button>
      </div>
    `;

    const close = openModal("Заявка в клан", node);
    body.querySelector("#del").addEventListener("click", async ()=>{
      try{
        await deleteClanApplication(ctx.uid);
        notify("warn", "Удалено", "Заявка удалена");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
    body.querySelector("#myProfile").addEventListener("click", ()=> go("profile"));
  }
}

function renderTopList(containerEl, list, mode){
  containerEl.innerHTML = list.length ? "" : `<div class="muted">Пока пусто</div>`;
  for (const m of list){
    const row = document.createElement("div");
    row.className = "row";
    row.style.padding = "8px 0";
    row.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <img class="member-ava" style="width:34px;height:34px;border-radius:12px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
        <div>
          <div style="font-weight:1000;">${escapeHtml(m.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px;">
            ${mode === "respect" ? `respect: ${m.stats?.respect ?? 0}` : `energy: ${m.stats?.energy ?? 0}`}
          </div>
        </div>
      </div>
      <button class="btn small" data-open="${escapeAttr(m.uid)}">Профиль</button>
    `;
    containerEl.appendChild(row);
    row.querySelector(`[data-open="${m.uid}"]`).addEventListener("click", ()=> go("user", { uid: m.uid }));
  }
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
