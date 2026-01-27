// js/pages/home.js
import { getClanInfo, updateClanInfo, listNews, createNews, deleteNews } from "../db.js";
import { notify } from "../notify.js";
import { openModal } from "../ui.js";

export async function renderHome(ctx){
  const root = document.createElement("div");
  root.className = "homew";

  let info, news;
  try{
    [info, news] = await Promise.all([getClanInfo(), listNews()]);
  }catch(e){
    const c = document.createElement("div");
    c.className = "card";
    c.innerHTML = `<div class="card-title">Ошибка</div><div class="muted">${escapeHtml(e?.message || String(e))}</div>`;
    return c;
  }

  info = info || {};
  news = Array.isArray(news) ? news.slice() : [];
  news.sort((a,b)=> String(b.id||"").localeCompare(String(a.id||""))); // newest first

  const state = {
    tab: "rules",       // rules | join
    showAllNews: false, // false -> 6 items
  };

  // Navigation EXACTLY like your header tabs (data-route)
  function go(route){
    const tabs = document.querySelector("#tabs");
    const btn = tabs?.querySelector(`.tab[data-route="${CSS.escape(String(route))}"]`);
    if (!btn){
      notify("warn","Навигация","Не найден маршрут: " + route);
      return;
    }
    btn.click();

    // close mobile dropdown if open
    tabs?.classList.add("collapsed");
    const toggle = document.querySelector("#tabsToggle");
    toggle?.classList.remove("open");
    toggle?.setAttribute("aria-expanded","false");
  }

  function render(){
    root.innerHTML = "";

    // HERO (no account/uid)
    const hero = document.createElement("div");
    hero.className = "homew-hero";
    hero.innerHTML = `
      <div class="homew-heroTop">
        <div style="min-width:0;">
          <h1 class="homew-title">${escapeHtml(info.title || "13 Блок")}</h1>
          <div class="homew-sub">
            ${escapeHtml(info.about || "Добро пожаловать. Здесь новости клана, правила и быстрый доступ к нужным разделам.")}
          </div>
        </div>

        <div class="homew-cta">
          <button class="btn primary" id="ctaEvents" type="button">Открыть события</button>
          <button class="btn" id="ctaRoster" type="button">Состав</button>
          <button class="btn" id="ctaRecipes" type="button">Рецепты</button>
          ${ctx.isAdmin ? `<button class="btn ok" id="ctaEdit" type="button">Редактировать</button>` : ``}
        </div>
      </div>

      <div class="homew-steps">
        <div class="homew-step">
          <div class="n">1</div>
          <div class="t">Заполни профиль</div>
          <div class="d">Ник + базовые параметры. Это ускоряет рассмотрение заявки.</div>
        </div>

        <div class="homew-step">
          <div class="n">2</div>
          <div class="t">Подай заявку</div>
          <div class="d">Раздел «Состав клана» → «Заявка». Дальше — ожидание решения.</div>
          <div class="row"><button class="btn small" id="stepRoster" type="button" style="width:auto;">Открыть «Состав»</button></div>
        </div>

        <div class="homew-step">
          <div class="n">3</div>
          <div class="t">Проверь новости</div>
          <div class="d">Планы, сборы, требования и важные объявления.</div>
          <div class="row"><button class="btn small" id="stepNews" type="button" style="width:auto;">К новостям</button></div>
        </div>
      </div>
    `;
    root.appendChild(hero);

    const grid = document.createElement("div");
    grid.className = "homew-grid";

    // INFO card
    const infoCard = document.createElement("div");
    infoCard.className = "card";
    infoCard.innerHTML = `
      <div class="row">
        <div>
          <div class="card-title">Информация</div>
          <div class="card-sub">правила • вступление</div>
        </div>
        <span class="badge">guide</span>
      </div>
      <div class="hr"></div>

      <div class="homew-tabs">
        <button class="homew-tab ${state.tab==="rules"?"active":""}" data-tab="rules" type="button">Правила</button>
        <button class="homew-tab ${state.tab==="join"?"active":""}" data-tab="join" type="button">Как вступить</button>
      </div>

      <div class="homew-mini" id="infoPane"></div>
    `;
    grid.appendChild(infoCard);

    const infoPane = infoCard.querySelector("#infoPane");
    if (state.tab === "rules"){
      infoPane.innerHTML = `<div style="white-space:pre-wrap; line-height:1.55;">${escapeHtml(info.rules || "Правила пока не заполнены.")}</div>`;
    } else {
      infoPane.innerHTML = `
        <div class="muted" style="white-space:pre-wrap; line-height:1.55;">
1) Войти
2) «Состав клана» → «Заявка в клан»
3) Заполнить профиль (ник + статы)
4) Дождаться решения админа
        </div>
        <div class="hr"></div>
        <div class="row">
          <button class="btn small" id="openRoster2" type="button" style="width:auto;">Открыть «Состав»</button>
        </div>
      `;
    }

    // NEWS card
    const newsCard = document.createElement("div");
    newsCard.className = "card";
    newsCard.innerHTML = `
      <div class="row" id="newsTop">
        <div>
          <div class="card-title">Новости</div>
          <div class="card-sub">объявления и планы</div>
        </div>
        <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
          ${ctx.isAdmin ? `<button class="btn primary" id="addNews" type="button" style="width:auto;">Добавить</button>` : ``}
          <button class="btn" id="toggleNews" type="button" style="width:auto;">${state.showAllNews ? "Свернуть" : "Показать все"}</button>
        </div>
      </div>
      <div class="hr"></div>
      <div class="homew-newsList" id="newsList"></div>
    `;
    grid.appendChild(newsCard);

    root.appendChild(grid);

    // --- binds hero navigation
    hero.querySelector("#ctaEvents").addEventListener("click", ()=> go("events"));
    hero.querySelector("#ctaRoster").addEventListener("click", ()=> go("roster"));
    hero.querySelector("#ctaRecipes").addEventListener("click", ()=> go("recipes"));
    hero.querySelector("#stepRoster").addEventListener("click", ()=> go("roster"));
    hero.querySelector("#stepNews").addEventListener("click", ()=>{
      newsCard.scrollIntoView({ behavior:"smooth", block:"start" });
    });

    // --- binds info tabs
    infoCard.querySelectorAll("[data-tab]").forEach((b)=>{
      b.addEventListener("click", ()=>{
        state.tab = b.getAttribute("data-tab");
        render();
      });
    });
    infoPane.querySelector("#openRoster2")?.addEventListener("click", ()=> go("roster"));

    // --- news list
    const newsList = newsCard.querySelector("#newsList");
    const shown = state.showAllNews ? news : news.slice(0, 6);

    if (!shown.length){
      newsList.innerHTML = `<div class="muted">Новостей пока нет.</div>`;
    } else {
      newsList.innerHTML = shown.map((n)=>`
        <div class="homew-newsItem">
          <div class="row">
            <div class="tt">${escapeHtml(n.title || "")}</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
              <button class="btn small" data-open="${escapeAttr(n.id)}" type="button" style="width:auto;">Открыть</button>
              ${ctx.isAdmin ? `<button class="btn danger small" data-del="${escapeAttr(n.id)}" type="button" style="width:auto;">Удалить</button>` : ``}
            </div>
          </div>
          <div class="tx clamp2">${escapeHtml(n.text || "")}</div>
        </div>
      `).join("");

      newsList.querySelectorAll("[data-open]").forEach((b)=>{
        b.addEventListener("click", ()=>{
          const id = b.getAttribute("data-open");
          const n = news.find(x=>String(x.id)===String(id));
          if (!n) return;
          const node = document.createElement("div");
          node.innerHTML = `
            <div style="font-weight:1000; font-size:16px;">${escapeHtml(n.title || "")}</div>
            <div class="hr"></div>
            <div class="muted" style="white-space:pre-wrap; line-height:1.55;">${escapeHtml(n.text || "")}</div>
          `;
          openModal("Новость", node);
        });
      });

      newsList.querySelectorAll("[data-del]").forEach((b)=>{
        b.addEventListener("click", async ()=>{
          const id = b.getAttribute("data-del");
          try{
            await deleteNews(id);
            const idx = news.findIndex(x=>String(x.id)===String(id));
            if (idx >= 0) news.splice(idx, 1);
            notify("warn","Удалено","Новость удалена");
            render();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });
      });
    }

    newsCard.querySelector("#toggleNews").addEventListener("click", ()=>{
      state.showAllNews = !state.showAllNews;
      render();
    });

    // --- admin: edit home
    if (ctx.isAdmin){
      hero.querySelector("#ctaEdit").addEventListener("click", ()=>{
        const form = document.createElement("div");
        form.innerHTML = `
          <div class="label">Название</div>
          <input class="input" id="t" />
          <div class="label">Описание (приветствие)</div>
          <textarea class="textarea" id="a"></textarea>
          <div class="label">Правила</div>
          <textarea class="textarea" id="r"></textarea>
          <div class="hr"></div>
          <div class="row">
            <button class="btn" id="cancel" type="button" style="width:auto;">Отмена</button>
            <button class="btn primary" id="save" type="button" style="width:auto;">Сохранить</button>
          </div>
        `;
        form.querySelector("#t").value = info.title || "";
        form.querySelector("#a").value = info.about || "";
        form.querySelector("#r").value = info.rules || "";

        const close = openModal("Редактирование главной", form);
        form.querySelector("#cancel").addEventListener("click", close);
        form.querySelector("#save").addEventListener("click", async ()=>{
          try{
            const next = {
              title: form.querySelector("#t").value.trim() || "13 Блок",
              about: form.querySelector("#a").value.trim(),
              rules: form.querySelector("#r").value.trim()
            };
            await updateClanInfo(next);
            info = next;
            notify("ok","Сохранено","Главная обновлена");
            close();
            render();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });
      });

      // admin: add news
      newsCard.querySelector("#addNews")?.addEventListener("click", ()=>{
        const form = document.createElement("div");
        form.innerHTML = `
          <div class="label">Заголовок</div>
          <input class="input" id="nt" />
          <div class="label">Текст</div>
          <textarea class="textarea" id="nx"></textarea>
          <div class="hr"></div>
          <div class="row">
            <button class="btn" id="cancel" type="button" style="width:auto;">Отмена</button>
            <button class="btn primary" id="save" type="button" style="width:auto;">Опубликовать</button>
          </div>
        `;
        const close = openModal("Новая новость", form);
        form.querySelector("#cancel").addEventListener("click", close);
        form.querySelector("#save").addEventListener("click", async ()=>{
          try{
            const title = form.querySelector("#nt").value.trim();
            const text = form.querySelector("#nx").value.trim();
            if (!title) throw new Error("Заголовок обязателен");

            const payload = {
              title,
              text,
              createdByUid: ctx.uid,
              createdByName: ctx.userDoc?.displayName || "Админ"
            };

            const created = await createNews(payload);
            const id = created?.id || created || String(Date.now());
            news.unshift({ id, ...payload });

            notify("ok","Опубликовано","Новость добавлена");
            close();
            render();
          }catch(e){ notify("bad","Ошибка", e.message); }
        });
      });
    }
  }

  render();
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
