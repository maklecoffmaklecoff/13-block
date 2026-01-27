// js/pages/admin.js
import { notify } from "../notify.js";
import { openModal } from "../ui.js";
import {
  listMembers, removeMember,
  listNews, deleteNews,
  listEvents, deleteEvent,
  setChatMute, setChatBan,
  searchUsersByNamePrefix, getUser, setUserRole,
  listRecipes, upsertRecipe, deleteRecipe
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
  <button data-tab="recipes">Рецепты</button>
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


if (tab === "recipes"){
  const RARITY = [
    { key: "gray", label: "Серая" },
    { key: "green", label: "Зелёная" },
    { key: "blue", label: "Синяя" },
    { key: "purple", label: "Фиолетовая" },
  ];

  // ВАЖНО: тут должны быть те же ключи, что использует recipes.js (metal/rags/...)
  // Сейчас у тебя в recipes.js RES ключи латиницей: metal, rags, nails...
  const RES_MAP = [
  { key: "metal",  label: "Металл" },
  { key: "rags",   label: "Тряпки" },
  { key: "nails",  label: "Гвозди" },
  { key: "soap",   label: "Мыло" },
  { key: "rope",   label: "Верёвки" },
  { key: "planks", label: "Доски" },
  { key: "blades", label: "Лезвия" },
];

const resLabel = (k)=> (RES_MAP.find(r => r.key === k)?.label) || k;


const baseKeyOf = (r)=>{
  // 1) нормализуем по id: kamen_na_verevke2 -> kamen_na_verevke
  const id = String(r?.id || "").toLowerCase();
  const idKey = id.replace(/[_-]?\d+$/g, "");

  // 2) нормализуем по имени: "Камень на веревке (Синяя)" -> "Камень на веревке"
  const name = String(r?.name || "").trim();
  const nameKey = name.replace(/\s*$(серый|серая|зел[её]ный|зел[её]ная|син[иия]й|син[иия]я|фиолетов(ый|ая)|gray|green|blue|purple)$\s*/ig, "").trim();

  return idKey || nameKey || id || name || "";
};


  const normalizeId = (s)=> String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  const clampQty = (x)=>{
    const n = Number(x);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.floor(n);
  };

  const safeTypeLabel = (t)=>{
    if (t === "weapon") return "Оружие";
    if (t === "consumable") return "Расходники";
    if (t === "other") return "Прочее";
    return t || "—";
  };

  let all = await listRecipes();

  pane.innerHTML = `
    <div class="card soft">
      <div class="row" style="align-items:flex-end; flex-wrap:wrap;">
        <div style="min-width:240px; flex:1;">
          <div class="section-title">Рецепты (${all.length})</div>
          <div class="muted" style="font-size:12px;">
            Добавление • редактирование • удаление • быстрый поиск
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input class="input" id="rq" placeholder="поиск (название или id)..." style="max-width:280px;" />
          <select class="input" id="sort" style="max-width:180px;">
            <option value="name">Сорт: name</option>
            <option value="id">Сорт: id</option>
            <option value="type">Сорт: type</option>
          </select>
          <button class="btn primary" id="new" style="width:auto;">Новый рецепт</button>
        </div>
      </div>

      <div class="hr"></div>

<div class="adm-scroll" style="max-height: calc(100dvh - 320px); overflow:auto; border-radius: 14px;">
  <table class="table">
    <thead>
      <tr>
        <th style="width:32%;">Название</th>
        <th style="width:18%;">ID</th>
        <th style="width:18%;">Тип</th>
        <th style="width:12%;">Редкость</th>
        <th style="width:20%;">Действия</th>
      </tr>
    </thead>
    <tbody id="rt"></tbody>
  </table>
</div>

  `;

  const rq = pane.querySelector("#rq");
  const sortEl = pane.querySelector("#sort");
  const tbody = pane.querySelector("#rt");

  const refreshAll = async ()=>{
    all = await listRecipes();
  };

  const copyText = async (txt)=>{
    try{
      await navigator.clipboard.writeText(String(txt || ""));
      notify("ok","Скопировано","ID в буфере обмена");
    }catch{
      // fallback
      const ta = document.createElement("textarea");
      ta.value = String(txt || "");
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      notify("ok","Скопировано","ID в буфере обмена");
    }
  };

  const openEditor = (existing, { duplicate = false } = {})=>{
    const isEdit = !!existing && !duplicate;

const init = existing ? {
  id: existing.id || "",
  name: existing.name || "",
  type: existing.type || "weapon",
  rarity: existing.rarity || "",
  icon: existing.icon || "",
  notes: existing.notes || "",
  hidden: !!existing.hidden, // NEW: hide from craft catalog
  ingredients: Array.isArray(existing.ingredients) ? existing.ingredients : [],
} : {
  id: "",
  name: "",
  type: "weapon",
  rarity: "gray",
  icon: "",
  notes: "",
  hidden: false,            // NEW
  ingredients: [],
};


    // If duplicating: clear id (force new) but keep content
    if (duplicate){
      init.id = "";
      init.name = init.name ? `${init.name} (копия)` : "";
    }

    const node = document.createElement("div");
    node.style.maxWidth = "980px";

    node.innerHTML = `
      <div class="formgrid">
        <div class="card soft" style="padding:12px;">
          <div style="font-weight:1000;" id="pvTitle">Предпросмотр</div>
          <div class="muted" style="font-size:12px;" id="pvSub">—</div>
        </div>

        <div>
          <div class="label">ID (doc id)</div>
          <input class="input" id="id" placeholder="например bird_song"
            value="${escapeAttr(init.id)}" ${isEdit ? "disabled" : ""} />
          <div class="muted" style="margin-top:6px;">
          </div>
        </div>

        <div>
          <div class="label">Название</div>
          <input class="input" id="name" placeholder="Птичье пение" value="${escapeAttr(init.name)}" />
        </div>

        <div>
          <div class="label">Тип</div>
          <select class="input" id="type">
            <option value="weapon" ${init.type==="weapon"?"selected":""}>Оружие</option>
            <option value="consumable" ${init.type==="consumable"?"selected":""}>Расходники</option>
            <option value="other" ${init.type==="other"?"selected":""}>Прочее</option>
          </select>
          <div class="muted" style="margin-top:6px;">
            Для расходников редкость не нужна.
          </div>
        </div>

        <div id="rarWrap">
          <div class="label">Редкость</div>
          <select class="input" id="rarity">
            <option value="">— нет —</option>
            ${RARITY.map(r=>`<option value="${r.key}" ${init.rarity===r.key?"selected":""}>${r.label}</option>`).join("")}
          </select>
        </div>
		
		<label class="check" style="grid-column:1/-1;">
		<input type="checkbox" id="hidden" ${init.hidden ? "checked" : ""} />
		<span>Скрыть из каталога крафта (на предмет можно ссылаться в ингредиентах)</span>
		</label>


        <div style="grid-column:1/-1;">
          <div class="label">Icon (путь)</div>
          <input class="input" id="icon" placeholder="imagesRecept/bird_song.png" value="${escapeAttr(init.icon)}" />
        </div>

        <div style="grid-column:1/-1;">
          <div class="label">Заметка</div>
          <textarea class="textarea" id="notes" placeholder="совет клана...">${escapeHtml(init.notes)}</textarea>
        </div>

        <div style="grid-column:1/-1;">
          <div class="row">
            <div class="section-title" style="margin:0;">Ингредиенты</div>
            <button class="btn small" id="addRes" style="width:auto;">+ Ресурс</button>
            <button class="btn small" id="addItem" style="width:auto;">+ Предмет</button>
          </div>
          <div class="hr"></div>
          <div id="ings"></div>
        </div>

        <div class="hr" style="grid-column:1/-1;"></div>

        <div class="row" style="grid-column:1/-1;">
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${isEdit ? `<button class="btn danger" id="del" style="width:auto;">Удалить</button>` : ``}
            ${existing ? `<button class="btn" id="dup" style="width:auto;">Дублировать</button>` : ``}
          </div>
          <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
        </div>
      </div>
    `;

    const close = openModal(isEdit ? "Рецепт: редактирование" : "Рецепт: новый", node);

    const ingredients = Array.isArray(init.ingredients) ? structuredClone(init.ingredients) : [];
    const ings = node.querySelector("#ings");

    const updateRarityVisibility = ()=>{
      const t = node.querySelector("#type").value;
      const wrap = node.querySelector("#rarWrap");
      if (t === "consumable"){
        wrap.style.display = "none";
      } else {
        wrap.style.display = "";
      }
    };

    const updatePreview = ()=>{
      const name = node.querySelector("#name").value.trim() || "Без названия";
      const id = node.querySelector("#id").value.trim() || normalizeId(name) || "—";
      const type = node.querySelector("#type").value;
      const rarity = node.querySelector("#rarity")?.value || "";

      const pvTitle = node.querySelector("#pvTitle");
      const pvSub = node.querySelector("#pvSub");

      pvTitle.textContent = name;
      if (type === "consumable"){
        pvSub.textContent = `${id} • ${safeTypeLabel(type)}`;
      } else {
        pvSub.textContent = `${id} • ${safeTypeLabel(type)}${rarity ? " • " + rarity : ""}`;
      }
    };

    const renderIngs = ()=>{
      ings.innerHTML = "";

      if (!ingredients.length){
        ings.innerHTML = `<div class="muted">Нет ингредиентов</div>`;
        return;
      }

      ingredients.forEach((it, idx)=>{
        const box = document.createElement("div");
        box.className = "card soft";
        box.style.padding = "10px";
        box.style.marginBottom = "10px";

        if (it.kind === "resource"){
          box.innerHTML = `
            <div class="row" style="align-items:flex-end; flex-wrap:wrap;">
              <div style="min-width:180px; flex:1;">
                <div class="label">Ресурс</div>
<select class="input" data-k="key">
  ${RES_MAP.map(r=>`
    <option value="${escapeAttr(r.key)}" ${String(it.key)===r.key?"selected":""}>
      ${escapeHtml(r.label)} (${escapeHtml(r.key)})
    </option>
  `).join("")}
</select>

              </div>

              <div style="min-width:140px;">
                <div class="label">Кол-во</div>
                <input class="input" data-k="qty" type="number" min="1" step="1"
                  value="${escapeAttr(String(it.qty ?? 1))}" />
              </div>

              <button class="btn danger small" data-del style="width:auto;">Удалить</button>
            </div>
          `;
        } else {
          box.innerHTML = `
            <div class="row" style="align-items:flex-end; flex-wrap:wrap;">
              <div style="min-width:220px; flex:1;">
                <div class="label">Предмет (recipeId)</div>
                <select class="input" data-k="recipeId">
                  <option value="">— выбери —</option>
                  ${all.map(r=>`<option value="${escapeAttr(r.id)}" ${String(it.recipeId)===r.id?"selected":""}>${escapeHtml(r.name || r.id)} (${escapeHtml(r.id)})</option>`).join("")}
                </select>
                <div class="muted" style="margin-top:6px;">Можно ссылаться на другой рецепт.</div>
              </div>

              <div style="min-width:140px;">
                <div class="label">Кол-во</div>
                <input class="input" data-k="qty" type="number" min="1" step="1"
                  value="${escapeAttr(String(it.qty ?? 1))}" />
              </div>

              <button class="btn danger small" data-del style="width:auto;">Удалить</button>
            </div>
          `;
        }

        box.querySelector("[data-del]").addEventListener("click", ()=>{
          ingredients.splice(idx, 1);
          renderIngs();
        });

        box.querySelectorAll("[data-k]").forEach((el)=>{
          const k = el.getAttribute("data-k");
          const upd = ()=>{
            if (k === "qty") it.qty = clampQty(el.value);
            else it[k] = String(el.value || "").trim();
          };
          el.addEventListener("input", upd);
          el.addEventListener("change", upd);
        });

        ings.appendChild(box);
      });
    };

    renderIngs();
    updateRarityVisibility();
    updatePreview();

    node.querySelector("#name").addEventListener("input", updatePreview);
    node.querySelector("#id").addEventListener("input", updatePreview);
    node.querySelector("#type").addEventListener("change", ()=>{
      updateRarityVisibility();
      updatePreview();
    });
    node.querySelector("#rarity")?.addEventListener("change", updatePreview);

    node.querySelector("#addRes").addEventListener("click", ()=>{
      ingredients.push({ kind: "resource", key: "metal", qty: 1 });
      renderIngs();
    });
    node.querySelector("#addItem").addEventListener("click", ()=>{
      ingredients.push({ kind: "item", recipeId: "", qty: 1 });
      renderIngs();
    });

    node.querySelector("#dup")?.addEventListener("click", ()=>{
      close();
      openEditor(existing, { duplicate: true });
    });

    node.querySelector("#save").addEventListener("click", async ()=>{
      try{
        const name = node.querySelector("#name").value.trim();
        if (!name) throw new Error("Укажи название");

        let id = node.querySelector("#id").value.trim();
        if (!id) id = normalizeId(name);
        if (!id) throw new Error("Не удалось сформировать ID");

        if (!isEdit && all.some(r => r.id === id)) throw new Error("Такой ID уже существует");

        const type = node.querySelector("#type").value;
        const rarity = (type === "consumable") ? "" : (node.querySelector("#rarity")?.value || "");

        const payload = {
          name,
          type,
          rarity,
		  hidden: !!node.querySelector("#hidden")?.checked, // NEW
          icon: node.querySelector("#icon").value.trim(),
          notes: node.querySelector("#notes").value || "",
          ingredients: ingredients.map((it)=>{
            if (it.kind === "resource"){
              const key = String(it.key || "").trim();
				if (!key) return null;
				return { kind: "resource", key, qty: clampQty(it.qty) };

            }
            return { kind: "item", recipeId: String(it.recipeId || "").trim(), qty: clampQty(it.qty) };
          }).filter((it)=> it.kind === "resource" ? !!it.key : !!it.recipeId),
        };

        await upsertRecipe(id, payload);
        notify("ok","Готово","Рецепт сохранён");
        close();

        await refreshAll();
        renderTable();
      }catch(e){
        notify("bad","Ошибка", e.message);
      }
    });

    node.querySelector("#del")?.addEventListener("click", async ()=>{
      try{
        const id = existing?.id;
        if (!id) return;

        const typed = prompt(`Подтверди удаление. Введи ID рецепта:\n${id}`, "");
        if (typed !== id) return;

        await deleteRecipe(id);
        notify("warn","Удалено","Рецепт удалён");
        close();

        await refreshAll();
        renderTable();
      }catch(e){
        notify("bad","Ошибка", e.message);
      }
    });
  };


const renderTable = ()=>{
  const q = (rq.value || "").toLowerCase().trim();
  const sort = sortEl.value;

  // сначала фильтруем по поиску
  let list = all.slice();
  if (q){
    list = list.filter(r=>{
      return String(r.name || "").toLowerCase().includes(q) || String(r.id || "").toLowerCase().includes(q);
    });
  }

  // группируем: baseKey -> items
  const groups = new Map();
  for (const r of list){
    const k = baseKeyOf(r) || r.id;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  // сортировка групп
  const groupKeys = Array.from(groups.keys()).sort((a,b)=>a.localeCompare(b, "ru"));

  // сортировка внутри группы
  const RARITY_ORDER = { gray: 1, green: 2, blue: 3, purple: 4 };
  for (const k of groupKeys){
    const items = groups.get(k);
    items.sort((a,b)=>{
      if (sort === "id") return String(a.id||"").localeCompare(String(b.id||""));
      if (sort === "type") return String(a.type||"").localeCompare(String(b.type||""));
      if (sort === "name"){
        // name + rarity order as secondary (so variants идут по редкости)
        const nn = String(a.name||"").localeCompare(String(b.name||""));
        if (nn !== 0) return nn;
        return (RARITY_ORDER[a.rarity] || 99) - (RARITY_ORDER[b.rarity] || 99);
      }
      return 0;
    });
  }

  tbody.innerHTML = groupKeys.length ? "" : `<tr><td colspan="5" class="muted">Нет рецептов</td></tr>`;

  const makeVariantRow = (r)=>{
    const isConsumable = (r.type === "consumable");
    const rarityCell = isConsumable ? `<span class="muted">—</span>` : escapeHtml(r.rarity || "—");

    const tr = document.createElement("tr");
    tr.className = "adm-rec-var";
    tr.innerHTML = `
      <td style="font-weight:800;">${escapeHtml(r.name || "")}${r.hidden ? ` <span class="badge warn">hidden</span>` : ``}</td>
      <td class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(r.id)}</td>
      <td>${escapeHtml(safeTypeLabel(r.type))}</td>
      <td>${rarityCell}</td>
      <td>
        <div class="row" style="justify-content:flex-end;">
          <button class="btn small" data-copy="${escapeAttr(r.id)}" style="width:auto;">ID</button>
          <button class="btn small" data-dup="${escapeAttr(r.id)}" style="width:auto;">Дубль</button>
          <button class="btn small" data-edit="${escapeAttr(r.id)}" style="width:auto;">Править</button>
          <button class="btn danger small" data-del="${escapeAttr(r.id)}" style="width:auto;">Удалить</button>
        </div>
      </td>
    `;

    tr.querySelector(`[data-copy="${r.id}"]`).addEventListener("click", ()=> copyText(r.id));
    tr.querySelector(`[data-dup="${r.id}"]`).addEventListener("click", ()=> openEditor(r, { duplicate: true }));
    tr.querySelector(`[data-edit="${r.id}"]`).addEventListener("click", ()=> openEditor(r));
    tr.querySelector(`[data-del="${r.id}"]`).addEventListener("click", async ()=>{
      try{
        const typed = prompt(`Подтверди удаление. Введи ID рецепта:\n${r.id}`, "");
        if (typed !== r.id) return;
        await deleteRecipe(r.id);
        notify("warn","Удалено","Рецепт удалён");
        await refreshAll();
        renderTable();
      }catch(e){
        notify("bad","Ошибка", e.message);
      }
    });

    return tr;
  };

  for (const gk of groupKeys){
    const items = groups.get(gk) || [];
    const head = items[0];

    // строка-заголовок группы
    const trH = document.createElement("tr");
    trH.className = "adm-rec-group";
    trH.setAttribute("data-group", gk);

    // красивое имя группы: берём из name без "(...)" если есть
    const groupTitle = String(head?.name || gk)
      .replace(/\s*$(серый|серая|зел[её]ный|зел[её]ная|син[иия]й|син[иия]я|фиолетов(ый|ая)|gray|green|blue|purple)$\s*/ig, "")
      .trim() || gk;

    trH.innerHTML = `
      <td colspan="5">
        <button class="btn small" data-toggle="${escapeAttr(gk)}" style="width:100%; justify-content:space-between;">
          <span style="display:flex; gap:10px; align-items:center;">
            <span class="badge">${items.length}</span>
            <span style="font-weight:1000;">${escapeHtml(groupTitle)}</span>
            <span class="muted" style="font-size:12px;">${escapeHtml(safeTypeLabel(head?.type))}</span>
          </span>
          <span class="muted" data-arrow>▼</span>
        </button>
      </td>
    `;
    tbody.appendChild(trH);

    // варианты (по умолчанию свернуты)
    items.forEach((r)=>{
      const tr = makeVariantRow(r);
      tr.style.display = "none";
      tr.setAttribute("data-parent", gk);
      tbody.appendChild(tr);
    });

    trH.querySelector(`[data-toggle="${gk}"]`).addEventListener("click", ()=>{
      const open = trH.classList.toggle("open");
      const arrow = trH.querySelector("[data-arrow]");
      if (arrow) arrow.textContent = open ? "▲" : "▼";

      tbody.querySelectorAll(`tr[data-parent="${CSS.escape(gk)}"]`).forEach((row)=>{
        row.style.display = open ? "" : "none";
      });
    });
  }
};


  pane.querySelector("#new").addEventListener("click", ()=> openEditor(null));
  rq.addEventListener("input", ()=>{
    clearTimeout(rq._t);
    rq._t = setTimeout(renderTable, 150);
  });
  sortEl.addEventListener("change", renderTable);

  renderTable();
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
