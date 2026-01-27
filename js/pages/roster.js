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
  getMyProfile,
} from "../db.js";

import { notify } from "../notify.js";
import { renderStatsKV, openModal } from "../ui.js";
import { go } from "../router.js";

import { db } from "../firebase.js";
import {
  collection,
  query,
  where,
  documentId,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export async function renderRoster(ctx) {
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const members = await listMembers();

  // TOP-5 Power
  const top5Power = [...members]
    .map((m) => ({ ...m, power: calcPower(m.stats || {}) }))
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0))
    .slice(0, 5);

  const topPanel = document.createElement("div");
  topPanel.className = "card soft";
  topPanel.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">TOP‑5 по силе</div>
        <div class="card-sub">Быстрый рейтинг по формуле силы</div>
      </div>
      <span class="badge">Клан</span>
    </div>
    <div class="hr"></div>
    <div id="topP"></div>
  `;
  root.appendChild(topPanel);
  renderTopPower(topPanel.querySelector("#topP"), top5Power);

  // Controls (sticky)
  const controls = document.createElement("div");
  controls.className = "card roster-controls";
  controls.innerHTML = `
    <div class="roster-head">
      <div>
        <div class="card-title">Состав клана</div>
        <div class="card-sub">Поиск • фильтры${ctx.isAdmin ? " • онлайн" : ""}</div>
      </div>

      <div class="roster-toolbar">
        <input class="input" id="search" placeholder="Поиск по нику${ctx.isAdmin ? " или UID" : ""}..." />

        <select class="input" id="sort">
          <option value="joinedAt_desc">Сортировка: новые</option>
          <option value="joinedAt_asc">Сортировка: старые</option>
          <option value="power">Топ: сила</option>
          <option value="hp">Топ: хп</option>
          <option value="energy">Топ: энергия</option>
          <option value="respect">Топ: уважение</option>
          <option value="armor">Топ: броня</option>
          <option value="resistance">Топ: сопротивление</option>
          ${ctx.isAdmin ? `<option value="activity">Активность: недавно</option>` : ``}
        </select>

        <button class="btn" id="toggleView" style="width:auto;">Вид: компакт</button>

        <div class="roster-actions">
          <span class="badge" id="count">Участников: ${members.length}</span>
          <button class="btn primary" id="applyBtn" style="display:none; width:auto;">Заявка в клан</button>
          ${ctx.isAdmin ? `<button class="btn" id="adminApps" style="width:auto;">Админ: заявки</button>` : ``}
        </div>
      </div>
    </div>

    <div class="hr"></div>

<div class="seg" id="segRoster">
  <button data-f="all" class="active">Все</button>
  <button data-f="filled">Со статами</button>
  <button data-f="empty">Без статов</button>
  ${ctx.isAdmin ? `<button data-f="online">Онлайн</button>` : ``}
  ${ctx.isAdmin ? `<button data-f="inactive">Неактив 14д+</button>` : ``}
