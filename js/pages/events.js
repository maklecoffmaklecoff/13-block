// js/pages/events.js
import {
  createEvent, listEvents,
  submitEventApplication, deleteEventApplication, getMyEventApplication,
  setEventApplicationStatus, listenEventApplications,
  listenEventParticipants, addParticipant, removeParticipant
} from "../db.js";
import { notify } from "../notify.js";
import { openModal, renderStatsKV } from "../ui.js";
import { validateStats } from "../validators.js";
import { go } from "../router.js";

export async function renderEvents(ctx){
  const root = document.createElement("div");
  root.className = "grid two";

  const eventsCard = document.createElement("div");
  eventsCard.className = "card";
  eventsCard.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">События</div>
        <div class="card-sub">Для всех авторизованных</div>
      </div>
      ${ctx.isAdmin ? `<button class="btn primary" id="btnNew">Создать событие</button>` : ``}
    </div>
    <div class="hr"></div>
    <div id="eventsList" class="grid"></div>
  `;

  if (ctx.isAdmin){
    eventsCard.querySelector("#btnNew").addEventListener("click", ()=>{
      const form = document.createElement("div");
      form.innerHTML = `
        <div class="label">Название события</div>
        <input class="input" id="t" placeholder="Например: Рейд / Турнир" />
        <div class="label">Описание</div>
        <textarea class="textarea" id="d" placeholder="Что делаем, когда, условия..."></textarea>

        <div class="hr"></div>
        <div class="row">
          <div style="flex:1;">
            <div class="label">Лимит мест (capacity)</div>
            <input class="input" id="cap" inputmode="numeric" value="10" />
          </div>
          <div style="flex:1;">
            <div class="label">Автопринятие до лимита</div>
            <select class="input" id="aa">
              <option value="false" selected>Нет</option>
              <option value="true">Да</option>
            </select>
          </div>
        </div>

        <div class="hr"></div>
        <div class="card-title" style="font-size:16px;">Требования (минимум)</div>
        <div class="muted" style="margin-bottom:10px;">Формат: 8 чисел через запятую</div>

        <div class="label">hp,energy,respect,evasion,armor,resistance,bloodRes,poisonRes</div>
        <input class="input" id="req" value="0,0,0,0,0,0,0,0" />

        <div class="hr"></div>
        <button class="btn primary" id="create">Создать</button>
      `;

      const close = openModal("Создание события", form);
      form.querySelector("#create").addEventListener("click", async ()=>{
        try{
          const title = form.querySelector("#t").value.trim();
          const desc = form.querySelector("#d").value.trim();
          if (!title) throw new Error("Укажи название события");

          const cap = Number.parseInt(form.querySelector("#cap").value, 10);
          if (!Number.isFinite(cap) || cap < 1 || cap > 500) throw new Error("capacity: 1..500");
          const autoApprove = form.querySelector("#aa").value === "true";

          const parts = form.querySelector("#req").value.split(",").map(x=>x.trim());
          if (parts.length !== 8) throw new Error("Требования должны быть 8 чисел через запятую");

          const reqDraft = {
            hp: parts[0], energy: parts[1], respect: parts[2], evasion: parts[3],
            armor: parts[4], resistance: parts[5], bloodRes: parts[6], poisonRes: parts[7]
          };
          const v = validateStats(reqDraft);
          if (!v.ok) throw new Error(v.error);

          await createEvent({ title, desc, requirements: v.value, capacity: cap, autoApprove });
          notify("ok", "Создано", "Событие добавлено");
          close();
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    });
  }

  const listWrap = eventsCard.querySelector("#eventsList");
  const events = await listEvents();
  if (!events.length){
    listWrap.innerHTML = `<div class="muted">Событий пока нет.</div>`;
  } else {
    for (const ev of events){
      const myApp = ctx.authed ? await getMyEventApplication(ev.id, ctx.uid) : null;

      const item = document.createElement("div");
      item.className = "card";
      item.style.background = "rgba(255,255,255,0.04)";
      item.innerHTML = `
        <div class="row">
          <div>
            <div style="font-weight:1000; font-size:16px;">${escapeHtml(ev.title || "")}</div>
            <div class="muted" style="white-space:pre-wrap; margin-top:6px;">${escapeHtml(ev.desc || "")}</div>
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
              <span class="badge">Мест: ${Number(ev.capacity ?? 0)}</span>
              <span class="badge ${ev.autoApprove ? "ok" : ""}">Авто: ${ev.autoApprove ? "ON" : "OFF"}</span>
              ${myApp ? `<span class="badge ${myApp.status === "approved" ? "ok" : myApp.status === "rejected" ? "bad" : "warn"}">Моя заявка: ${escapeHtml(myApp.status)}</span>` : ``}
            </div>
          </div>
          <div>
            <button class="btn small" data-view="${ev.id}">Требования</button>
            <button class="btn small" data-part="${ev.id}">Участники</button>
            ${ctx.authed && !myApp ? `<button class="btn primary small" data-apply="${ev.id}">Подать заявку</button>` : ``}
            ${ctx.authed && myApp ? `<button class="btn danger small" data-delmine="${ev.id}">Удалить мою заявку</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn small" data-admin="${ev.id}">Заявки</button>` : ``}
          </div>
        </div>
      `;
      listWrap.appendChild(item);

      item.querySelector(`[data-view="${ev.id}"]`).addEventListener("click", ()=>{
        const node = document.createElement("div");
        node.appendChild(renderStatsKV(ev.requirements || {}));
        openModal("Требования события", node);
      });

      item.querySelector(`[data-part="${ev.id}"]`).addEventListener("click", ()=>{
        const node = document.createElement("div");
        node.innerHTML = `
          <div class="muted">Список участников </div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Игрок</th><th>Действия</th></tr></thead>
            <tbody id="pb"></tbody>
          </table>
        `;
        openModal(`Участники: ${ev.title}`, node);
        const tbody = node.querySelector("#pb");

        const unsub = listenEventParticipants(ev.id, (parts)=>{
          tbody.innerHTML = parts.length ? "" : `<tr><td colspan="2" class="muted">Участников пока нет</td></tr>`;
          for (const p of parts){
            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td>
                <button class="btn small" data-open="${escapeAttr(p.uid)}">${escapeHtml(p.displayName || p.uid)}</button>
              </td>
              <td>
                ${ctx.isAdmin ? `<button class="btn danger small" data-kick="${escapeAttr(p.uid)}">Убрать</button>` : ``}
              </td>
            `;
            tbody.appendChild(tr);

            tr.querySelector(`[data-open="${p.uid}"]`).addEventListener("click", ()=>{
              go("user", { uid: p.uid });
            });

            const kick = tr.querySelector(`[data-kick="${p.uid}"]`);
            if (kick){
              kick.addEventListener("click", async ()=>{
                try{
                  await removeParticipant(ev.id, p.uid);
                  notify("warn", "Готово", "Участник убран");
                }catch(e){
                  notify("bad", "Ошибка", e.message);
                }
              });
            }
          }
        });

        const host = document.getElementById("modalHost");
        const poll = setInterval(()=>{
          if (host.classList.contains("hidden")){
            unsub();
            clearInterval(poll);
          }
        }, 250);
      });

      const applyBtn = item.querySelector(`[data-apply="${ev.id}"]`);
      if (applyBtn){
        applyBtn.addEventListener("click", async ()=>{
          try{
            const myStats = ctx.userDoc?.stats || {};
            const req = ev.requirements || {};
            for (const k of Object.keys(req)){
              if (Number(myStats[k] ?? 0) < Number(req[k] ?? 0)){
                throw new Error("Ваши статы не проходят требования события");
              }
            }
            await submitEventApplication(ev.id, ctx.uid, {
              displayName: ctx.userDoc?.displayName || "Игрок",
              photoURL: ctx.userDoc?.photoURL || "",
              stats: myStats
            });
            notify("ok", "Отправлено", ev.autoApprove ? "Заявка отправлена (возможно автопринята)" : "Заявка отправлена");
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
      }

      const delMine = item.querySelector(`[data-delmine="${ev.id}"]`);
      if (delMine){
        delMine.addEventListener("click", async ()=>{
          try{
            await deleteEventApplication(ev.id, ctx.uid);
            notify("warn", "Удалено", "Ваша заявка на событие удалена");
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
      }

      const adminBtn = item.querySelector(`[data-admin="${ev.id}"]`);
      if (adminBtn){
        adminBtn.addEventListener("click", ()=>{
          const node = document.createElement("div");
          node.innerHTML = `
            <div class="muted">Управление.</div>
            <div class="hr"></div>
            <table class="table">
              <thead><tr><th>Игрок</th><th>Статус</th><th>Действия</th></tr></thead>
              <tbody id="ab"></tbody>
            </table>
          `;
          openModal(`Админ: заявки на "${ev.title}"`, node);

          const tbody = node.querySelector("#ab");
          const unsub = listenEventApplications(ev.id, (apps)=>{
            tbody.innerHTML = apps.length ? "" : `<tr><td colspan="3" class="muted">Заявок нет</td></tr>`;
            for (const a of apps){
              const cls = a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn";
              const tr = document.createElement("tr");
              tr.innerHTML = `
                <td>
                  <button class="btn small" data-open="${escapeAttr(a.uid)}">${escapeHtml(a.displayName || a.uid)}</button>
                  <div class="muted" style="font-size:12px; font-family:var(--mono);">${escapeHtml(a.uid)}</div>
                </td>
                <td><span class="badge ${cls}">${escapeHtml(a.status)}</span></td>
                <td>
                  <div class="row">
                    <button class="btn ok small" data-ap="${escapeAttr(a.uid)}">Принять</button>
                    <button class="btn danger small" data-rj="${escapeAttr(a.uid)}">Отклонить</button>
                    <button class="btn danger small" data-del="${escapeAttr(a.uid)}">Удалить</button>
                  </div>
                </td>
              `;
              tbody.appendChild(tr);

              tr.querySelector(`[data-open="${a.uid}"]`).addEventListener("click", ()=> go("user", { uid: a.uid }));

              tr.querySelector(`[data-ap="${a.uid}"]`).addEventListener("click", async ()=>{
                try{
                  await setEventApplicationStatus(ev.id, a.uid, "approved");
                  await addParticipant(ev.id, a);
                  notify("ok", "Готово", "Заявка принята, добавлен в участники");
                }catch(e){
                  notify("bad", "Ошибка", e.message);
                }
              });

              tr.querySelector(`[data-rj="${a.uid}"]`).addEventListener("click", async ()=>{
                try{
                  await setEventApplicationStatus(ev.id, a.uid, "rejected");
                  notify("warn", "Готово", "Заявка отклонена");
                }catch(e){
                  notify("bad", "Ошибка", e.message);
                }
              });

              tr.querySelector(`[data-del="${a.uid}"]`).addEventListener("click", async ()=>{
                try{
                  await deleteEventApplication(ev.id, a.uid);
                  notify("warn", "Удалено", "Заявка удалена");
                }catch(e){
                  notify("bad", "Ошибка", e.message);
                }
              });
            }
          });

          const host = document.getElementById("modalHost");
          const poll = setInterval(()=>{
            if (host.classList.contains("hidden")){
              unsub();
              clearInterval(poll);
            }
          }, 250);
        });
      }
    }
  }

  const side = document.createElement("div");
  side.className = "card";
  side.innerHTML = `
    <div class="card-title">Пояснение</div>
    <div class="card-sub">Добавлю редактирование</div>
    <div class="muted" style="white-space:pre-wrap; line-height:1.55;">
- Можно удалить свою заявку и подать заново
    </div>
  `;

  root.append(eventsCard, side);
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
