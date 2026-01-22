// js/pages/admin.js
import { notify } from "../notify.js";
import { openModal } from "../ui.js";
import {
  listMembers, removeMember,
  listNews, deleteNews,
  listEvents, deleteEvent,
  setChatMute, setChatBan,
  searchUsersByNamePrefix, getUser, setUserRole
} from "../db.js";

export async function renderAdmin(ctx){
  const root = document.createElement("div");
  if (!ctx.isAdmin){
    const c = document.createElement("div");
    c.className = "card";
    c.innerHTML = `<div class="card-title">Нет доступа</div><div class="muted">Только для админов.</div>`;
    return c;
  }

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Админ‑панель</div>
        <div class="card-sub">Категории + поиск + управление</div>
      </div>
      <span class="badge ok">admin</span>
    </div>

    <div class="hr"></div>

    <div class="seg" id="seg">
      <button class="active" data-tab="users">Пользователи</button>
      <button data-tab="news">Новости</button>
      <button data-tab="events">События</button>
      <button data-tab="members">Members</button>
    </div>

    <div class="hr"></div>

    <div id="pane"></div>
  `;
  root.appendChild(card);

  const seg = card.querySelector("#seg");
  const pane = card.querySelector("#pane");

  const setTab = async (tab)=>{
    seg.querySelectorAll("button[data-tab]").forEach(b=>{
      b.classList.toggle("active", b.dataset.tab === tab);
    });

    if (tab === "users"){
      pane.innerHTML = `
        <div class="card soft">
          <div class="section-title">Поиск пользователя</div>
          <div class="muted" style="font-size:12px;">По началу ника (prefix).</div>
          <div class="hr"></div>

          <div class="row">
            <input class="input" id="q" placeholder="Начни вводить ник..." style="max-width:320px;" />
            <button class="btn primary" id="find" style="width:auto;">Найти</button>
          </div>

          <div class="hr"></div>

          <table class="table">
            <thead><tr><th>Пользователь</th><th>Роль</th><th>Действия</th></tr></thead>
            <tbody id="ub"></tbody>
          </table>
        </div>
      `;

      const qEl = pane.querySelector("#q");
      const ub = pane.querySelector("#ub");

      const renderUsers = async ()=>{
        const q = qEl.value.trim();
        const users = await searchUsersByNamePrefix(q, 25);
        ub.innerHTML = users.length ? "" : `<tr><td colspan="3" class="muted">Ничего не найдено</td></tr>`;

        for (const u of users){
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              <div style="font-weight:1000;">${escapeHtml(u.displayName || "Игрок")}</div>
              <div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(u.uid)}</div>
            </td>
            <td><span class="badge ${u.role === "admin" ? "ok" : ""}">${escapeHtml(u.role || "user")}</span></td>
            <td>
              <div class="row">
                <button class="btn small" data-open="${escapeAttr(u.uid)}" style="width:auto;">Открыть</button>
                <button class="btn small" data-role="${escapeAttr(u.uid)}" style="width:auto;">Роль</button>
              </div>
            </td>
          `;
          ub.appendChild(tr);

          tr.querySelector(`[data-open="${u.uid}"]`).addEventListener("click", async ()=>{
            const full = await getUser(u.uid);
            const node = document.createElement("div");
            node.innerHTML = `
              <div class="row">
                <div>
                  <div style="font-weight:1000;">${escapeHtml(full?.displayName || "Игрок")}</div>
                  <div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(u.uid)}</div>
                </div>
                <span class="badge ${full?.role === "admin" ? "ok" : ""}">${escapeHtml(full?.role || "user")}</span>
              </div>
              <div class="hr"></div>
              <div class="muted">Модерация чата</div>
              <div class="row" style="margin-top:10px;">
                <button class="btn small" id="mute10" style="width:auto;">Мут 10м</button>
                <button class="btn small" id="mute60" style="width:auto;">Мут 60м</button>
                <button class="btn small" id="unmute" style="width:auto;">Размут</button>
              </div>
              <div class="row" style="margin-top:10px;">
                <button class="btn danger small" id="ban" style="width:auto;">Бан</button>
                <button class="btn ok small" id="unban" style="width:auto;">Разбан</button>
              </div>
            `;
            openModal("Пользователь", node);

            const now = Date.now();
            node.querySelector("#mute10").addEventListener("click", async ()=>{
              await setChatMute(u.uid, new Date(now + 10*60*1000));
              notify("warn","Готово","Мут 10 минут");
            });
            node.querySelector("#mute60").addEventListener("click", async ()=>{
              await setChatMute(u.uid, new Date(now + 60*60*1000));
              notify("warn","Готово","Мут 60 минут");
            });
            node.querySelector("#unmute").addEventListener("click", async ()=>{
              await setChatMute(u.uid, null);
              notify("ok","Готово","Мут снят");
            });
            node.querySelector("#ban").addEventListener("click", async ()=>{
              await setChatBan(u.uid, true);
              notify("warn","Готово","Забанен");
            });
            node.querySelector("#unban").addEventListener("click", async ()=>{
              await setChatBan(u.uid, false);
              notify("ok","Готово","Разбанен");
            });
          });

          tr.querySelector(`[data-role="${u.uid}"]`).addEventListener("click", ()=>{
            const node = document.createElement("div");
            node.innerHTML = `
              <div class="muted">Роль для: <b>${escapeHtml(u.displayName || "Игрок")}</b></div>
              <div class="hr"></div>
              <div class="row">
                <button class="btn" id="user" style="width:auto;">user</button>
                <button class="btn ok" id="admin" style="width:auto;">admin</button>
              </div>
            `;
            const close = openModal("Роль", node);
            node.querySelector("#user").addEventListener("click", async ()=>{
              try{ await setUserRole(u.uid, "user"); notify("ok","Готово","Роль: user"); close(); setTab("users"); }
              catch(e){ notify("bad","Ошибка", e.message); }
            });
            node.querySelector("#admin").addEventListener("click", async ()=>{
              try{ await setUserRole(u.uid, "admin"); notify("ok","Готово","Роль: admin"); close(); setTab("users"); }
              catch(e){ notify("bad","Ошибка", e.message); }
            });
          });
        }
      };

      pane.querySelector("#find").addEventListener("click", renderUsers);
      qEl.addEventListener("input", ()=>{
        clearTimeout(qEl._t);
        qEl._t = setTimeout(renderUsers, 200);
      });

      return;
    }

    if (tab === "news"){
      const news = await listNews();
      pane.innerHTML = `
        <div class="card soft">
          <div class="section-title">Новости (${news.length})</div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Заголовок</th><th>Действия</th></tr></thead>
            <tbody id="nb"></tbody>
          </table>
        </div>
      `;
      const nb = pane.querySelector("#nb");
      nb.innerHTML = news.length ? "" : `<tr><td colspan="2" class="muted">Нет новостей</td></tr>`;
      for (const n of news){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div style="font-weight:1000;">${escapeHtml(n.title || "")}</div>
            <div class="muted clamp2">${escapeHtml(n.text || "")}</div>
          </td>
          <td><button class="btn danger small" data-del="${escapeAttr(n.id)}" style="width:auto;">Удалить</button></td>
        `;
        nb.appendChild(tr);
        tr.querySelector(`[data-del="${n.id}"]`).addEventListener("click", async ()=>{
          await deleteNews(n.id);
          notify("warn","Удалено","Новость удалена");
          setTab("news");
        });
      }
      return;
    }

    if (tab === "events"){
      const events = await listEvents();
      pane.innerHTML = `
        <div class="card soft">
          <div class="section-title">События (${events.length})</div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Событие</th><th>Действия</th></tr></thead>
            <tbody id="eb"></tbody>
          </table>
        </div>
      `;
      const eb = pane.querySelector("#eb");
      eb.innerHTML = events.length ? "" : `<tr><td colspan="2" class="muted">Нет событий</td></tr>`;
      for (const ev of events){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div style="font-weight:1000;">${escapeHtml(ev.title || "")}</div>
            <div class="muted">capacity: ${Number(ev.capacity ?? 0)} • auto: ${ev.autoApprove ? "ON" : "OFF"}</div>
          </td>
          <td><button class="btn danger small" data-del="${escapeAttr(ev.id)}" style="width:auto;">Удалить</button></td>
        `;
        eb.appendChild(tr);
        tr.querySelector(`[data-del="${ev.id}"]`).addEventListener("click", async ()=>{
          await deleteEvent(ev.id);
          notify("warn","Удалено","Событие удалено");
          setTab("events");
        });
      }
      return;
    }

    if (tab === "members"){
      const members = await listMembers();
      pane.innerHTML = `
        <div class="card soft">
          <div class="section-title">Members (${members.length})</div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Игрок</th><th>UID</th><th>Действия</th></tr></thead>
            <tbody id="mb"></tbody>
          </table>
        </div>
      `;
      const mb = pane.querySelector("#mb");
      mb.innerHTML = members.length ? "" : `<tr><td colspan="3" class="muted">Нет</td></tr>`;
      for (const m of members){
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="font-weight:1000;">${escapeHtml(m.displayName || "Игрок")}</td>
          <td class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid)}</td>
          <td><button class="btn danger small" data-rm="${escapeAttr(m.uid)}" style="width:auto;">Удалить</button></td>
        `;
        mb.appendChild(tr);
        tr.querySelector(`[data-rm="${m.uid}"]`).addEventListener("click", async ()=>{
          await removeMember(m.uid);
          notify("warn","Готово","Удалён из members");
          setTab("members");
        });
      }
      return;
    }
  };

  seg.addEventListener("click", (e)=>{
    const b = e.target.closest("button[data-tab]");
    if (!b) return;
    setTab(b.dataset.tab);
  });

  await setTab("users");
  return root;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
