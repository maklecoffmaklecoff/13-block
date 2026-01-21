// js/pages/events.js
import {
  createEvent, listEvents, deleteEvent, getEvent, updateEvent,
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
  root.className = "grid";
  root.style.gap = "14px";

  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">События</div>
        <div class="card-sub">Описание</div>
      </div>
      ${ctx.isAdmin ? `<button class="btn primary" id="btnNew" style="width:auto;">Создать событие</button>` : ``}
    </div>
  `;
  root.appendChild(header);

  if (ctx.isAdmin){
    header.querySelector("#btnNew").addEventListener("click", ()=> openCreateEventModal());
  }

  const events = await listEvents();
  const listWrap = document.createElement("div");
  listWrap.className = "grid";
  listWrap.style.gap = "14px";
  root.appendChild(listWrap);

  if (!events.length){
    listWrap.innerHTML = `<div class="card"><div class="muted">Событий пока нет.</div></div>`;
    return root;
  }

  const unsubs = [];
  const startHash = location.hash;
  const pollLeave = setInterval(()=>{
    if (location.hash !== startHash){
      for (const u of unsubs) try{ u(); }catch(_){}
      clearInterval(pollLeave);
    }
  }, 400);

  for (const ev of events){
    const myApp = ctx.authed ? await getMyEventApplication(ev.id, ctx.uid) : null;

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="row">
        <div style="min-width:240px;">
          <div style="font-weight:1000; font-size:16px;">${escapeHtml(ev.title || "")}</div>

          <div class="muted" id="desc-${escapeAttr(ev.id)}" style="margin-top:6px; white-space:pre-wrap;">
            ${escapeHtml(ev.desc || "")}
          </div>

          <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
            <span class="badge" id="pcount-${escapeAttr(ev.id)}">Участники: …</span>
            <span class="badge">Мест: ${Number(ev.capacity ?? 0)}</span>
            <span class="badge ${ev.autoApprove ? "ok" : ""}">Авто: ${ev.autoApprove ? "ON" : "OFF"}</span>
            ${myApp ? `<span class="badge ${myApp.status === "approved" ? "ok" : myApp.status === "rejected" ? "bad" : "warn"}">Моя заявка: ${escapeHtml(myApp.status)}</span>` : ``}
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn small" data-toggle="${ev.id}">Описание</button>
          <button class="btn small" data-req="${ev.id}">Требования</button>
          <button class="btn small" data-part="${ev.id}">Участники</button>

          <div id="me-${escapeAttr(ev.id)}" style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;"></div>

          ${ctx.isAdmin ? `<button class="btn small" data-admin="${ev.id}">Заявки</button>` : ``}
          ${ctx.isAdmin ? `<button class="btn small" data-edit="${ev.id}">Редактировать</button>` : ``}
          ${ctx.isAdmin ? `<button class="btn danger small" data-del="${ev.id}">Удалить</button>` : ``}
        </div>
      </div>
    `;
    listWrap.appendChild(card);

    // Accordion: on mobile start collapsed
    const descEl = card.querySelector(`#desc-${CSS.escape(ev.id)}`);
    let collapsed = window.matchMedia("(max-width: 640px)").matches;
    const applyDescState = ()=>{
      if (!collapsed){
        descEl.style.display = "";
      } else {
        descEl.style.display = "none";
      }
    };
    applyDescState();

    card.querySelector(`[data-toggle="${ev.id}"]`).addEventListener("click", ()=>{
      collapsed = !collapsed;
      applyDescState();
    });

    // participants live + show "leave" button if in participants
    const badge = card.querySelector(`#pcount-${CSS.escape(ev.id)}`);
    const meWrap = card.querySelector(`#me-${CSS.escape(ev.id)}`);

    const unsub = listenEventParticipants(ev.id, (parts)=>{
      const count = parts.length;
      badge.textContent = `Участники: ${count} / ${Number(ev.capacity ?? 0)}`;
      badge.classList.toggle("ok", count > 0);

      // if current user is participant -> show leave
      meWrap.innerHTML = "";
      const meIsIn = ctx.authed && parts.some(p => p.uid === ctx.uid);

      if (ctx.authed && meIsIn){
        const btnLeave = document.createElement("button");
        btnLeave.className = "btn danger small";
        btnLeave.textContent = "Выйти";
        btnLeave.addEventListener("click", async ()=>{
          try{
            await removeParticipant(ev.id, ctx.uid);
            notify("warn", "Готово", "Вы вышли из события");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
        meWrap.appendChild(btnLeave);
        return;
      }

      // else show apply/delete application buttons by application status
      if (ctx.authed && !myApp){
        const btnApply = document.createElement("button");
        btnApply.className = "btn primary small";
        btnApply.textContent = "Подать заявку";
        btnApply.addEventListener("click", async ()=>{
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
            notify("ok", "Отправлено", "Заявка отправлена");
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
        meWrap.appendChild(btnApply);
      }

      if (ctx.authed && myApp){
        const btnDel = document.createElement("button");
        btnDel.className = "btn danger small";
        btnDel.textContent = "Удалить мою заявку";
        btnDel.addEventListener("click", async ()=>{
          try{
            await deleteEventApplication(ev.id, ctx.uid);
            notify("warn", "Удалено", "Ваша заявка удалена");
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
        meWrap.appendChild(btnDel);
      }
    });
    unsubs.push(unsub);

    card.querySelector(`[data-req="${ev.id}"]`).addEventListener("click", ()=>{
      const node = document.createElement("div");
      node.appendChild(renderStatsKV(ev.requirements || {}));
      openModal("Требования события", node);
    });

    card.querySelector(`[data-part="${ev.id}"]`).addEventListener("click", ()=>{
      const node = document.createElement("div");
      node.innerHTML = `
        <div class="muted">Список участников</div>
        <div class="hr"></div>
        <table class="table">
          <thead><tr><th>Игрок</th><th>Действия</th></tr></thead>
          <tbody id="pb"></tbody>
        </table>
      `;
      const close = openModal(`Участники: ${ev.title}`, node);
      const tbody = node.querySelector("#pb");

      const unsubLocal = listenEventParticipants(ev.id, (parts)=>{
        tbody.innerHTML = parts.length ? "" : `<tr><td colspan="2" class="muted">Участников пока нет</td></tr>`;
        for (const p of parts){
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><button class="btn small" data-open="${escapeAttr(p.uid)}">${escapeHtml(p.displayName || p.uid)}</button></td>
            <td>${ctx.isAdmin ? `<button class="btn danger small" data-kick="${escapeAttr(p.uid)}">Убрать</button>` : ``}</td>
          `;
          tbody.appendChild(tr);

          tr.querySelector(`[data-open="${p.uid}"]`).addEventListener("click", ()=> go("user", { uid: p.uid }));

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

      // intercept modal close by polling
      const modalHost = document.getElementById("modalHost");
      const pollModal = setInterval(()=>{
        if (modalHost.classList.contains("hidden")){
          unsubLocal();
          clearInterval(pollModal);
        }
      }, 250);

      close();
    });

    // admin apps / edit / delete
    if (ctx.isAdmin){
      card.querySelector(`[data-admin="${ev.id}"]`)?.addEventListener("click", ()=> openAdminAppsModal(ev));
      card.querySelector(`[data-edit="${ev.id}"]`)?.addEventListener("click", async ()=>{
        const fresh = await getEvent(ev.id);
        if (!fresh) return notify("bad", "Ошибка", "Событие не найдено");
        openEditEventModal(fresh);
      });
      card.querySelector(`[data-del="${ev.id}"]`)?.addEventListener("click", ()=> openDeleteEventConfirm(ev.id, ev.title));
    }
  }

  return root;

  function openCreateEventModal(){
    const form = buildEventForm({
      title: "",
      desc: "",
      capacity: 10,
      autoApprove: false,
      requirements: { hp:0, energy:0, respect:0, evasion:0, armor:0, resistance:0, bloodRes:0, poisonRes:0 }
    }, "create");

    const close = openModal("Создание события", form);
    form.querySelector("#save").addEventListener("click", async ()=>{
      try{
        const data = readEventForm(form);
        await createEvent(data);
        notify("ok", "Создано", "Событие добавлено");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openEditEventModal(evFull){
    const form = buildEventForm(evFull, "edit");
    const close = openModal("Редактирование события", form);

    form.querySelector("#save").addEventListener("click", async ()=>{
      try{
        const data = readEventForm(form);
        await updateEvent(evFull.id, data);
        notify("ok", "Сохранено", "Событие обновлено");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openDeleteEventConfirm(eventId, title){
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="muted">Удалить событие “${escapeHtml(title || "")}”?</div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn" id="cancel" style="width:auto;">Отмена</button>
        <button class="btn danger" id="yes" style="width:auto;">Удалить</button>
      </div>
    `;
    const close = openModal("Подтверждение", node);
    node.querySelector("#cancel").addEventListener("click", close);
    node.querySelector("#yes").addEventListener("click", async ()=>{
      try{
        await deleteEvent(eventId);
        notify("warn", "Удалено", "Событие удалено");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openAdminAppsModal(ev){
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="muted">Тут будет информация ну или описание пока не придумал</div>
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
              <button class="btn danger small" data-delapp="${escapeAttr(a.uid)}">Удалить</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);

        tr.querySelector(`[data-open="${a.uid}"]`).addEventListener("click", ()=> go("user", { uid: a.uid }));

        tr.querySelector(`[data-ap="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setEventApplicationStatus(ev.id, a.uid, "approved");
            await addParticipant(ev.id, a);
            notify("ok", "Готово", "Принят");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-rj="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await setEventApplicationStatus(ev.id, a.uid, "rejected");
            notify("warn", "Готово", "Отклонён");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-delapp="${a.uid}"]`).addEventListener("click", async ()=>{
          try{
            await deleteEventApplication(ev.id, a.uid);
            notify("warn", "Удалено", "Заявка удалена");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
      }
    });

    const modalHost = document.getElementById("modalHost");
    const pollModal = setInterval(()=>{
      if (modalHost.classList.contains("hidden")){
        unsub();
        clearInterval(pollModal);
      }
    }, 250);
  }
}

function buildEventForm(ev, mode){
  const req = ev.requirements || {};
  const reqStr = [
    req.hp ?? 0, req.energy ?? 0, req.respect ?? 0, req.evasion ?? 0,
    req.armor ?? 0, req.resistance ?? 0, req.bloodRes ?? 0, req.poisonRes ?? 0
  ].join(",");

  const form = document.createElement("div");
  form.innerHTML = `
    <div class="label">Название</div>
    <input class="input" id="t" value="${escapeAttr(ev.title || "")}" />

    <div class="label">Описание</div>
    <textarea class="textarea" id="d">${escapeHtml(ev.desc || "")}</textarea>

    <div class="hr"></div>

    <div class="row">
      <div style="flex:1;">
        <div class="label">Лимит мест</div>
        <input class="input" id="cap" inputmode="numeric" value="${escapeAttr(String(ev.capacity ?? 10))}" />
      </div>
      <div style="flex:1;">
        <div class="label">Автопринятие</div>
        <select class="input" id="aa">
          <option value="false" ${ev.autoApprove ? "" : "selected"}>Нет</option>
          <option value="true" ${ev.autoApprove ? "selected" : ""}>Да</option>
        </select>
      </div>
    </div>

    <div class="hr"></div>

    <div class="section-title">Требования (8 чисел)</div>
    <div class="label">hp,energy,respect,evasion,armor,resistance,bloodRes,poisonRes</div>
    <input class="input" id="req" value="${escapeAttr(reqStr)}" />

    <div class="hr"></div>

    <div class="row">
      <button class="btn primary" id="save" style="width:auto;">${mode === "edit" ? "Сохранить" : "Создать"}</button>
    </div>
  `;
  return form;
}

function readEventForm(form){
  const title = form.querySelector("#t").value.trim();
  if (!title) throw new Error("Укажите название");

  const desc = form.querySelector("#d").value.trim();

  const cap = Number.parseInt(form.querySelector("#cap").value, 10);
  if (!Number.isFinite(cap) || cap < 1 || cap > 500) throw new Error("Лимит мест: 1..500");

  const autoApprove = form.querySelector("#aa").value === "true";

  const parts = form.querySelector("#req").value.split(",").map(x=>x.trim());
  if (parts.length !== 8) throw new Error("Требования должны быть 8 чисел через запятую");

  const reqDraft = {
    hp: parts[0], energy: parts[1], respect: parts[2], evasion: parts[3],
    armor: parts[4], resistance: parts[5], bloodRes: parts[6], poisonRes: parts[7]
  };
  const v = validateStats(reqDraft);
  if (!v.ok) throw new Error(v.error);

  return { title, desc, capacity: cap, autoApprove, requirements: v.value };
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
