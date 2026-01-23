// js/pages/roster.js
import {
  listMembers,
  isMember,
  getMyClanApplication,
  submitClanApplication,
  deleteClanApplication,
  listClanApplications,
  setClanApplicationStatus,
  addMemberFromApplication,
  getMyProfile
} from "../db.js";
import { notify } from "../notify.js";
import { renderStatsKV, openModal } from "../ui.js";
import { go } from "../router.js";

export async function renderRoster(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const members = await listMembers();

  // TOP-5 Power
  const top5Power = [...members]
    .map(m => ({ ...m, power: calcPower(m.stats || {}) }))
    .sort((a,b)=> (b.power ?? 0) - (a.power ?? 0))
    .slice(0, 5);

  const topPanel = document.createElement("div");
  topPanel.className = "card soft";
  topPanel.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">TOP‑5 по силе 💪</div>
        <div class="card-sub">Описание: 💪 Сила, ❤️ ХП, ⚡️ Энергия, 🛡️ Броня, 🚧 Сопротивление, 🩸 Сопротивление крови, ☠️ Сопротивление яду</div>
      </div>
      <span class="badge">Клан</span>
    </div>
    <div class="hr"></div>
    <div id="topP"></div>
  `;
  root.appendChild(topPanel);

  renderTopPower(topPanel.querySelector("#topP"), top5Power);

  // Controls
  const controls = document.createElement("div");
  controls.className = "card";
  controls.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Состав клана</div>
        <div class="card-sub">Клик по карточке — быстрый просмотр</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <input class="input" id="search" placeholder="Поиск по нику${ctx.isAdmin ? " или UID" : ""}..." style="max-width:320px;" />
        <select class="input" id="sort" style="max-width:220px;">
          <option value="joinedAt">Сортировка: новые</option>
          <option value="power">Топ: сила</option>
          <option value="hp">Топ: хп</option>
          <option value="energy">Топ: энергия</option>
          <option value="respect">Топ: уважение</option>
        </select>
        <span class="badge" id="count">Участников: ${members.length}</span>
        <button class="btn primary" id="applyBtn" style="display:none; width:auto;">Заявка в клан</button>
        ${ctx.isAdmin ? `<button class="btn" id="adminApps" style="width:auto;">Админ: заявки</button>` : ``}
      </div>
    </div>
  `;
  root.appendChild(controls);

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
    const power = calcPower(m.stats || {});
    node.innerHTML = `
      <div class="row">
        <div style="display:flex; gap:10px; align-items:center;">
          <img class="member-ava" style="width:46px;height:46px;border-radius:16px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
          <div>
            <div style="font-weight:1000; font-size:16px;">${escapeHtml(m.displayName || "Игрок")}</div>
            <div class="muted" style="font-size:12px;">💪: <b>${formatPower(power)}</b></div>
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

    const enriched = members.map(m => ({ ...m, power: calcPower(m.stats || {}) }));

    const sorted = [...enriched].sort((a,b)=>{
      if (sortMode === "joinedAt") return 0;
      if (sortMode === "power") return (b.power ?? 0) - (a.power ?? 0);
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
              <div class="muted" style="font-size:12px;">💪: <b>${formatPower(m.power)}</b></div>
              ${uidLine}
            </div>
          </div>
        </div>

        <div class="member-mini">
          ❤️:${m.stats?.hp ?? 0}, ⚡️:${m.stats?.energy ?? 0}, 🛡️:${m.stats?.armor ?? 0}<br/>
          🚧:${m.stats?.resistance ?? 0}, 🩸:${m.stats?.bloodRes ?? 0}, ☠️:${m.stats?.poisonRes ?? 0}
        </div>
      `;
      mg.appendChild(el);

      el.addEventListener("click", ()=> openQuickProfile(m));
    }
  };
  
  function hasFilledStats(stats){
  const keys = ["hp","energy","respect","evasion","armor","resistance","bloodRes","poisonRes"];
  return stats && keys.every(k => Number(stats[k] ?? 0) > 0);
	}

  renderMembers();
  controls.querySelector("#search").addEventListener("input", renderMembers);
  controls.querySelector("#sort").addEventListener("change", renderMembers);

  // Apply modal (Variant A: data from profile)
  if (ctx.authed && !member){
    applyBtn.addEventListener("click", async ()=>{
      const myApp = await getMyClanApplication(ctx.uid);

      const node = document.createElement("div");
      node.innerHTML = `
        <div class="row">
          <div>
            <div class="section-title">Заявка в клан</div>
            <div class="muted">Ник/фото/статы берутся из профиля</div>
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
        body.innerHTML = `
          <div class="muted">Перед отправкой проверь профиль: ник и статы.</div>
          <div style="height:8px"></div>
          <button class="btn small" id="toProfile" style="width:auto;">Открыть профиль</button>
          <div class="hr"></div>
          <div class="label">Комментарий (необязательно)</div>
          <textarea class="textarea" id="comment" placeholder="Активность, время, роль..."></textarea>
          <div class="hr"></div>
          <button class="btn primary" id="send" style="width:auto;">Отправить заявку</button>
        `;

        const close = openModal("Заявка в клан", node);
        body.querySelector("#toProfile").addEventListener("click", ()=> go("profile"));

        body.querySelector("#send").addEventListener("click", async ()=>{
          try{
            const me = await getMyProfile(ctx.uid);
			if (!hasFilledStats(me.stats)) {
			throw new Error("Нельзя подать заявку без заполненных статов. Открой профиль и заполни статы.");
			}
            await submitClanApplication(ctx.uid, {
              displayName: me.displayName || "Игрок",
              photoURL: me.photoURL || "",
              stats: me.stats || {},
              comment: body.querySelector("#comment").value.trim()
            });
            notify("ok","Отправлено","Заявка отправлена");
            close();
            location.reload();
          }catch(e){
            notify("bad","Ошибка", e.message);
          }
        });
      } else {
        body.innerHTML = `
          <div class="muted">Заявка уже есть. Можно удалить и подать заново.</div>
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
            notify("warn","Удалено","Заявка удалена");
            close();
            location.reload();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });
        body.querySelector("#myProfile").addEventListener("click", ()=> go("profile"));
      }
    });
  }

  // Admin apps modal (hide members)
  if (ctx.isAdmin){
    controls.querySelector("#adminApps").addEventListener("click", async ()=>{
      const apps = await listClanApplications();
      const memberSet = new Set(members.map(m=>m.uid));
      const filtered = apps.filter(a => !memberSet.has(a.uid));

      const node = document.createElement("div");
      node.innerHTML = `
        <div class="row">
          <div>
            <div class="section-title">Админ: заявки</div>
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
        const power = calcPower(a.stats || {});
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div style="font-weight:1000;">${escapeHtml(a.displayName || a.uid)}</div>
            <div class="muted" style="font-size:12px;">💪: <b>${formatPower(power)}</b></div>
            <div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(a.uid)}</div>
            <button class="btn small" data-open="${escapeAttr(a.uid)}" style="width:auto;">Профиль</button>
          </td>
          <td><span class="badge ${cls}">${escapeHtml(a.status)}</span></td>
          <td>
            <div class="row">
              <button class="btn ok small" data-approve="${escapeAttr(a.uid)}" style="width:auto;">Принять</button>
              <button class="btn danger small" data-reject="${escapeAttr(a.uid)}" style="width:auto;">Отклонить</button>
              <button class="btn danger small" data-del="${escapeAttr(a.uid)}" style="width:auto;">Удалить</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);

        tr.querySelector(`[data-open="${a.uid}"]`).addEventListener("click", ()=> go("user", { uid: a.uid }));

        tr.querySelector(`[data-approve="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setClanApplicationStatus(a.uid, "approved");
            await addMemberFromApplication(a);
            notify("ok","Готово","Принят в клан");
            close();
            location.reload();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });

        tr.querySelector(`[data-reject="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setClanApplicationStatus(a.uid, "rejected");
            notify("warn","Готово","Отклонено");
            close();
            location.reload();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });

        tr.querySelector(`[data-del="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await deleteClanApplication(a.uid);
            notify("warn","Удалено","Заявка удалена");
            close();
            location.reload();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });
      }
    });
  }

  return root;
}

