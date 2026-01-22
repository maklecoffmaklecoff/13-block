// js/pages/profile.js
import { renderStatsKV, openModal, buildStatsForm, readStatsForm } from "../ui.js";
import { validateStats } from "../validators.js";
import { notify } from "../notify.js";
import { updateUserProfile } from "../db.js";
import { auth } from "../firebase.js";
import { linkEmailPassword, changePasswordWithOld, resetPassword } from "../auth.js";

export async function renderProfile(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const providers = (auth.currentUser?.providerData || []).map(p => p.providerId);
  const hasGoogle = providers.includes("google.com");
  const hasPassword = providers.includes("password");
  const emailGuess = auth.currentUser?.email || "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Мой профиль</div>
        <div class="card-sub">Ник + статы (используются в заявках)</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <span class="badge ${hasGoogle ? "ok" : "warn"}">Google</span>
        <span class="badge ${hasPassword ? "ok" : "warn"}">Password</span>
        <button class="btn" id="account" style="width:auto;">Аккаунт</button>
        <button class="btn primary" id="edit" style="width:auto;">Редактировать</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="row">
      <div>
        <div style="font-weight:1000; font-size:18px;">${escapeHtml(ctx.userDoc?.displayName || "Игрок")}</div>
        <div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:6px;">${escapeHtml(ctx.uid)}</div>
      </div>
      <span class="badge ${ctx.isAdmin ? "ok" : ""}">${ctx.isAdmin ? "Админ" : "Пользователь"}</span>
    </div>

    <div class="hr"></div>

    <div class="section-title">Статы</div>
    <div id="stats"></div>
  `;
  card.querySelector("#stats").appendChild(renderStatsKV(ctx.userDoc?.stats || {}));

  card.querySelector("#edit").addEventListener("click", ()=>{
    const form = document.createElement("div");
    form.innerHTML = `
      <div class="label">Ник</div>
      <input class="input" id="dn" />

      <div class="hr"></div>
      <div class="section-title">Статы (0-9999)</div>
      <div id="sf"></div>

      <div class="hr"></div>
      <div class="row">
        <button class="btn" id="cancel" style="width:auto;">Отмена</button>
        <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
      </div>
    `;
    form.querySelector("#dn").value = ctx.userDoc?.displayName || "";
    const statsForm = buildStatsForm(ctx.userDoc?.stats || {});
    form.querySelector("#sf").appendChild(statsForm);

    const close = openModal("Редактирование профиля", form);
    form.querySelector("#cancel").addEventListener("click", close);

    form.querySelector("#save").addEventListener("click", async ()=>{
      try{
        const displayName = form.querySelector("#dn").value.trim() || "Игрок";
        const v = validateStats(readStatsForm(statsForm));
        if (!v.ok) throw new Error(v.error);
        await updateUserProfile(ctx.uid, { displayName, stats: v.value });
        notify("ok","Сохранено","Профиль обновлён");
        close();
        location.reload();
      }catch(e){ notify("bad","Ошибка", e.message); }
    });
  });

  card.querySelector("#account").addEventListener("click", ()=>{
    const panel = document.createElement("div");
    panel.innerHTML = `
      <div class="grid" style="gap:12px;">
        <div class="card soft">
          <div class="section-title">Email</div>
          <div class="muted">${escapeHtml(emailGuess || "не указан")}</div>
        </div>

        <div class="card soft">
          <div class="section-title">Привязать Email/Password</div>
          <div class="label">Email</div>
          <input class="input" id="linkEmail" type="email" value="${escapeAttr(emailGuess)}" />
          <div class="label">Пароль</div>
          <input class="input" id="linkPass" type="password" placeholder="Минимум 6 символов" />
          <div style="height:10px;"></div>
          <button class="btn" id="linkBtn" style="width:auto;">Привязать</button>
        </div>

        <div class="card soft">
          <div class="section-title">Смена пароля</div>
          <div class="label">Email</div>
          <input class="input" id="cpEmail" type="email" value="${escapeAttr(emailGuess)}" />
          <div class="label">Текущий пароль</div>
          <input class="input" id="oldPass" type="password" placeholder="••••••••" />
          <div class="label">Новый пароль</div>
          <input class="input" id="newPass" type="password" placeholder="Минимум 6 символов" />
          <div style="height:10px;"></div>
          <button class="btn primary" id="changeBtn" style="width:auto;">Сменить</button>
        </div>

        <div class="card soft">
          <div class="section-title">Сброс пароля письмом</div>
          <div class="row">
            <input class="input" id="resetEmail" type="email" value="${escapeAttr(emailGuess)}" style="max-width:340px;" />
            <button class="btn" id="resetBtn" style="width:auto;">Отправить</button>
          </div>
        </div>
      </div>
    `;

    const close = openModal("Аккаунт", panel);

    panel.querySelector("#linkBtn").addEventListener("click", async ()=>{
      try{
        const e = panel.querySelector("#linkEmail").value.trim();
        const p = panel.querySelector("#linkPass").value;
        if (!e) throw new Error("Укажите email");
        if (!p || p.length < 6) throw new Error("Пароль минимум 6 символов");
        await linkEmailPassword({ email: e, password: p });
        notify("ok","Готово","Привязано");
        close();
      }catch(err){ notify("bad","Ошибка", err.message); }
    });

    panel.querySelector("#changeBtn").addEventListener("click", async ()=>{
      try{
        const e = panel.querySelector("#cpEmail").value.trim();
        const oldPassword = panel.querySelector("#oldPass").value;
        const newPassword = panel.querySelector("#newPass").value;
        await changePasswordWithOld({ email: e, oldPassword, newPassword });
        notify("ok","Готово","Пароль изменён");
        close();
      }catch(err){ notify("bad","Ошибка", err.message); }
    });

    panel.querySelector("#resetBtn").addEventListener("click", async ()=>{
      try{
        const e = panel.querySelector("#resetEmail").value.trim();
        if (!e) throw new Error("Укажите email");
        await resetPassword(e);
        notify("ok","Готово","Письмо отправлено");
      }catch(err){ notify("bad","Ошибка", err.message); }
    });
  });

  root.appendChild(card);
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