</div>


      <div class="roster-right">
        <span class="badge" id="shown">Показано: ${members.length} / ${members.length}</span>
        ${ctx.isAdmin ? `<button class="btn small" id="refreshActivity" style="width:auto;">Обновить активность</button>` : ``}
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
  membersCard.innerHTML = `
    <div class="member-grid" id="mg"></div>
    <div style="height:10px;"></div>
    <div class="row" id="pagerRow" style="justify-content:center;"></div>
  `;
  root.appendChild(membersCard);

  const mg = membersCard.querySelector("#mg");
  const pagerRow = membersCard.querySelector("#pagerRow");

  // State
  const shownEl = controls.querySelector("#shown");
  const segRoster = controls.querySelector("#segRoster");
  const searchEl = controls.querySelector("#search");
  const sortEl = controls.querySelector("#sort");
  const toggleViewBtn = controls.querySelector("#toggleView");
  const refreshActivityBtn = controls.querySelector("#refreshActivity");

  const state = {
    filter: "all",
    compact: true,
    limit: 60,
    activity: new Map(), // uid -> lastSeenAt/updatedAt millis
    activityLoaded: false,
  };

  // Precompute enriched base list once (perf)
  const base = members.map((m) => ({
    ...m,
    power: calcPower(m.stats || {}),
    filled: hasFilledStats(m.stats || {}),
  }));

  async function loadActivityForUids(uids) {
    const col = collection(db, "users");
    const chunks = chunk(uids, 30);
    const out = new Map();

    for (const ids of chunks) {
      const qy = query(col, where(documentId(), "in", ids));
      const snap = await getDocs(qy);
      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        out.set(docSnap.id, toMillis(d.lastSeenAt || d.updatedAt));
      });
    }
    return out;
  }

  async function ensureActivityLoaded() {
    if (!ctx.isAdmin) return;
    if (state.activityLoaded) return;

    const uids = base.map((m) => m.uid).filter(Boolean);
    const map = await loadActivityForUids(uids);
    state.activity = map;
    state.activityLoaded = true;
  }

  segRoster.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-f]");
    if (!b) return;
    state.filter = b.dataset.f;
    segRoster.querySelectorAll("button[data-f]").forEach((x) => x.classList.toggle("active", x === b));
    state.limit = 60;
    renderMembers();
  });

  toggleViewBtn.addEventListener("click", () => {
    state.compact = !state.compact;
    toggleViewBtn.textContent = state.compact ? "Вид: компакт" : "Вид: расшир";
    state.limit = 60;
    renderMembers();
  });

  refreshActivityBtn?.addEventListener("click", async () => {
    try {
      state.activityLoaded = false;
      state.activity = new Map();
      await ensureActivityLoaded();
      renderMembers();
      notify("ok", "Готово", "Активность обновлена");
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });

  const openQuickProfile = (m) => {
    const node = document.createElement("div");
    const filled = hasFilledStats(m.stats || {});
    const lastSeenMs = ctx.isAdmin ? (state.activity.get(m.uid) || 0) : 0;
    const online = ctx.isAdmin && isOnline(lastSeenMs);

    node.innerHTML = `
      <div class="row">
        <div style="display:flex; gap:10px; align-items:center;">
          <img class="member-ava" style="width:46px;height:46px;border-radius:16px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
          <div>
            <div style="font-weight:1000; font-size:16px;">${escapeHtml(m.displayName || "Игрок")}</div>
            <div class="muted" style="font-size:12px;">💪: <b>${formatPower(m.power ?? calcPower(m.stats || {}))}</b></div>
            ${filled ? `` : `<div style="margin-top:6px;"><span class="badge warn">Статы не заполнены</span></div>`}
            ${ctx.isAdmin ? `<div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:6px;">${escapeHtml(m.uid)}</div>` : ``}
            ${ctx.isAdmin ? `
              <div style="margin-top:6px;">
                <span class="badge ${online ? "ok" : ""}">${online ? "Онлайн" : `Активность: ${escapeHtml(fmtAgo(lastSeenMs))}`}</span>
              </div>
            ` : ``}
          </div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn small" id="full" style="width:auto;">Профиль</button>
          ${ctx.isAdmin ? `<button class="btn small" id="copyUid" style="width:auto;">UID</button>` : ``}
        </div>
      </div>
      <div class="hr"></div>
    `;

    node.querySelector("#full").addEventListener("click", () => go("user", { uid: m.uid }));
    node.querySelector("#copyUid")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(String(m.uid || ""));
        notify("ok", "Скопировано", "UID в буфере");
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      }
    });

    node.appendChild(renderStatsKV(m.stats || {}));
    openModal("Быстрый профиль", node);
  };

  function renderMemberCard(m) {
    const el = document.createElement("div");
    el.className = "member";
    el.style.cursor = "pointer";

    const uidLine = ctx.isAdmin
      ? `<div class="member-uid">${escapeHtml(m.uid || "")}</div>`
      : `<div class="member-uid">UID скрыт</div>`;

    const lastSeenMs = ctx.isAdmin ? (state.activity.get(m.uid) || 0) : 0;
    const inactiveDays = ctx.isAdmin ? daysSince(lastSeenMs) : 0;
    const online = ctx.isAdmin && isOnline(lastSeenMs);

    el.innerHTML = `
      <div class="member-head">
        <div class="member-face">
          <img class="member-ava" src="${escapeAttr(m.photoURL || "")}" alt="avatar" />
          <div class="member-meta">
            <div class="member-name">${escapeHtml(m.displayName || "Игрок")}</div>
            <div class="muted" style="font-size:12px;">💪: <b>${formatPower(m.power)}</b></div>
            ${uidLine}
            ${m.filled ? `` : `<div style="margin-top:6px;"><span class="badge warn">Статы не заполнены</span></div>`}
            ${ctx.isAdmin ? `
              <div style="margin-top:6px;">
                <span class="badge ${online ? "ok" : (inactiveDays >= 14 ? "bad" : "")}">
                  ${online ? "Онлайн" : `Активность: ${escapeHtml(fmtAgo(lastSeenMs))}`}
                </span>
              </div>
            ` : ``}
          </div>
        </div>
      </div>

      ${
        state.compact
          ? ``
          : `
        <div class="member-mini statgrid">
          ${renderStatPills(m.stats || {})}
        </div>
      `
      }
    `;

    el.addEventListener("click", () => openQuickProfile(m));
    return el;
  }

  function computeList() {
    const f = (searchEl.value || "").toLowerCase().trim();
    const sortMode = sortEl.value || "joinedAt_desc";

    let list = base.filter((m) => {
      const name = String(m.displayName || "").toLowerCase();
      const uid = String(m.uid || "").toLowerCase();
      const matchText = !f || name.includes(f) || (ctx.isAdmin && uid.includes(f));
      if (!matchText) return false;

      if (state.filter === "filled") return !!m.filled;
      if (state.filter === "empty") return !m.filled;

	  if (state.filter === "online" && ctx.isAdmin) {
		const ms = state.activity.get(m.uid) || 0;
		return isOnline(ms);
	  }

      if (state.filter === "inactive" && ctx.isAdmin) {
        const ms = state.activity.get(m.uid) || 0;
        return daysSince(ms) >= 14;
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortMode === "joinedAt_desc") return toMillis(b.joinedAt) - toMillis(a.joinedAt);
      if (sortMode === "joinedAt_asc") return toMillis(a.joinedAt) - toMillis(b.joinedAt);
      if (sortMode === "power") return (b.power ?? 0) - (a.power ?? 0);
      if (sortMode === "activity" && ctx.isAdmin) {
        const am = state.activity.get(a.uid) || 0;
        const bm = state.activity.get(b.uid) || 0;
        return bm - am;
      }
      return Number(b.stats?.[sortMode] ?? 0) - Number(a.stats?.[sortMode] ?? 0);
    });

    return list;
  }

  async function renderMembers() {
    if (ctx.isAdmin) {
      try {
        await ensureActivityLoaded();
      } catch {
        // non-fatal
      }
    }

    const list = computeList();

    shownEl.textContent = `Показано: ${Math.min(state.limit, list.length)} / ${list.length}`;

    mg.innerHTML = "";
    pagerRow.innerHTML = "";

    if (!list.length) {
      mg.innerHTML = `<div class="muted">Ничего не найдено</div>`;
      return;
    }

    const slice = list.slice(0, state.limit);
    for (const m of slice) mg.appendChild(renderMemberCard(m));

    if (state.limit < list.length) {
      const more = document.createElement("button");
      more.className = "btn";
      more.style.width = "auto";
      more.textContent = `Показать ещё (${list.length - state.limit})`;
      more.addEventListener("click", () => {
        state.limit += 60;
        renderMembers();
      });
      pagerRow.appendChild(more);
    }
  }

  await renderMembers();

  // Search debounce
  searchEl.addEventListener("input", () => {
    clearTimeout(searchEl._t);
    searchEl._t = setTimeout(() => {
      state.limit = 60;
      renderMembers();
    }, 150);
  });

  sortEl.addEventListener("change", () => {
    state.limit = 60;
    renderMembers();
  });

  // Apply modal
  if (ctx.authed && !member) {
    applyBtn.addEventListener("click", async () => {
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

      if (!myApp) {
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
        body.querySelector("#toProfile").addEventListener("click", () => go("profile"));

        body.querySelector("#send").addEventListener("click", async () => {
          try {
            const me = await getMyProfile(ctx.uid);
            if (!hasFilledStats(me.stats)) {
              throw new Error("Нельзя подать заявку без заполненных статов. Открой профиль и заполни статы.");
            }
            await submitClanApplication(ctx.uid, {
              displayName: me.displayName || "Игрок",
              photoURL: me.photoURL || "",
              stats: me.stats || {},
              comment: body.querySelector("#comment").value.trim(),
            });
            notify("ok", "Отправлено", "Заявка отправлена");
            close();
            location.reload();
          } catch (e) {
            notify("bad", "Ошибка", e.message);
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
        body.querySelector("#del").addEventListener("click", async () => {
          try {
            await deleteClanApplication(ctx.uid);
            notify("warn", "Удалено", "Заявка удалена");
            close();
            location.reload();
          } catch (e) {
            notify("bad", "Ошибка", e.message);
          }
        });
        body.querySelector("#myProfile").addEventListener("click", () => go("profile"));
      }
    });
  }

  // Admin apps modal (workflow improvements)
  if (ctx.isAdmin) {
    controls.querySelector("#adminApps").addEventListener("click", async () => {
      const apps = await listClanApplications();
      const memberSet = new Set(members.map((m) => m.uid));
      let list = (apps || []).filter((a) => !memberSet.has(a.uid));

      const node = document.createElement("div");
      node.style.maxWidth = "1100px";
      node.innerHTML = `
        <div class="row">
          <div>
            <div class="section-title">Админ: заявки</div>
            <div class="muted">Фильтры • комментарии • дата • быстрые действия</div>
          </div>
          <span class="badge" id="appsCount">Всего: ${list.length}</span>
        </div>

        <div class="hr"></div>

        <div class="row" style="align-items:flex-end; flex-wrap:wrap;">
          <div style="min-width:220px; flex:1;">
            <div class="label">Поиск</div>
            <input class="input" id="aq" placeholder="ник или uid..." />
          </div>

          <div style="min-width:220px;">
            <div class="label">Статус</div>
            <select class="input" id="ast">
              <option value="all">Все</option>
              <option value="pending" selected>pending</option>
              <option value="rejected">rejected</option>
              <option value="approved">approved</option>
            </select>
          </div>

          <button class="btn" id="rejectEmpty" style="width:auto;">Отклонить без статов</button>
        </div>

        <div class="hr"></div>

        <table class="table">
          <thead><tr><th>Игрок</th><th>Статус</th><th>Действия</th></tr></thead>
          <tbody id="ab"></tbody>
        </table>
      `;

      const close = openModal("Админ: заявки", node);
      const tbody = node.querySelector("#ab");
      const appsCount = node.querySelector("#appsCount");
      const aq = node.querySelector("#aq");
      const ast = node.querySelector("#ast");

      const render = () => {
        const q = (aq.value || "").toLowerCase().trim();
        const st = ast.value || "pending";

        const filtered = list.filter((a) => {
          if (st !== "all" && a.status !== st) return false;
          if (!q) return true;
          const name = String(a.displayName || "").toLowerCase();
          const uid = String(a.uid || "").toLowerCase();
          return name.includes(q) || uid.includes(q);
        });

        appsCount.textContent = `Всего: ${filtered.length}`;
        tbody.innerHTML = filtered.length ? "" : `<tr><td colspan="3" class="muted">Нет заявок</td></tr>`;

        for (const a of filtered) {
          const cls = a.status === "approved" ? "ok" : a.status === "rejected" ? "bad" : "warn";
          const power = calcPower(a.stats || {});
          const comment = (a.comment || "").trim();

          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>
              <div style="font-weight:1000;">${escapeHtml(a.displayName || a.uid)}</div>
              <div class="muted" style="font-size:12px;">UID: <span style="font-family:var(--mono);">${escapeHtml(a.uid)}</span></div>
              <div class="muted" style="font-size:12px;">Дата: <b>${escapeHtml(fmtDateTime(a.createdAt))}</b></div>
              <div class="muted" style="font-size:12px;">💪: <b>${formatPower(power)}</b></div>

              <div class="roster-app-stats">
                ${renderStatPills(a.stats || {})}
              </div>

              ${comment ? `<div class="muted" style="margin-top:8px; white-space:pre-wrap;">Комментарий: ${escapeHtml(comment)}</div>` : ``}

              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="btn small" data-open="${escapeAttr(a.uid)}" style="width:auto;">Профиль</button>
                <button class="btn small" data-copy="${escapeAttr(a.uid)}" style="width:auto;">UID</button>
              </div>
            </td>
            <td><span class="badge ${cls}">${escapeHtml(a.status)}</span></td>
            <td>
              <div class="roster-app-actions">
                <button class="btn ok small" data-approve="${escapeAttr(a.uid)}" style="width:auto;">Принять</button>
                <button class="btn ok small" data-approve-open="${escapeAttr(a.uid)}" style="width:auto;">Принять+профиль</button>
                <button class="btn danger small" data-reject="${escapeAttr(a.uid)}" style="width:auto;">Отклонить</button>
                <button class="btn danger small" data-del="${escapeAttr(a.uid)}" style="width:auto;">Удалить</button>
              </div>
            </td>
          `;
          tbody.appendChild(tr);

          tr.querySelector(`[data-open="${CSS.escape(a.uid)}"]`).addEventListener("click", () => go("user", { uid: a.uid }));
          tr.querySelector(`[data-copy="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(String(a.uid || ""));
              notify("ok", "Скопировано", "UID в буфере");
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          });

          const approve = async (openAfter) => {
            try {
              await setClanApplicationStatus(a.uid, "approved");
              await addMemberFromApplication(a);
              notify("ok", "Готово", "Принят в клан");

              list = list.filter((x) => x.uid !== a.uid);
              render();

              if (openAfter) {
                close();
                go("user", { uid: a.uid });
              }
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          };

          tr.querySelector(`[data-approve="${CSS.escape(a.uid)}"]`).addEventListener("click", () => approve(false));
          tr.querySelector(`[data-approve-open="${CSS.escape(a.uid)}"]`).addEventListener("click", () => approve(true));

          tr.querySelector(`[data-reject="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
            try {
              await setClanApplicationStatus(a.uid, "rejected");
              notify("warn", "Готово", "Отклонено");
              const idx = list.findIndex((x) => x.uid === a.uid);
              if (idx >= 0) list[idx].status = "rejected";
              render();
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          });

          tr.querySelector(`[data-del="${CSS.escape(a.uid)}"]`).addEventListener("click", async () => {
            try {
              await deleteClanApplication(a.uid);
              notify("warn", "Удалено", "Заявка удалена");
              list = list.filter((x) => x.uid !== a.uid);
              render();
            } catch (e) {
              notify("bad", "Ошибка", e.message);
            }
          });
        }
      };

      aq.addEventListener("input", () => {
        clearTimeout(aq._t);
        aq._t = setTimeout(render, 150);
      });
      ast.addEventListener("change", render);

      node.querySelector("#rejectEmpty").addEventListener("click", async () => {
        try {
          const pending = list.filter((a) => a.status === "pending");
          let changed = 0;
          for (const a of pending) {
            if (hasFilledStats(a.stats || {})) continue;
            await setClanApplicationStatus(a.uid, "rejected");
            a.status = "rejected";
            changed += 1;
          }
          notify("warn", "Готово", `Отклонено: ${changed}`);
          render();
        } catch (e) {
          notify("bad", "Ошибка", e.message);
        }
      });

      render();
      void close;
    });
  }

  return root;
}