function calcPower(stats){
  const armor = Number(stats.armor ?? 0);
  const blood = Number(stats.bloodRes ?? 0);
  const poison = Number(stats.poisonRes ?? 0);
  const res = Number(stats.resistance ?? 0);
  const hp = Number(stats.hp ?? 0);

  const value = (armor * 2.5) + (blood * 1) + (poison * 2) + (res * 1) + (hp * 1.5);
  return value / 10;
}

function formatPower(x){
  const n = Number(x ?? 0);
  return n.toFixed(1);
}

function renderTopPower(containerEl, list){
  containerEl.innerHTML = list.length ? "" : `<div class="muted">Пока пусто</div>`;
  list.forEach((m, i)=>{
    const row = document.createElement("div");
    row.className = "row";
    row.style.padding = "8px 0";
    row.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="badge">#${i+1}</span>
        <img class="member-ava" style="width:34px;height:34px;border-radius:12px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
        <div>
          <div style="font-weight:1000;">${escapeHtml(m.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px;">💪: ${formatPower(m.power)}</div>
        </div>
      </div>
      <button class="btn small" data-open="${escapeAttr(m.uid)}" style="width:auto;">Профиль</button>
    `;
    containerEl.appendChild(row);
    row.querySelector(`[data-open="${m.uid}"]`).addEventListener("click", ()=> go("user", { uid: m.uid }));
  });
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
