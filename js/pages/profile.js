// js/pages/profile.js
import { renderStatsKV, openModal, buildStatsForm, readStatsForm } from "../ui.js";
import { validateStats } from "../validators.js";
import { notify } from "../notify.js";
import { updateUserProfile } from "../db.js";

export async function renderProfile(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const view = document.createElement("div");
  view.className = "card";
  view.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Мой профиль</div>
        <div class="card-sub">Просмотр информации</div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        <span class="badge ${ctx.isAdmin ? "ok" : ""}">${ctx.isAdmin ? "Админ" : "Пользователь"}</span>
        <button class="btn primary" id="edit">Редактировать</button>
      </div>
    </div>

    <div class="hr"></div>

    <div class="row">
      <div>
        <div class="section-title">Ник</div>
        <div style="font-weight:1000; font-size:18px;">${escapeHtml(ctx.userDoc?.displayName || "Игрок")}</div>
        <div class="muted" style="font-family:var(--mono); font-size:12px; margin-top:6px;">${escapeHtml(ctx.uid)}</div>
      </div>
    </div>

    <div class="hr"></div>

    <div class="section-title">Статы героя</div>
    <div id="stats"></div>
  `;
  view.querySelector("#stats").appendChild(renderStatsKV(ctx.userDoc?.stats || {}));

  view.querySelector("#edit").addEventListener("click", ()=>{
    const form = document.createElement("div");
    form.innerHTML = `
      <div class="label">Никнейм</div>
      <input class="input" id="dn" />

      <div class="hr"></div>
      <div class="section-title">Статы (0-9999)</div>
      <div id="sf"></div>

      <div class="hr"></div>
      <div class="row">
        <button class="btn" id="cancel">Отмена</button>
        <button class="btn primary" id="save">Сохранить</button>
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
        notify("ok", "Сохранено", "Профиль обновлён");
        close();
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  });

  root.appendChild(view);

  const hint = document.createElement("div");
  hint.className = "card soft";
  hint.innerHTML = `
    <div class="card-title">Подсказка</div>
    <div class="muted" style="white-space:pre-wrap; line-height:1.55;">
• Эти статы используются для заявок в клан и события
    </div>
  `;
  root.appendChild(hint);

  return root;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