// ===== Helpers =====
function hasFilledStats(stats) {
  const keys = ["hp", "energy", "respect", "evasion", "armor", "resistance", "bloodRes", "poisonRes"];
  return stats && keys.every((k) => Number(stats[k] ?? 0) > 0);
}

function calcPower(stats) {
  const armor = Number(stats.armor ?? 0);
  const blood = Number(stats.bloodRes ?? 0);
  const poison = Number(stats.poisonRes ?? 0);
  const res = Number(stats.resistance ?? 0);
  const hp = Number(stats.hp ?? 0);

  const value = armor * 2.5 + blood * 1 + poison * 2 + res * 1 + hp * 1.5;
  return value / 10;
}

function formatPower(x) {
  const n = Number(x ?? 0);
  return n.toFixed(1);
}

function renderTopPower(containerEl, list) {
  containerEl.innerHTML = list.length ? "" : `<div class="muted">Пока пусто</div>`;
  list.forEach((m, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.style.padding = "8px 0";
    row.innerHTML = `
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="badge">#${i + 1}</span>
        <img class="member-ava" style="width:34px;height:34px;border-radius:12px;" src="${escapeAttr(m.photoURL || "")}" alt="ava">
        <div>
          <div style="font-weight:1000;">${escapeHtml(m.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px;">💪: ${formatPower(m.power)}</div>
        </div>
      </div>
      <button class="btn small" data-open="${escapeAttr(m.uid)}" style="width:auto;">Профиль</button>
    `;
    containerEl.appendChild(row);
    row.querySelector(`[data-open="${CSS.escape(m.uid)}"]`).addEventListener("click", () => go("user", { uid: m.uid }));
  });
}

