// js/pages/profile.js
import { renderStatsKV, openModal, buildStatsForm, readStatsForm } from "../ui.js";
import { validateStats } from "../validators.js";
import { notify } from "../notify.js";
import { updateUserProfile } from "../db.js";
import { auth } from "../firebase.js";
import { logout, resetPassword } from "../auth.js";
import {
  getClanApplication,
  getMyEventApplications,
  getMyEvents,
  leaveEvent,
  getChatStats
} from "../services/profileIntegrations.js";


const TZ_LIST = buildTimezones();
const SPEC_LIST = [
  { value: "none", label: "Не указано" },
  { value: "tank", label: "Танк" },
  { value: "dps", label: "ДПС" },
  { value: "support", label: "Саппорт" },
  { value: "universal", label: "Универсал" },
];

export async function renderProfile(ctx) {
  const u = ctx.userDoc || {};
  const stats = u.stats || {};
  

  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const filled = getStatsFilledState(stats);

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Мой профиль</div>
        <div class="card-sub">Ник, статы и полезные настройки для клана</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <span class="badge ${filled.ok ? "ok" : "warn"}">${filled.ok ? "Статы заполнены" : "Статы не заполнены"}</span>
        <button class="btn" id="copy" style="width:auto;">Скопировать</button>
        <button class="btn" id="account" style="width:auto;">Аккаунт</button>
        <button class="btn primary" id="edit" style="width:auto;">Редактировать</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="row">
      <div style="display:flex; gap:12px; align-items:center;">
        <img class="avatar" style="width:54px;height:54px;border-radius:18px;" id="ava" alt="avatar" />
        <div>
          <div style="font-weight:1000; font-size:18px;">${escapeHtml(u.displayName || "Игрок")}</div>
          <div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:4px;">${escapeHtml(ctx.uid)}</div>
        </div>
      </div>
      <span class="badge ${ctx.isAdmin ? "ok" : ""}">${ctx.isAdmin ? "Админ" : "Пользователь"}</span>
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

        ${filled.ok ? "" : `
          <div class="hr"></div>
          <div class="badge warn">Подсказка</div>
          <div class="muted" style="margin-top:6px;">
            Заполни все 8 статов в профиле — без этого заявка в клан/события может быть недоступна.
          </div>
        `}
      </div>

      <div class="card soft profile-right">
        <div class="section-title">📊 Статы</div>
        <div class="hr"></div>
        <div id="stats"></div>
      </div>
    </div>
  `;

  const ava = card.querySelector("#ava");
  ava.src =
    u.photoURL ||
    ctx.firebaseUser?.photoURL ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";

  card.querySelector("#stats").appendChild(renderStatsKV(stats));
  card.querySelector("#edit").addEventListener("click", () => openEditModal(ctx));

  card.querySelector("#copy").addEventListener("click", async () => {
    const txt = buildProfileText(ctx.userDoc || {}, ctx.uid);
    try {
      await navigator.clipboard.writeText(txt);
      notify("ok", "Скопировано", "Профиль скопирован в буфер обмена");
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = txt;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        notify("ok", "Скопировано", "Профиль скопирован");
      } catch (err) {
        notify("bad", "Ошибка", err.message);
      }
    }
  });

  card.querySelector("#account").addEventListener("click", () => openAccountModal());

  root.appendChild(card);
  
  const integrationCard = document.createElement("div");
  integrationCard.className = "card";
  integrationCard.innerHTML = `
    <details id="intSpoiler">
      <summary class="row" style="cursor:pointer; list-style:none;">
        <div>
          <div class="card-title">Интеграция</div>
          <div class="card-sub">Мои заявки • Мои события • Статистика чата</div>
        </div>
        <button class="btn" id="refreshInt" style="width:auto;" type="button">Обновить</button>
      </summary>

      <div class="hr"></div>

      <div class="grid two" style="align-items:start;">
        <div class="card soft">
          <div class="section-title">🧾 Мои заявки</div>
          <div class="hr"></div>
          <div id="myApps" class="muted">Загрузка…</div>
        </div>

        <div class="card soft">
          <div class="section-title">📅 Мои события</div>
          <div class="hr"></div>
          <div id="myEvents" class="muted">Загрузка…</div>
        </div>
      </div>

      <div style="height:12px;"></div>

      <div class="card soft">
        <div class="section-title">💬 Статистика чата</div>
        <div class="hr"></div>
        <div id="chatStats" class="muted">Загрузка…</div>
      </div>
    </details>
  `;
  root.appendChild(integrationCard);

  // чтобы кнопка "Обновить" не закрывала/открывала summary
  const spoiler = integrationCard.querySelector("#intSpoiler");
  const btnRefresh = integrationCard.querySelector("#refreshInt");
  btnRefresh.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    renderAll();
    // оставим спойлер открытым
    spoiler.open = true;
  });

  const $apps = integrationCard.querySelector("#myApps");
  const $events = integrationCard.querySelector("#myEvents");
  const $chat = integrationCard.querySelector("#chatStats");
  

  const renderAll = async ()=>{
    // заявки
    try{
      const [clan, evApps] = await Promise.all([
        getClanApplication(ctx.uid),
        getMyEventApplications(ctx.uid),
      ]);
      $apps.innerHTML = renderAppsHtml(clan, evApps);
    }catch(e){
      $apps.innerHTML = `<span class="bad">Ошибка: ${escapeHtml(e.message)}</span>`;
    }

    // события
    try{
      const list = await getMyEvents(ctx.uid);
      $events.innerHTML = renderMyEventsHtml(list);
      bindLeaveButtons($events, ctx.uid, async ()=> {
      const updated = await getMyEvents(ctx.uid);
      $events.innerHTML = renderMyEventsHtml(updated);
      bindLeaveButtons($events, ctx.uid, null);
      });
    }catch(e){
      $events.innerHTML = `<span class="bad">Ошибка: ${escapeHtml(e.message)}</span>`;
    }

    // чат-статистика
    try{
      const st = await getChatStats(ctx.uid);
      $chat.innerHTML = st ? renderChatStatsHtml(st) : `<div class="muted">Отключено</div>`;
    }catch(e){
      $chat.innerHTML = `<span class="bad">Ошибка: ${escapeHtml(e.message)}</span>`;
    }
  };


let loadedOnce = false;

spoiler.addEventListener("toggle", async () => {
  if (spoiler.open && !loadedOnce) {
    loadedOnce = true;
    await renderAll();
  }
});


  
  return root;
}

/* ===================== Account modal ===================== */
function openAccountModal() {
  const user = auth.currentUser;
  const providers = (user?.providerData || []).map((p) => p.providerId);
  const hasPassword = providers.includes("password");

  const node = document.createElement("div");
  node.innerHTML = `
    <div class="kv">
      <div class="kv-row">
        <div class="kv-k">Email</div>
        <div class="kv-v">${escapeHtml(user?.email || "—")}</div>
      </div>
      <div class="kv-row">
        <div class="kv-k">Способ входа</div>
        <div class="kv-v">${escapeHtml(providers.length ? providers.join(", ") : "—")}</div>
      </div>
    </div>

    <div class="hr"></div>

    <div class="muted" style="font-size:12px;">
      ${hasPassword
        ? "Пароль уже установлен. Можно сменить или сделать сброс на email."
        : "Пароль не установлен. Можно привязать пароль к текущему аккаунту (например, чтобы входить без Google)."}
    </div>

    <div style="height:12px;"></div>

    <div class="row" style="flex-wrap:wrap;">
      ${hasPassword
        ? `<button class="btn" id="changePass" style="width:auto;">Сменить пароль</button>`
        : `<button class="btn primary" id="setPass" style="width:auto;">Установить пароль</button>`
      }
      <button class="btn" id="resetPass" style="width:auto;" ${hasPassword ? "" : "disabled"}>Сбросить пароль</button>
      <button class="btn danger" id="logoutBtn" style="width:auto;">Выйти</button>
    </div>

    ${hasPassword ? "" : `
      <div class="muted" style="margin-top:10px; font-size:12px;">
        После установки пароля появится вход по email/пароль, и будет доступен “Сбросить пароль”.
      </div>
    `}
  `;

  const close = openModal("Аккаунт", node);

  node.querySelector("#logoutBtn").addEventListener("click", async () => {
    try {
      await logout();
      close();
      location.hash = "#home";
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });

  node.querySelector("#resetPass").addEventListener("click", async () => {
    try {
      if (!hasPassword) return;
      const email = user?.email;
      if (!email) throw new Error("Не найден email");
      await resetPassword(email);
      notify("ok", "Готово", "Письмо для сброса отправлено на email");
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });

  node.querySelector("#changePass")?.addEventListener("click", async () => {
    close();
    await openChangePasswordModal();
  });

  node.querySelector("#setPass")?.addEventListener("click", async () => {
    close();
    await openSetPasswordModal();
  });
}

async function openSetPasswordModal() {
  const user = auth.currentUser;
  const emailPrefill = user?.email || "";

  const node = document.createElement("div");
  node.innerHTML = `
    <div class="muted" style="font-size:12px;">
      Установка пароля привяжет вход по email/пароль к вашему текущему аккаунту.
    </div>
    <div class="hr"></div>

    <div class="label">Email</div>
    <input class="input" id="email" type="email" autocomplete="email" placeholder="you@mail.com" />

    <div class="label">Новый пароль</div>
    <input class="input" id="p1" type="password" autocomplete="new-password" placeholder="Минимум 6 символов" />

    <div class="label">Повторите пароль</div>
    <input class="input" id="p2" type="password" autocomplete="new-password" placeholder="Повторите пароль" />

    <div class="hr"></div>
    <div class="row">
      <button class="btn" id="cancel" style="width:auto;">Отмена</button>
      <button class="btn primary" id="save" style="width:auto;">Установить</button>
    </div>

    <div class="muted" style="margin-top:10px; font-size:12px;">
      Если появится ошибка “requires recent login” — выйдите и войдите заново, затем повторите.
    </div>
  `;

  node.querySelector("#email").value = emailPrefill;

  const close = openModal("Установить пароль", node);

  node.querySelector("#cancel").addEventListener("click", close);
  node.querySelector("#save").addEventListener("click", async () => {
    try {
      const email = node.querySelector("#email").value.trim();
      const p1 = node.querySelector("#p1").value;
      const p2 = node.querySelector("#p2").value;

      if (!email) throw new Error("Укажите email");
      if (!p1 || p1.length < 6) throw new Error("Пароль минимум 6 символов");
      if (p1 !== p2) throw new Error("Пароли не совпадают");
      if (!auth.currentUser) throw new Error("Нет пользователя");

      const {
        EmailAuthProvider,
        linkWithCredential,
        updateEmail
      } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");

      // если у пользователя нет email (редко), обновим	
      if (!auth.currentUser.email) {
        await updateEmail(auth.currentUser, email);
      }

      const cred = EmailAuthProvider.credential(email, p1);
      await linkWithCredential(auth.currentUser, cred);

      notify("ok", "Готово", "Пароль установлен и привязан к аккаунту");
      close();
      location.reload();
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });
}

async function openChangePasswordModal() {
  const node = document.createElement("div");
  node.innerHTML = `
    <div class="muted">Введите новый пароль. Минимум 6 символов.</div>
    <div class="hr"></div>
    <div class="label">Новый пароль</div>
    <input class="input" id="p1" type="password" autocomplete="new-password" placeholder="••••••••" />
    <div class="label">Повторите пароль</div>
    <input class="input" id="p2" type="password" autocomplete="new-password" placeholder="••••••••" />
    <div class="hr"></div>
    <div class="row">
      <button class="btn" id="cancel" style="width:auto;">Отмена</button>
      <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
    </div>
    <div class="muted" style="margin-top:10px; font-size:12px;">
      Если Firebase попросит “повторный вход”, выйдите и войдите заново, затем повторите попытку.
    </div>
  `;

  const close = openModal("Сменить пароль", node);

  node.querySelector("#cancel").addEventListener("click", close);
  node.querySelector("#save").addEventListener("click", async () => {
    try {
      const p1 = node.querySelector("#p1").value;
      const p2 = node.querySelector("#p2").value;
      if (!p1 || p1.length < 6) throw new Error("Пароль минимум 6 символов");
      if (p1 !== p2) throw new Error("Пароли не совпадают");

      const { updatePassword } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
      if (!auth.currentUser) throw new Error("Нет пользователя");
      await updatePassword(auth.currentUser, p1);

      notify("ok", "Готово", "Пароль изменён");
      close();
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });
}

/* ===================== Edit modal ===================== */
function openEditModal(ctx) {
  const u = ctx.userDoc || {};
  const stats = u.stats || {};

  const form = document.createElement("div");
  form.innerHTML = `
    <div class="grid" style="gap:12px;">
      <div class="card soft">
        <div class="section-title">Основное</div>
        <div class="hr"></div>

        <div class="label">Ник</div>
        <input class="input" id="dn" />

        <div class="label">Аватар URL</div>
        <input class="input" id="photo" placeholder="https://..." />
        <div class="muted" style="font-size:12px; margin-top:6px;">Можно оставить пустым (будет стандартный).</div>

        <div style="height:10px;"></div>
        <div class="row">
          <div class="muted">Превью:</div>
          <img id="preview" class="avatar" style="width:44px;height:44px;border-radius:14px;" alt="preview">
        </div>
      </div>

      <div class="card soft">
        <div class="section-title">Контакты и время</div>
        <div class="hr"></div>

        <div class="label">Telegram</div>
        <input class="input" id="tg" placeholder="@username или https://t.me/username" />

        <div class="label">Часовой пояс</div>
        <select class="input" id="tz"></select>

        <div class="hr"></div>
        <div class="section-title">Когда обычно онлайн</div>
        <div class="muted" style="font-size:12px;">Для планирования событий</div>
        <div style="height:10px;"></div>

        <div class="row" style="flex-wrap:wrap;">
          <label class="check"><input type="checkbox" id="am"> Утро</label>
          <label class="check"><input type="checkbox" id="day"> День</label>
          <label class="check"><input type="checkbox" id="eve"> Вечер</label>
          <label class="check"><input type="checkbox" id="night"> Ночь</label>
        </div>
      </div>

      <div class="card soft">
        <div class="section-title">Роль и описание</div>
        <div class="hr"></div>

        <div class="label">Специализация</div>
        <select class="input" id="spec"></select>

        <div class="label">О себе / чем полезен</div>
        <textarea class="textarea" id="about" placeholder="Например: активен вечером, могу закрывать охрану, помогаю новичкам..."></textarea>
      </div>

      <div class="card soft">
        <div class="section-title">🎯 Цель на неделю</div>
        <div class="hr"></div>
        <div class="label">Текст цели</div>
        <input class="input" id="goal" placeholder="Например: поднять броню до 900" />
        <div style="height:10px;"></div>
        <label class="check"><input type="checkbox" id="goalDone"> Выполнено</label>
      </div>

      <div class="card soft">
        <div class="section-title">📩 Быстро: вставить стату (TonPrison)</div>
        <div class="muted" style="font-size:12px;">
          Вставь сюда текст сообщения со статой (как в @tonprison_bot). Я распарсю блок «Шмотье» и заполню поля.
        </div>
        <div style="height:10px;"></div>
        <textarea class="textarea" id="tp" placeholder="Вставь текст…"></textarea>
        <div style="height:10px;"></div>
        <button class="btn" id="tpParse" style="width:auto;">Заполнить статы</button>
      </div>

      <div class="card soft">
        <div class="section-title">Статы (0–9999)</div>
        <div class="hr"></div>
        <div id="sf"></div>
        <div class="muted" style="font-size:12px; margin-top:8px;">
          Нужно заполнить все 8 статов, иначе заявка может быть недоступна.
        </div>
      </div>

      <div class="row">
        <button class="btn" id="cancel" style="width:auto;">Отмена</button>
        <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
      </div>
    </div>
  `;

  form.querySelector("#dn").value = u.displayName || "";

  const photo = form.querySelector("#photo");
  const preview = form.querySelector("#preview");
  photo.value = u.photoURL || "";
  preview.src =
    u.photoURL ||
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";

  photo.addEventListener("input", () => {
    const v = photo.value.trim();
    preview.src =
      v ||
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";
  });

  form.querySelector("#tg").value = u.contacts?.telegram || "";

  const tz = form.querySelector("#tz");
  tz.innerHTML =
    `<option value="">—</option>` +
    TZ_LIST.map((x) => `<option value="${escapeAttr(x)}">${escapeHtml(x)}</option>`).join("");
  tz.value = u.timezone || "";

  const av = u.availability || {};
  form.querySelector("#am").checked = !!av.morning;
  form.querySelector("#day").checked = !!av.day;
  form.querySelector("#eve").checked = !!av.evening;
  form.querySelector("#night").checked = !!av.night;

  const spec = form.querySelector("#spec");
  spec.innerHTML = SPEC_LIST.map((x) => `<option value="${escapeAttr(x.value)}">${escapeHtml(x.label)}</option>`).join("");
  spec.value = u.specialization || "none";

  form.querySelector("#about").value = u.about || "";
  form.querySelector("#goal").value = u.weeklyGoal?.text || "";
  form.querySelector("#goalDone").checked = !!u.weeklyGoal?.done;

  const statsForm = buildStatsForm(stats);
  form.querySelector("#sf").appendChild(statsForm);

  form.querySelector("#tpParse").addEventListener("click", () => {
    const text = form.querySelector("#tp").value || "";
    const parsed = parseTonprisonStats(text);
    if (!parsed) {
      notify("bad", "Не получилось", "Не нашёл блок «Шмотье» или не хватает значений");
      return;
    }
    fillStatsForm(statsForm, parsed);
    notify("ok", "Готово", "Поля статов заполнены");
  });

  const close = openModal("Редактирование профиля", form);

  form.querySelector("#cancel").addEventListener("click", close);
  form.querySelector("#save").addEventListener("click", async () => {
    try {
      const displayName = form.querySelector("#dn").value.trim() || "Игрок";
      const photoURL = form.querySelector("#photo").value.trim();
      const telegram = form.querySelector("#tg").value.trim();
      const timezone = form.querySelector("#tz").value || "";
      const specialization = form.querySelector("#spec").value || "none";

      const availability = {
        morning: form.querySelector("#am").checked,
        day: form.querySelector("#day").checked,
        evening: form.querySelector("#eve").checked,
        night: form.querySelector("#night").checked,
      };

      const about = form.querySelector("#about").value.trim();
      const weeklyGoal = {
        text: form.querySelector("#goal").value.trim(),
        done: form.querySelector("#goalDone").checked,
      };

      const v = validateStats(readStatsForm(statsForm));
      if (!v.ok) throw new Error(v.error);

      await updateUserProfile(ctx.uid, {
        displayName,
        photoURL: photoURL || "",
        contacts: { telegram },
        timezone,
		availability,
        specialization,
        about,
        weeklyGoal,
        stats: v.value,
		updatedAt: Date.now(),
      });

      notify("ok", "Сохранено", "Профиль обновлён");
      close();
      location.reload();
    } catch (e) {
      notify("bad", "Ошибка", e.message);
    }
  });
}

/* ===================== Helpers ===================== */
function getStatsFilledState(stats) {
  const keys = ["hp", "energy", "respect", "evasion", "armor", "resistance", "bloodRes", "poisonRes"];
  const missing = keys.filter((k) => Number(stats?.[k] ?? 0) <= 0);
  return { ok: missing.length === 0, missing };
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
  const x = SPEC_LIST.find((s) => s.value === (v || "none"));
  return x ? x.label : "Не указано";
}

function buildTimezones() {
  const out = [];
  for (let i = -12; i <= 14; i++) out.push(`UTC${i >= 0 ? "+" : ""}${i}`);
  return out;
}

function buildProfileText(u, uid) {
  const s = u.stats || {};
  const av = prettyAvailability(u.availability);
  const spec = prettySpec(u.specialization);
  const tg = u.contacts?.telegram || "—";
  const tz = u.timezone || "—";

  return [
    `Профиль: ${u.displayName || "Игрок"}`,
    `UID: ${uid || "—"}`,
    ``,
    `Контакты: ${tg}`,
    `Часовой пояс: ${tz}`,
    `Онлайн: ${av}`,
    `Специализация: ${spec}`,
    u.weeklyGoal?.text ? `Цель: ${u.weeklyGoal.text}${u.weeklyGoal.done ? " (выполнено)" : ""}` : `Цель: —`,
    u.about ? `О себе: ${u.about}` : `О себе: —`,
    ``,
    `Статы:`,
    `HP: ${s.hp ?? 0}`,
    `Энергия: ${s.energy ?? 0}`,
    `Уважение: ${s.respect ?? 0}`,
    `Уклонение: ${s.evasion ?? 0}`,
    `Броня: ${s.armor ?? 0}`,
    `Сопротивление: ${s.resistance ?? 0}`,
    `Сопротивление крови: ${s.bloodRes ?? 0}`,
    `Сопротивление яду: ${s.poisonRes ?? 0}`,
  ].join("\n");
}

function parseTonprisonStats(text) {
  const idx = text.indexOf("Шмотье:");
  if (idx === -1) return null;
  const s = text.slice(idx);

  const getNum = (re) => {
    const m = s.match(re);
    return m ? Number(m[1]) : null;
  };

  const hp = getNum(/Хп-?шка:\s*(\d+)/i);
  const energy = getNum(/Энергия:\s*(\d+)/i);
  const respect = getNum(/Уважение:\s*\+?(\d+)/i);
  const evasion = getNum(/Уклонение:\s*\+?(\d+)/i);
  const armor = getNum(/Броня:\s*(\d+)/i);
  const resistance = getNum(/Сопротивление:\s*(\d+)/i);
  const bloodRes = getNum(/Сопротивление крови:\s*(\d+)/i);
  const poisonRes = getNum(/Сопротивление яду:\s*(\d+)/i);

  if ([hp, energy, respect, evasion, armor, resistance, bloodRes, poisonRes].some((v) => v === null)) return null;
  return { hp, energy, respect, evasion, armor, resistance, bloodRes, poisonRes };
}

function fillStatsForm(statsFormEl, stats) {
  const set = (key, val) => {
    const inp = statsFormEl.querySelector(`[data-key="${key}"]`) || statsFormEl.querySelector(`#${key}`);
    if (inp) inp.value = String(val ?? 0);
  };

  set("hp", stats.hp);
  set("energy", stats.energy);
  set("respect", stats.respect);
  set("evasion", stats.evasion);
  set("armor", stats.armor);
  set("resistance", stats.resistance);
  set("bloodRes", stats.bloodRes);
  set("poisonRes", stats.poisonRes);

  statsFormEl.querySelectorAll("input").forEach((i) => {
    i.dispatchEvent(new Event("input", { bubbles: true }));
    i.dispatchEvent(new Event("change", { bubbles: true }));
  });
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

