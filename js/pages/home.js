// js/pages/home.js
import { getClanInfo, updateClanInfo, listNews, createNews, deleteNews } from "../db.js";
import { notify } from "../notify.js";
import { openModal } from "../ui.js";

export async function renderHome(ctx){
  const [info, news] = await Promise.all([getClanInfo(), listNews()]);

  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const hero = document.createElement("div");
  hero.className = "hero";
  hero.innerHTML = `
    <h1>${escapeHtml(info.title || "13 Блок")}</h1>
    <p>${escapeHtml(info.about || "")}</p>
    <div class="pillbar">
      <div class="pill">Ton Prison (13 BLOCK)</div>
      <div class="pill">Заявка в клан</div>
      <div class="pill">События и чат</div>
    </div>
    <div class="row" style="margin-top:14px;">
      <div class="muted">Главная — информация и новости.</div>
      ${ctx.isAdmin ? `<button class="btn primary" id="editHome">Редактировать</button>` : ``}
    </div>
  `;
  root.appendChild(hero);

  const mid = document.createElement("div");
  mid.className = "grid two";

  const rules = document.createElement("div");
  rules.className = "card";
  rules.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Правила клана</div>
        <div class="card-sub">То, что важно соблюдать</div>
      </div>
      <span class="badge">Инфо</span>
    </div>
    <div class="hr"></div>
    <div style="white-space:pre-wrap; line-height:1.55;">${escapeHtml(info.rules || "")}</div>
  `;

  const how = document.createElement("div");
  how.className = "card soft";
  how.innerHTML = `
    <div class="card-title">Как вступить</div>
    <div class="muted" style="white-space:pre-wrap; line-height:1.55;">
1) Войти
2) «Состав клана» → подать заявку
3) Указать статы героя
4) Дождаться решения админа
    </div>
  `;

  mid.append(rules, how);
  root.appendChild(mid);

  const newsCard = document.createElement("div");
  newsCard.className = "card";
  newsCard.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Новости</div>
        <div class="card-sub">Объявления, планы, важные сообщения</div>
      </div>
      ${ctx.isAdmin ? `<button class="btn primary" id="addNews">Добавить</button>` : ``}
    </div>
    <div class="hr"></div>
    <div id="newsList"></div>
  `;
  root.appendChild(newsCard);

  const list = newsCard.querySelector("#newsList");
  if (!news.length){
    list.innerHTML = `<div class="muted">Новостей пока нет.</div>`;
  } else {
    for (const n of news){
      const item = document.createElement("div");
      item.className = "card soft";
      item.style.marginTop = "10px";
      item.innerHTML = `
        <div class="row">
          <div style="font-weight:1000;">${escapeHtml(n.title || "")}</div>
          ${ctx.isAdmin ? `<button class="btn danger small" data-del="${escapeAttr(n.id)}">Удалить</button>` : ``}
        </div>
        <div class="muted" style="margin-top:6px; white-space:pre-wrap; line-height:1.55;">${escapeHtml(n.text || "")}</div>
        <div class="muted" style="margin-top:8px; font-size:12px;">${escapeHtml(n.createdByName || "")}</div>
      `;
      list.appendChild(item);

      const del = item.querySelector(`[data-del="${n.id}"]`);
      if (del){
        del.addEventListener("click", async ()=>{
          try{
            await deleteNews(n.id);
            notify("warn", "Удалено", "Новость удалена");
            location.reload();
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });
      }
    }
  }

  if (ctx.isAdmin){
    hero.querySelector("#editHome").addEventListener("click", ()=>{
      const form = document.createElement("div");
      form.innerHTML = `
        <div class="label">Название</div>
        <input class="input" id="t" />
        <div class="label">Описание (короткий текст в шапке)</div>
        <textarea class="textarea" id="a"></textarea>
        <div class="label">Правила</div>
        <textarea class="textarea" id="r"></textarea>
        <div class="hr"></div>
        <div class="row">
          <button class="btn" id="cancel">Отмена</button>
          <button class="btn primary" id="save">Сохранить</button>
        </div>
      `;
      form.querySelector("#t").value = info.title || "";
      form.querySelector("#a").value = info.about || "";
      form.querySelector("#r").value = info.rules || "";

      const close = openModal("Редактирование главной страницы", form);
      form.querySelector("#cancel").addEventListener("click", close);
      form.querySelector("#save").addEventListener("click", async ()=>{
        try{
          await updateClanInfo({
            title: form.querySelector("#t").value.trim() || "13 Блок",
            about: form.querySelector("#a").value.trim(),
            rules: form.querySelector("#r").value.trim()
          });
          notify("ok", "Сохранено", "Главная обновлена");
          close();
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    });

    newsCard.querySelector("#addNews").addEventListener("click", ()=>{
      const form = document.createElement("div");
      form.innerHTML = `
        <div class="label">Заголовок</div>
        <input class="input" id="nt" placeholder="Например: Турнир завтра в 20:00" />
        <div class="label">Текст</div>
        <textarea class="textarea" id="nx" placeholder="Детали, требования, что взять..."></textarea>
        <div class="hr"></div>
        <div class="row">
          <button class="btn" id="cancel">Отмена</button>
          <button class="btn primary" id="save">Опубликовать</button>
        </div>
      `;
      const close = openModal("Новая новость", form);
      form.querySelector("#cancel").addEventListener("click", close);
      form.querySelector("#save").addEventListener("click", async ()=>{
        try{
          const title = form.querySelector("#nt").value.trim();
          const text = form.querySelector("#nx").value.trim();
          if (!title) throw new Error("Заголовок обязателен");
          await createNews({
            title,
            text,
            createdByUid: ctx.uid,
            createdByName: ctx.userDoc?.displayName || "Админ"
          });
          notify("ok", "Опубликовано", "Новость добавлена");
          close();
          location.reload();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    });
  }

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
