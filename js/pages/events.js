// js/pages/events.js
import {
  createEvent,
  listEvents,
  deleteEvent,
  getEvent,
  updateEvent,
  submitEventApplication,
  deleteEventApplication,
  getMyEventApplication,
  setEventApplicationStatus,
  listenEventApplications,
  listenEventParticipants,
  addParticipant,
  removeParticipant,
  getMyProfile,
  joinEventAuto,
  getMyWaitlist,
  joinWaitlist,
  leaveWaitlist,
  listenWaitlist,
  archiveEvent,
  isMember,
} from "../db.js";

import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { notify } from "../notify.js";
import { openModal, renderStatsKV } from "../ui.js";
import { validateStats } from "../validators.js";
import { go } from "../router.js";
import { rememberMyEvent, forgetMyEvent } from "../services/myEventsIds.js";

export async function renderEvents(ctx) {
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  // ===== Membership gate (UI + logic) =====
  if (!ctx.authed) {
    const c = document.createElement("div");
    c.className = "card";
    c.innerHTML = `<div class="card-title">События</div><div class="muted">Нужно войти.</div>`;
    return c;
  }

  const member = await isMember(ctx.uid);
  if (!member && !ctx.isAdmin) {
    const c = document.createElement("div");
    c.className = "card";
    c.innerHTML = `
      <div class="card-title">События</div>
      <div class="muted">Вкладка доступна только участникам клана.</div>
      <div class="hr"></div>
      <button class="btn primary" id="toRoster" style="width:auto;">Перейти к заявке в клан</button>
    `;
    c.querySelector("#toRoster").addEventListener("click", () => go("roster"));
    return c;
  }

  // ===== Header + filters =====
  const header = document.createElement("div");
  header.className = "card";
  header.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">События</div>
        <div class="card-sub">Для участников клана • фильтры • очередь • архив</div>
      </div>
      ${ctx.isAdmin ? `<button class="btn primary" id="btnNew" style="width:auto;">Создать</button>` : ``}
    </div>

    <div class="hr"></div>

    <div class="row" style="align-items:flex-end;">
      <div style="flex:1; min-width:220px;">
        <div class="label">Поиск</div>
        <input class="input" id="q" placeholder="Название или описание..." />
      </div>

      <div style="min-width:180px;">
        <div class="label">Период</div>
        <select class="input" id="tab">
          <option value="all">Все</option>
          <option value="soon">Скоро</option>
          <option value="past">Прошедшие</option>
        </select>
      </div>

      <div class="seg" style="align-items:center;">
        <button data-f="mine">Только мои</button>
        <button data-f="free">Только с местами</button>
        <button data-f="auto">Только авто</button>
        <button data-f="noarch">Без архива</button>
      </div>
    </div>
  `;
  root.appendChild(header);

  if (ctx.isAdmin) {
    header.querySelector("#btnNew").addEventListener("click", () => openCreateEventModal());
  }

  const seg = header.querySelector(".seg");
  const segState = { mine: false, free: false, auto: false, noarch: true };
  seg.querySelector('[data-f="noarch"]').classList.add("active");

  const toggleSeg = (k) => {
    segState[k] = !segState[k];
    seg.querySelectorAll("button[data-f]").forEach((b) => {
      const key = b.dataset.f;
      b.classList.toggle("active", !!segState[key]);
    });
    renderList();
  };

  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    toggleSeg(b.dataset.f);
  });

  const qEl = header.querySelector("#q");
  const tabEl = header.querySelector("#tab");
  qEl.addEventListener("input", () => {
    clearTimeout(qEl._t);
    qEl._t = setTimeout(renderList, 150);
  });
  tabEl.addEventListener("change", renderList);

  // ===== List =====
  const listWrap = document.createElement("div");
  listWrap.className = "grid";
  listWrap.style.gap = "14px";
  root.appendChild(listWrap);

  let events = await listEvents();
  events = (events || []).slice();

  events.sort((a, b) => {
    const an = toMillis(a.startAt);
    const bn = toMillis(b.startAt);
    const as = statusByTime(a);
    const bs = statusByTime(b);
    const pr = (s) => (s === "running" ? 0 : s === "soon" ? 1 : s === "past" ? 2 : 3);
    const p = pr(as) - pr(bs);
    if (p !== 0) return p;
    if (an && bn) return an - bn;
    if (an && !bn) return -1;
    if (!an && bn) return 1;
    return toMillis(b.createdAt) - toMillis(a.createdAt);
  });

  // ===== One open kebab menu at a time (prevents flicker) =====
  let openMenuId = null;
  function closeAnyMenu() {
    if (!openMenuId) return;
    const el = document.getElementById(`menu-${openMenuId}`);
    if (el) el.classList.remove("open");
    openMenuId = null;
  }
  document.addEventListener("click", (e) => {
    if (!openMenuId) return;
    const insideMenu = e.target.closest(`#menu-${CSS.escape(openMenuId)}`);
    const insideBtn = e.target.closest(`[data-menu-btn="${CSS.escape(openMenuId)}"]`);
    if (!insideMenu && !insideBtn) closeAnyMenu();
  });

  function renderList() {
    const q = (qEl.value || "").toLowerCase().trim();
    const period = tabEl.value || "all";

    const filtered = events.filter((ev) => {
      if (segState.noarch && ev.archived) return false;
      if (segState.auto && !ev.autoApprove) return false;

      const st = statusByTime(ev);
      if (period === "soon" && st !== "soon" && st !== "running") return false;
      if (period === "past" && st !== "past") return false;

      if (q) {
        const t = `${ev.title || ""}\n${ev.desc || ""}`.toLowerCase();
        if (!t.includes(q)) return false;
      }

      return true;
    });

    listWrap.innerHTML = filtered.length ? "" : `<div class="card"><div class="muted">Ничего не найдено.</div></div>`;

    for (const ev of filtered) {
      const card = buildEventCard(ev);
      listWrap.appendChild(card);
    }
  }

  renderList();
  return root;

  // ============ Card builder ============
  function buildEventCard(ev) {
    const card = document.createElement("div");
    card.className = "card event-card";

    const cap = Number(ev.capacity ?? 0);
    const count = Number(ev.participantsCount ?? 0);
    const left = Math.max(0, cap - count);

    const timeStatus = statusByTime(ev);
    const timeBadgeCls = timeStatus === "running" ? "ok" : timeStatus === "soon" ? "warn" : timeStatus === "past" ? "" : "";
    const timeBadgeText =
      timeStatus === "running" ? "Идёт" : timeStatus === "soon" ? "Скоро" : timeStatus === "past" ? "Завершено" : "Без даты";

    const whenText = fmtWhen(ev);
    const closed = !!ev.isClosed;

    card.innerHTML = `
      <div class="event-head">
       <div class="event-left">
			<div class="event-title">${escapeHtml(ev.title || "")}</div>

				<div class="event-desc-wrap">
					<div class="event-desc clamp2" id="desc-${escapeAttr(ev.id)}">
							${escapeHtml(ev.desc || "")}
					</div>
				</div>

  <div class="event-foot">
    <div class="event-meta">
      <span class="badge ${timeBadgeCls}">${escapeHtml(timeBadgeText)}</span>
      <span class="badge">${escapeHtml(whenText)}</span>
      <span class="badge ${ev.autoApprove ? "ok" : ""}">Авто: ${ev.autoApprove ? "ON" : "OFF"}</span>
      ${closed ? `<span class="badge bad">Набор закрыт</span>` : ``}
      ${ev.archived ? `<span class="badge">Архив</span>` : ``}
    </div>

    <div class="pwrap">
      <div class="pline"><div class="pfill" id="pfill-${escapeAttr(ev.id)}"></div></div>
      <div class="pmeta">
        <span>Участники: <b>${count}</b> / <b>${cap}</b></span>
        <span>Осталось: <b>${left}</b></span>
      </div>
    </div>
  </div>
</div>


        <div class="event-side" style="position:relative;">
          <div class="event-actions" id="me-${escapeAttr(ev.id)}"></div>

          <button class="kebab" type="button" aria-label="Меню" data-menu-btn="${escapeAttr(ev.id)}">...</button>

          <div class="menu-pop" id="menu-${escapeAttr(ev.id)}">
            <button class="btn ghost" type="button" data-toggle="${escapeAttr(ev.id)}">Описание</button>
            <button class="btn ghost" type="button" data-part="${escapeAttr(ev.id)}">Участники</button>
            ${
			ev.link ? `<a class="btn ghost small linksmall" href="${escapeAttr(ev.link)}" target="_blank" rel="noopener">Ссылка</a>` : ``

            }

            ${ctx.isAdmin ? `<div class="hr"></div><div class="admin-title">Админ</div>` : ``}
            ${ctx.isAdmin ? `<button class="btn" type="button" data-admin="${escapeAttr(ev.id)}">Заявки</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn" type="button" data-edit="${escapeAttr(ev.id)}">Редактировать</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn danger" type="button" data-del="${escapeAttr(ev.id)}">Удалить</button>` : ``}
          </div>

          <div class="req-mini">
            <div class="t">
              <span>Требования</span>
              <button class="btn ghost small" type="button" data-req-more="${escapeAttr(ev.id)}" style="width:auto;">Подробнее</button>
            </div>
            <div class="grid" id="req-grid-${escapeAttr(ev.id)}"></div>
          </div>
        </div>
      </div>
    `;

    // kebab menu (no per-card document listeners)
    const menuBtn = card.querySelector(`[data-menu-btn="${CSS.escape(ev.id)}"]`);
    const menu = card.querySelector(`#menu-${CSS.escape(ev.id)}`);
    if (menuBtn && menu) {
      menuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const willOpen = !menu.classList.contains("open");
        closeAnyMenu();
        if (willOpen) {
          menu.classList.add("open");
          openMenuId = ev.id;
        }
      });
      menu.addEventListener("click", (e) => {
        const a = e.target.closest("button, a");
        if (a) closeAnyMenu();
      });
    }

    // progress fill
    const pfill = card.querySelector(`#pfill-${CSS.escape(ev.id)}`);
    if (pfill) {
      const pct = cap > 0 ? Math.max(0, Math.min(100, Math.round((count / cap) * 100))) : 0;
      pfill.style.width = `${pct}%`;
      if (left === 0) pfill.style.filter = "grayscale(0.2) brightness(0.9)";
    }

    // mini requirements (right)
    const reqGrid = card.querySelector(`#req-grid-${CSS.escape(ev.id)}`);
    if (reqGrid) {
      const req = ev.requirements || {};
      const keys = ["hp", "energy", "respect", "evasion", "armor", "resistance", "bloodRes", "poisonRes"];
      const labels = {
        hp: "ХП❤️",
        energy: "Энергия⚡️",
        respect: "Уважение👥",
        evasion: "Уклон.🏃",
        armor: "Броня🛡️",
        resistance: "Сопр.🚧",
        bloodRes: "Сопр.Крови🩸",
        poisonRes: "Сопр.Яду☠️",
      };

      reqGrid.innerHTML = "";
      for (const k of keys) {
        const need = Number(req[k] ?? 0);
        const chip = document.createElement("div");
        chip.className = "chip";
        chip.innerHTML = `<span>${labels[k]}</span><b>${need}</b>`;
        reqGrid.appendChild(chip);
      }
    }

    card.querySelector(`[data-req-more="${CSS.escape(ev.id)}"]`)?.addEventListener("click", () => {
      const node = document.createElement("div");
      node.appendChild(renderStatsKV(ev.requirements || {}));
      openModal("Требования события", node);
    });

    // description toggle
    const descEl = card.querySelector(`#desc-${CSS.escape(ev.id)}`);
    let expanded = !window.matchMedia("(max-width: 640px)").matches;
    const applyDescState = () => descEl.classList.toggle("clamp2", !expanded);
    applyDescState();

    card.querySelector(`[data-toggle="${CSS.escape(ev.id)}"]`).addEventListener("click", () => {
      expanded = !expanded;
      applyDescState();
    });

    // participants modal (listener only inside modal)
    card.querySelector(`[data-part="${CSS.escape(ev.id)}"]`).addEventListener("click", () => {
      const node = document.createElement("div");
      node.innerHTML = `
        <div class="row">
          <div class="muted">Список участников</div>
          <button class="btn" id="copy" style="width:auto;">Скопировать</button>
        </div>
        <div class="hr"></div>
        <table class="table">
          <thead><tr><th>Игрок</th><th>Действия</th></tr></thead>
          <tbody id="pb"></tbody>
        </table>
      `;
      openModal(`Участники: ${escapeHtml(ev.title)}`, node);

      const tbody = node.querySelector("#pb");
      let latest = [];

	node.style.width = "min(1200px, calc(100vw - 24px))";
	node.style.maxWidth = "1200px";
	node.style.padding = "2px 0";

      const unsub = listenEventParticipants(ev.id, (parts) => {
        latest = parts || [];
        tbody.innerHTML = latest.length ? "" : `<tr><td colspan="2" class="muted">Участников пока нет</td></tr>`;

        for (const p of latest) {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td><button class="btn small" data-open="${escapeAttr(p.uid)}" style="width:auto;">${escapeHtml(p.displayName || p.uid)}</button></td>
            <td>${ctx.isAdmin ? `<button class="btn danger small" data-kick="${escapeAttr(p.uid)}" style="width:auto;">Убрать</button>` : ``}</td>
          `;
          tbody.appendChild(tr);

          tr.querySelector(`[data-open="${CSS.escape(p.uid)}"]`).addEventListener("click", () => go("user", { uid: p.uid }));

          const kick = tr.querySelector(`[data-kick="${CSS.escape(p.uid)}"]`);
          if (kick) {
            kick.addEventListener("click", async () => {
              try {
                if (!confirm("Убрать участника из события?")) return;
                await removeParticipant(ev.id, p.uid);
                await forgetMyEvent(ev.id, p.uid);
                notify("warn", "Готово", "Участник убран");
                ev.participantsCount = Math.max(0, Number(ev.participantsCount ?? 0) - 1);
                renderList();
              } catch (e) {
                notify("bad", "Ошибка", e.message);
              }
            });
          }
        }
      });

      node.querySelector("#copy").addEventListener("click", async () => {
        try {
          const names = latest.map((x) => x.displayName || x.uid).filter(Boolean);
          const text = names.join("\n");
          await navigator.clipboard.writeText(text);
          notify("ok", "Скопировано", `Участников: ${names.length}`);
        } catch (e) {
          notify("bad", "Ошибка", e.message);
        }
      });

      const modalHost = document.getElementById("modalHost");
      const poll = setInterval(() => {
        if (modalHost.classList.contains("hidden")) {
          try {
            unsub();
          } catch (_) {}
          clearInterval(poll);
        }
      }, 250);
    });

    // "Me" actions
    const meWrap = card.querySelector(`#me-${CSS.escape(ev.id)}`);
    let meProfile = null;

    const renderMe = async () => {
      meWrap.innerHTML = "";

      if (ev.archived) {
        const b = document.createElement("span");
        b.className = "muted";
        b.textContent = "Архив";
        meWrap.appendChild(b);
        return;
      }

      if (closed && !ctx.isAdmin) {
        const b = document.createElement("span");
        b.className = "muted";
        b.textContent = "Набор закрыт";
        meWrap.appendChild(b);
        return;
      }

      const [myApp, myWait] = await Promise.all([getMyEventApplication(ev.id, ctx.uid), getMyWaitlist(ev.id, ctx.uid)]);

      // requirement badge (clickable if missing)
      try {
        meProfile = meProfile || (await getMyProfile(ctx.uid));
        const { ok, missing } = checkRequirements(meProfile.stats || {}, ev.requirements || {});
        const reqBadge = document.createElement("span");
        reqBadge.className = `badge ${ok ? "ok" : "bad"}`;
        reqBadge.textContent =
          ok ? "Проходишь требования" : missing.length > 3 ? `Не хватает: ${missing.length} стат.` : `Не хватает: ${missing.join(", ")}`;

        if (!ok) {
          reqBadge.style.cursor = "pointer";
          reqBadge.title = "Нажми для подробностей";
          reqBadge.addEventListener("click", () => {
            const n = document.createElement("div");
            n.innerHTML = `
              <div class="muted">Не хватает:</div>
              <div class="hr"></div>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                ${missing.map((x) => `<span class="badge bad">${escapeHtml(x)}</span>`).join("")}
              </div>
            `;
            openModal("Требования", n);
          });
        }
        meWrap.appendChild(reqBadge);
      } catch (_) {}

      const cap2 = Number(ev.capacity ?? 0);
      const count2 = Number(ev.participantsCount ?? 0);
      const left2 = Math.max(0, cap2 - count2);
      const hasFree = left2 > 0;

      if (segState.free && !hasFree) {
        meWrap.innerHTML = "";
        return;
      }

      if (segState.mine) {
        const isMine = !!myApp || !!myWait;
        if (!isMine) {
          meWrap.innerHTML = "";
          return;
        }
      }

      if (!myApp && !myWait) {
        if (ev.autoApprove) {
          const btn = document.createElement("button");
          btn.className = "btn primary";
          btn.style.width = "auto";
          btn.textContent = hasFree ? "Записаться" : "Нет мест";
          btn.disabled = !hasFree;

          btn.addEventListener("click", async () => {
            try {
              const me = await getMyProfile(ctx.uid);
              const reqCheck = checkRequirements(me.stats || {}, ev.requirements || {});
              if (!reqCheck.ok) throw new Error("Ваши статы не проходят требования (проверьте профиль)");

              await joinEventAuto(ev.id, ctx.uid, {
                displayName: me.displayName || "Игрок",
                photoURL: me.photoURL || "",
                stats: me.stats || {},
              });

              await rememberMyEvent(ev.id, ctx.uid);
              notify("ok", "Готово", "Вы записались на событие");

              ev.participantsCount = Number(ev.participantsCount ?? 0) + 1;
              renderList();
              await renderMe();
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          });

          meWrap.appendChild(btn);

          if (!hasFree) {
            const w = document.createElement("button");
            w.className = "btn ghost small";
            w.style.width = "auto";
            w.textContent = "В очередь";
            w.addEventListener("click", async () => {
              try {
                const me = await getMyProfile(ctx.uid);
                await joinWaitlist(ev.id, ctx.uid, {
                  displayName: me.displayName || "Игрок",
                  photoURL: me.photoURL || "",
                  stats: me.stats || {},
                });
                notify("ok", "Готово", "Вы в очереди");
                await renderMe();
              } catch (e) {
                notify("bad", "Ошибка", e.message);
              }
            });
            meWrap.appendChild(w);
          }
        } else {
          const btn = document.createElement("button");
          btn.className = "btn primary";
          btn.style.width = "auto";
          btn.textContent = "Подать заявку";
          btn.addEventListener("click", async () => {
            try {
              const me = await getMyProfile(ctx.uid);
              const reqCheck = checkRequirements(me.stats || {}, ev.requirements || {});
              if (!reqCheck.ok) throw new Error("Ваши статы не проходят требования (проверьте профиль)");

              await submitEventApplication(ev.id, ctx.uid, {
                displayName: me.displayName || "Игрок",
                photoURL: me.photoURL || "",
                stats: me.stats || {},
              });

              notify("ok", "Отправлено", "Заявка отправлена");
              await renderMe();
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          });
          meWrap.appendChild(btn);
        }
        return;
      }

      if (myWait && !myApp) {
        const badge = document.createElement("span");
        badge.className = "badge warn";
        badge.textContent = "Очередь: ждёте";
        meWrap.appendChild(badge);

        const leave = document.createElement("button");
        leave.className = "btn danger small";
        leave.style.width = "auto";
        leave.textContent = "Выйти";
        leave.addEventListener("click", async () => {
          try {
            await leaveWaitlist(ev.id, ctx.uid);
            notify("warn", "Готово", "Вы вышли из очереди");
            await renderMe();
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });
        meWrap.appendChild(leave);
        return;
      }

      const stBadge = document.createElement("span");
      stBadge.className = `badge ${statusCls(myApp.status)}`;
      stBadge.textContent = `Моя заявка: ${prettyStatus(myApp.status)}`;
      meWrap.appendChild(stBadge);

      if (myApp?.status === "approved") {
        const btnLeave = document.createElement("button");
        btnLeave.className = "btn danger";
        btnLeave.style.width = "auto";
        btnLeave.textContent = "Выйти";
        btnLeave.addEventListener("click", async () => {
          try {
            if (!confirm("Выйти из события?")) return;

            await removeParticipant(ev.id, ctx.uid);
            await forgetMyEvent(ev.id, ctx.uid);
            try {
              await setEventApplicationStatus(ev.id, ctx.uid, "canceled");
            } catch (_) {}

            notify("warn", "Готово", "Вы вышли из события");
            ev.participantsCount = Math.max(0, Number(ev.participantsCount ?? 0) - 1);
            renderList();
            await renderMe();
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });
        meWrap.appendChild(btnLeave);
        return;
      }

      const btnDel = document.createElement("button");
      btnDel.className = "btn danger small";
      btnDel.style.width = "auto";
      btnDel.textContent = "Удалить заявку";
      btnDel.addEventListener("click", async () => {
        try {
          if (!confirm("Удалить вашу заявку?")) return;
          await deleteEventApplication(ev.id, ctx.uid);
          notify("warn", "Удалено", "Ваша заявка удалена");
          await renderMe();
        } catch (e) {
          notify("bad", "Ошибка", e.message);
        }
      });
      meWrap.appendChild(btnDel);
    };

    renderMe().catch(() => {});

    if (ctx.isAdmin) {
      card.querySelector(`[data-admin="${CSS.escape(ev.id)}"]`)?.addEventListener("click", () => openAdminAppsModal(ev));
      card.querySelector(`[data-edit="${CSS.escape(ev.id)}"]`)?.addEventListener("click", async () => {
        const fresh = await getEvent(ev.id);
        if (!fresh) return notify("bad", "Ошибка", "Событие не найдено");
        openEditEventModal(fresh);
      });
      card.querySelector(`[data-del="${CSS.escape(ev.id)}"]`)?.addEventListener("click", () => openDeleteEventConfirm(ev.id, ev.title));
    }

    return card;
  }

  // ============ Modals (admin) ============
  function openCreateEventModal() {
    const form = buildEventForm(
      {
        title: "",
        desc: "",
        startAt: null,
        endAt: null,
        link: "",
        capacity: 10,
        autoApprove: false,
        isClosed: false,
        archived: false,
        requirements: { hp: 0, energy: 0, respect: 0, evasion: 0, armor: 0, resistance: 0, bloodRes: 0, poisonRes: 0 },
      },
      "create"
    );

    const close = openModal("Создание события", form);
    form.querySelector("#save").addEventListener("click", async () => {
      try {
        const data = readEventForm(form);
        await createEvent(data);
        notify("ok", "Создано", "Событие добавлено");
        close();
        location.reload();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openEditEventModal(evFull) {
    const form = buildEventForm(evFull, "edit");
    const close = openModal("Редактирование события", form);

    form.querySelector("#save").addEventListener("click", async () => {
      try {
        const data = readEventForm(form);
        await updateEvent(evFull.id, data);
        notify("ok", "Сохранено", "Событие обновлено");
        close();
        location.reload();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openDeleteEventConfirm(eventId, title) {
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
    node.querySelector("#yes").addEventListener("click", async () => {
      try {
        await deleteEvent(eventId);
        notify("warn", "Удалено", "Событие удалено");
        close();
        location.reload();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  function openAdminAppsModal(ev) {
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="row">
        <div class="muted">Админ‑панель: заявки + очередь + управление</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
          <button class="btn" id="recount" style="width:auto;">Пересчитать кол-во заявок</button>
          <button class="btn" id="toggleClosed" style="width:auto;">${ev.isClosed ? "Открыть набор" : "Закрыть набор"}</button>
          <button class="btn" id="toggleArch" style="width:auto;">${ev.archived ? "Разархивировать" : "Архивировать"}</button>
        </div>
      </div>

      <div class="hr"></div>

      <div class="grid two" style="align-items:start; gap:14px;">
        <div class="card soft">
          <div class="section-title">🧾 Заявки</div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Игрок</th><th>Статус</th><th>Действия</th></tr></thead>
            <tbody id="ab"></tbody>
          </table>
        </div>

        <div class="card soft">
          <div class="section-title">⏳ Очередь</div>
          <div class="hr"></div>
          <table class="table">
            <thead><tr><th>Игрок</th><th>Действия</th></tr></thead>
            <tbody id="wb"></tbody>
          </table>
        </div>
      </div>

      <div class="hr"></div>

      <div class="row">
        <button class="btn ok" id="approveFit" style="width:auto;">Одобрить подходящих (пока есть места)</button>
        <button class="btn danger" id="rejectNoFit" style="width:auto;">Отклонить неподходящих</button>
      </div>
    `;

    // Make admin modal larger (best-effort, works with typical modalHost implementations)
    node.style.maxWidth = "1100px";

    openModal(`Админ: "${escapeHtml(ev.title)}"`, node);

    node.querySelector("#toggleClosed").addEventListener("click", async () => {
      try {
        await updateEvent(ev.id, { isClosed: !ev.isClosed });
        notify("ok", "Готово", ev.isClosed ? "Набор открыт" : "Набор закрыт");
        location.reload();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    node.querySelector("#toggleArch").addEventListener("click", async () => {
      try {
        await archiveEvent(ev.id, !ev.archived);
        notify("ok", "Готово", ev.archived ? "Разархивировано" : "Архивировано");
        location.reload();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    node.querySelector("#recount").addEventListener("click", async () => {
      try {
        let size = 0;
        const unsub = listenEventParticipants(ev.id, (parts) => {
          size = parts.length;
        });
        setTimeout(async () => {
          try {
            unsub();
          } catch (_) {}
          await updateEvent(ev.id, { participantsCount: Number(size) });
          notify("ok", "Готово", `participantsCount = ${size}`);
          location.reload();
        }, 400);
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    const tbody = node.querySelector("#ab");
    const wbody = node.querySelector("#wb");

    let latestApps = [];
    let latestWait = [];

    const unsubApps = listenEventApplications(ev.id, (apps) => {
      latestApps = apps || [];
      tbody.innerHTML = latestApps.length ? "" : `<tr><td colspan="3" class="muted">Заявок нет</td></tr>`;

      for (const a of latestApps) {
        const cls = statusCls(a.status);
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><button class="btn small" data-open="${escapeAttr(a.uid)}" style="width:auto;">${escapeHtml(a.displayName || a.uid)}</button></td>
          <td><span class="badge ${cls}">${escapeHtml(prettyStatus(a.status))}</span></td>
          <td>
            <div class="row">
              <button class="btn ok small" data-ap="${escapeAttr(a.uid)}" style="width:auto;">Принять</button>
              <button class="btn danger small" data-rj="${escapeAttr(a.uid)}" style="width:auto;">Отклонить</button>
              <button class="btn danger small" data-delapp="${escapeAttr(a.uid)}" style="width:auto;">Удалить</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);

        tr.querySelector(`[data-open="${CSS.escape(a.uid)}"]`).addEventListener("click", () => go("user", { uid: a.uid }));

        tr.querySelector(`[data-ap="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
          try {
            const cap = Number(ev.capacity ?? 0);
            const current = Number(ev.participantsCount ?? 0);
            if (current >= cap) throw new Error("Нет свободных мест (лимит заполнен)");

            await setEventApplicationStatus(ev.id, a.uid, "approved");
            await addParticipant(ev.id, a);
            await rememberMyEvent(ev.id, a.uid);

            ev.participantsCount = Number(ev.participantsCount ?? 0) + 1;
            notify("ok", "Готово", "Принят");
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-rj="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
          try {
            await setEventApplicationStatus(ev.id, a.uid, "rejected");
            notify("warn", "Готово", "Отклонён");
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-delapp="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
          try {
            if (!confirm("Удалить заявку этого игрока?")) return;
            await deleteEventApplication(ev.id, a.uid);
            notify("warn", "Удалено", "Заявка удалена");
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });
      }
    });

    const unsubWait = listenWaitlist(ev.id, (list) => {
      latestWait = list || [];
      wbody.innerHTML = latestWait.length ? "" : `<tr><td colspan="2" class="muted">Очередь пуста</td></tr>`;

      for (const w of latestWait) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><button class="btn small" data-open="${escapeAttr(w.uid)}" style="width:auto;">${escapeHtml(w.displayName || w.uid)}</button></td>
          <td>
            <div class="row">
              <button class="btn ok small" data-take="${escapeAttr(w.uid)}" style="width:auto;">Взять</button>
              <button class="btn danger small" data-drop="${escapeAttr(w.uid)}" style="width:auto;">Удалить</button>
            </div>
          </td>
        `;
        wbody.appendChild(tr);

        tr.querySelector(`[data-open="${CSS.escape(w.uid)}"]`).addEventListener("click", () => go("user", { uid: w.uid }));

        tr.querySelector(`[data-drop="${CSS.escape(w.uid)}"]`).addEventListener("click", async () => {
          try {
            await leaveWaitlist(ev.id, w.uid);
            notify("warn", "Удалено", "Убран из очереди");
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });

        tr.querySelector(`[data-take="${CSS.escape(w.uid)}"]`).addEventListener("click", async () => {
          try {
            const cap = Number(ev.capacity ?? 0);
            const current = Number(ev.participantsCount ?? 0);
            if (current >= cap) throw new Error("Нет мест");

            await setEventApplicationStatus(ev.id, w.uid, "approved").catch(async () => {
              await submitEventApplication(ev.id, w.uid, {
                displayName: w.displayName || "Игрок",
                photoURL: w.photoURL || "",
                stats: w.stats || {},
              });
              await setEventApplicationStatus(ev.id, w.uid, "approved");
            });

            await addParticipant(ev.id, w);
            await rememberMyEvent(ev.id, w.uid);
            await leaveWaitlist(ev.id, w.uid);

            ev.participantsCount = Number(ev.participantsCount ?? 0) + 1;
            notify("ok", "Готово", "Игрок взят из очереди");
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });
      }
    });

    node.querySelector("#approveFit").addEventListener("click", async () => {
      try {
        let current = Number(ev.participantsCount ?? 0);
        const cap = Number(ev.capacity ?? 0);

        for (const a of latestApps) {
          if (current >= cap) break;
          if (a.status !== "pending") continue;

          const chk = checkRequirements(a.stats || {}, ev.requirements || {});
          if (!chk.ok) continue;

          await setEventApplicationStatus(ev.id, a.uid, "approved");
          await addParticipant(ev.id, a);
          await rememberMyEvent(ev.id, a.uid);
          current += 1;
        }

        notify("ok", "Готово", "Массовое одобрение выполнено");
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    node.querySelector("#rejectNoFit").addEventListener("click", async () => {
      try {
        for (const a of latestApps) {
          if (a.status !== "pending") continue;
          const chk = checkRequirements(a.stats || {}, ev.requirements || {});
          if (chk.ok) continue;
          await setEventApplicationStatus(ev.id, a.uid, "rejected");
        }
        notify("warn", "Готово", "Неподходящие отклонены");
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    const modalHost = document.getElementById("modalHost");
    const pollModal = setInterval(() => {
      if (modalHost.classList.contains("hidden")) {
        try {
          unsubApps();
        } catch (_) {}
        try {
          unsubWait();
        } catch (_) {}
        clearInterval(pollModal);
      }
    }, 250);
  }
}

/* ---------- form (startAt + endAt + link + flags + requirements) ---------- */
function buildEventForm(ev, mode) {
  const req = ev.requirements || {};

  const form = document.createElement("div");
  form.innerHTML = `
    <div class="label">Название</div>
    <input class="input" id="t" value="${escapeAttr(ev.title || "")}" />

    <div class="label">Дата и время начала</div>
    <input class="input" id="startAt" type="datetime-local" value="${escapeAttr(toDatetimeLocal(ev.startAt))}" />

    <div class="label">Дата и время окончания</div>
    <input class="input" id="endAt" type="datetime-local" value="${escapeAttr(toDatetimeLocal(ev.endAt))}" />

    <div class="label">Ссылка (Telegram/канал/чат)</div>
    <input class="input" id="link" placeholder="https://t.me/..." value="${escapeAttr(ev.link || "")}" />

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

    <div class="row" style="margin-top:10px;">
      <label class="check"><input type="checkbox" id="closed" ${ev.isClosed ? "checked" : ""}> Набор закрыт</label>
      <label class="check"><input type="checkbox" id="arch" ${ev.archived ? "checked" : ""}> Архив</label>
    </div>

    <div class="hr"></div>

    <div class="section-title">Требования</div>
    <div class="muted" style="margin-top:6px;">Заполни 8 параметров</div>

    <div class="grid two" style="margin-top:10px;">
      <div>
        <div class="label">ХП❤️</div>
        <input class="input" id="req_hp" inputmode="numeric" value="${escapeAttr(String(req.hp ?? 0))}" />
      </div>
      <div>
        <div class="label">Энергия⚡️</div>
        <input class="input" id="req_energy" inputmode="numeric" value="${escapeAttr(String(req.energy ?? 0))}" />
      </div>

      <div>
        <div class="label">Уважение👥</div>
        <input class="input" id="req_respect" inputmode="numeric" value="${escapeAttr(String(req.respect ?? 0))}" />
      </div>
      <div>
        <div class="label">Уклон.🏃</div>
        <input class="input" id="req_evasion" inputmode="numeric" value="${escapeAttr(String(req.evasion ?? 0))}" />
      </div>

      <div>
        <div class="label">Броня🛡️</div>
        <input class="input" id="req_armor" inputmode="numeric" value="${escapeAttr(String(req.armor ?? 0))}" />
      </div>
      <div>
        <div class="label">Сопр.🚧</div>
        <input class="input" id="req_resistance" inputmode="numeric" value="${escapeAttr(String(req.resistance ?? 0))}" />
      </div>

      <div>
        <div class="label">Сопр.Крови🩸</div>
        <input class="input" id="req_bloodRes" inputmode="numeric" value="${escapeAttr(String(req.bloodRes ?? 0))}" />
      </div>
      <div>
        <div class="label">Сопр.Яду☠️</div>
        <input class="input" id="req_poisonRes" inputmode="numeric" value="${escapeAttr(String(req.poisonRes ?? 0))}" />
      </div>
    </div>

    <div class="hr"></div>

    <div class="row">
      <button class="btn primary" id="save" style="width:auto;">${mode === "edit" ? "Сохранить" : "Создать"}</button>
    </div>
  `;
  return form;
}

function readEventForm(form) {
  const titleEl = form.querySelector("#t");
  if (!titleEl) throw new Error("Форма: не найдено поле #t");
  const title = titleEl.value.trim();
  if (!title) throw new Error("Укажите название");

  const startAtRaw = form.querySelector("#startAt")?.value || "";
  const endAtRaw = form.querySelector("#endAt")?.value || "";

  const startAt = startAtRaw ? Timestamp.fromDate(new Date(startAtRaw)) : null;
  const endAt = endAtRaw ? Timestamp.fromDate(new Date(endAtRaw)) : null;

  if (startAt && endAt && endAt.toMillis() <= startAt.toMillis()) {
    throw new Error("Окончание должно быть позже начала");
  }

  const desc = form.querySelector("#d")?.value.trim() || "";

  const capRaw = form.querySelector("#cap")?.value;
  const cap = Number.parseInt(capRaw, 10);
  if (!Number.isFinite(cap) || cap < 1 || cap > 500) throw new Error("Лимит мест: 1..500");

  const autoApprove = (form.querySelector("#aa")?.value || "false") === "true";
  const link = form.querySelector("#link")?.value.trim() || "";
  const isClosed = !!form.querySelector("#closed")?.checked;
  const archived = !!form.querySelector("#arch")?.checked;

  const reqDraft = {
    hp: form.querySelector("#req_hp")?.value ?? "",
    energy: form.querySelector("#req_energy")?.value ?? "",
    respect: form.querySelector("#req_respect")?.value ?? "",
    evasion: form.querySelector("#req_evasion")?.value ?? "",
    armor: form.querySelector("#req_armor")?.value ?? "",
    resistance: form.querySelector("#req_resistance")?.value ?? "",
    bloodRes: form.querySelector("#req_bloodRes")?.value ?? "",
    poisonRes: form.querySelector("#req_poisonRes")?.value ?? "",
  };

  const v = validateStats(reqDraft);
  if (!v.ok) throw new Error(v.error);

  return { title, startAt, endAt, link, desc, capacity: cap, autoApprove, isClosed, archived, requirements: v.value };
}


/* ---------- helpers ---------- */
function statusByTime(ev) {
  const now = Date.now();
  const s = toMillis(ev.startAt);
  const e = toMillis(ev.endAt);

  if (!s) return "nodate";
  if (now < s) return "soon";
  if (e && now < e) return "running";
  if (!e) {
    if (now < s + 2 * 60 * 60 * 1000) return "running";
  }
  return "past";
}

function fmtWhen(ev) {
  const s = toMillis(ev.startAt);
  if (!s) return "Когда: —";
  const start = fmtDate(ev.startAt);
  const end = ev.endAt ? fmtDate(ev.endAt) : "";
  const rel = fmtRelative(s);
  return end ? `Когда: ${start} – ${end} (${rel})` : `Когда: ${start} (${rel})`;
}

function fmtRelative(ms) {
  const now = Date.now();
  const diff = ms - now;
  const sign = diff >= 0 ? "через " : "";
  const abs = Math.abs(diff);

  const min = Math.round(abs / 60000);
  if (min < 60) return diff >= 0 ? `${sign}${min} мин` : `${min} мин назад`;

  const h = Math.round(min / 60);
  if (h < 48) return diff >= 0 ? `${sign}${h} ч` : `${h} ч назад`;

  const d = Math.round(h / 24);
  return diff >= 0 ? `${sign}${d} дн` : `${d} дн назад`;
}

function prettyStatus(s) {
  const map = { pending: "На рассмотрении", approved: "Одобрена", rejected: "Отклонена", canceled: "Отменена" };
  return map[s] || s || "—";
}

function statusCls(s) {
  if (s === "approved") return "ok";
  if (s === "rejected") return "bad";
  if (s === "pending") return "warn";
  if (s === "canceled") return "";
  return "";
}

function checkRequirements(my, req) {
  const miss = [];
  const labels = {
    hp: "hp",
    energy: "en",
    respect: "rsp",
    evasion: "eva",
    armor: "arm",
    resistance: "res",
    bloodRes: "blood",
    poisonRes: "poison",
  };
  for (const k of Object.keys(req || {})) {
    const need = Number(req[k] ?? 0);
    const have = Number(my[k] ?? 0);
    if (have < need) miss.push(labels[k] || k);
  }
  return { ok: miss.length === 0, missing: miss };
}

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts === "number") return ts;
  if (ts.toMillis) return ts.toMillis();
  if (ts.seconds) return ts.seconds * 1000;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function toDatetimeLocal(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function escapeAttr(s) {
  return String(s ?? "").replace(/"/g, "&quot;");
}