function fmtDate(ts) {
  if (!ts) return "—";
  const d = ts.toDate ? ts.toDate() : (ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts));
  return d.toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function prettyStatus(s) {
  const map = {
    pending: "На рассмотрении",
    approved: "Одобрено",
    rejected: "Отклонено",
    canceled: "Отменено",
    unknown: "Неизвестно",
  };
  return map[s] || s;
}

function renderAppsHtml(clanApp, eventApps) {
  const clanHtml = clanApp
    ? `
      <div class="stat"><span>Заявка в клан: </span><b>${escapeHtml(prettyStatus(clanApp.status))}</b></div>
      <div class="stat"><span>Дата: </span><b>${escapeHtml(fmtDate(clanApp.createdAt))}</b></div>
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
  if (!list || !list.length) return `<div class="muted">Ты не участвуешь в событиях</div>`;

  return `
    <div class="grid" style="gap:10px;">
      ${list.map(e => `
        <div class="npc-item" style="justify-content:space-between;">
          <div style="display:grid; gap:2px;">
            <div style="font-weight:1000;">${escapeHtml(e.title || "Событие")}</div>
            <div class="muted" style="font-size:12px;">${escapeHtml(fmtDate(e.date))}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <a class="btn" style="width:auto;" href="#events">Открыть</a>
            <button class="btn danger" style="width:auto;" data-leave-event="${escapeAttr(e.id)}">Выйти</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function bindLeaveButtons(host, uid, onDone) {
  host.querySelectorAll("[data-leave-event]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-leave-event");
      if (!id) return;
      try {
        btn.disabled = true;
        await leaveEvent(id, uid);
        notify("ok", "Готово", "Вы вышли из события");
        if (onDone) await onDone();
      } catch (e) {
        notify("bad", "Ошибка", e.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderChatStatsHtml(st) {
  const top = (st.top && st.top.length)
    ? st.top.map(x => `<span class="badge">${escapeHtml(x.emoji)} ${escapeHtml(String(x.count))}</span>`).join(" ")
    : `<span class="muted">нет реакций</span>`;

  return `
    <div class="stat"><span>Сообщений всего: </span><b>${escapeHtml(String(st.total))}</b></div>
    <div class="stat"><span>Сообщений за 7 дней: </span><b>${escapeHtml(String(st.week))}</b></div>
    <div class="hr"></div>
    <div class="muted" style="font-size:12px; margin-bottom:6px;">Топ реакций</div>
    <div style="display:flex; gap:8px; flex-wrap:wrap;">${top}</div>
  `;
}