function renderStatPills(stats) {
  const s = stats || {};
  return [
    ["ХП❤️", s.hp ?? 0],
    ["Энка⚡️", s.energy ?? 0],
    ["Уваж.👥", s.respect ?? 0],
    ["Уклон🏃", s.evasion ?? 0],
    ["Бронь🛡️", s.armor ?? 0],
    ["Сопр.🚧", s.resistance ?? 0],
    ["С.Крови🩸", s.bloodRes ?? 0],
    ["С.Яду☠️", s.poisonRes ?? 0],
  ]
    .map(([k, v]) => `<span class="statpill">${escapeHtml(k)} <b>${escapeHtml(String(v))}</b></span>`)
    .join("");
}

function fmtDateTime(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (!Number.isFinite(d.getTime())) return "—";
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

function daysSince(ms) {
  if (!ms) return 9999;
  return Math.floor((Date.now() - ms) / 86400000);
}

function fmtAgo(ms) {
  if (!ms) return "неизвестно";
  const d = daysSince(ms);
  if (d <= 0) return "сегодня";
  if (d === 1) return "1 день назад";
  if (d < 5) return `${d} дня назад`;
  return `${d} дней назад`;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
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

function isOnline(lastSeenMs) {
  return !!lastSeenMs && (Date.now() - lastSeenMs) <= 120_000; // 2 minutes
}
