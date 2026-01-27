// js/pages/recipes.js
import { listRecipes, upsertRecipe } from "../db.js";
import { notify } from "../notify.js";
import { openModal } from "../ui.js";

const LS_INV = "recipes.inventory.v1";
const LS_LAST = "recipes.lastViewed.v1";
const LS_RECENT = "recipes.recent.v1";

const RARITY = [
  { key: "gray", label: "⚪️" },
  { key: "green", label: "🟢" },
  { key: "blue", label: "🔵" },
  { key: "purple", label: "🟣" },
];

const RES = {
  metal:  { label: "Металл",  icon: "imagesRecept/metall.png" },
  rags:   { label: "Тряпки",  icon: "imagesRecept/tryapki.png" },
  nails:  { label: "Гвозди",  icon: "imagesRecept/gvozdi.png" },
  soap:   { label: "Мыло",    icon: "imagesRecept/milo.png" },
  rope:   { label: "Верёвки", icon: "imagesRecept/verevki.png" },
  planks: { label: "Доски",   icon: "imagesRecept/doski.png" },
  blades: { label: "Лезвия",  icon: "imagesRecept/lezvie.png" },
};

const RARITY_ORDER = { gray: 1, green: 2, blue: 3, purple: 4 };

function rarityLabel(r){ return (RARITY.find(x=>x.key===r)?.label) || r || "—"; }
function normalizeSearch(s){ return String(s || "").toLowerCase().trim(); }
function clampQty(x){
  const n = Number(x);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function loadInv(){
  try { return JSON.parse(localStorage.getItem(LS_INV) || "{}") || {}; }
  catch { return {}; }
}
function saveInv(inv){
  localStorage.setItem(LS_INV, JSON.stringify(inv || {}));
}

function iconBox(src, alt){
  const safe = String(src || "");
  const a = escapeHtml(alt || "");
  const data = escapeHtml(safe);
  return `<div class="rcp-icoBox" role="img" aria-label="${a}" data-src="${data}"></div>`;
}

function applyIconBoxes(scope){
  scope.querySelectorAll(".rcp-icoBox").forEach((el)=>{
    const src = el.getAttribute("data-src") || "";
    if (!src){
      el.classList.add("is-missing");
      return;
    }
    const imgSet = `image-set(url("${src}") 1x, url("${src}") 2x)`;
    if (typeof CSS !== "undefined" && CSS.supports && CSS.supports("background-image", imgSet)){
      el.style.backgroundImage = imgSet;
    } else {
      el.style.backgroundImage = `url("${src}")`;
    }
  });
}

function keyLabel(k){ return RES[k]?.label || k; }

function rarityClassFor(r){
  if (!r || r.type === "consumable" || !r.rarity) return "";
  return `rar-${String(r.rarity)}`;
}
function rarityDot(r){
  const key = String(r || "");
  return `<span class="rcp-dot r-${escapeHtml(key)}" title="${escapeHtml(rarityLabel(key))}"></span>`;
}

function baseNameOf(r){
  // удаляем " (gray)" / "(Синяя)" / "(фиолетовая)" и т.п.
  const name = String(r?.name || r?.id || "");
  return name
    .replace(/\s*$(серый|серая|зел[её]ный|зел[её]ная|син[иия]й|син[иия]я|фиолетов(ый|ая)|gray|green|blue|purple)$\s*/ig, "")
    .trim();
}

function sumBaseResources(recipeId, recipesById, mult = 1, visiting = new Set()){
  const r = recipesById.get(recipeId);
  if (!r) return {};
  if (visiting.has(recipeId)) return {};
  visiting.add(recipeId);

  const out = {};
  const ing = Array.isArray(r.ingredients) ? r.ingredients : [];

  for (const it of ing){
    const qty = clampQty(it.qty) * mult;
    if (!qty) continue;

    if (it.kind === "resource"){
      const k = String(it.key || "");
      if (!k) continue;
      out[k] = (out[k] || 0) + qty;
      continue;
    }

    if (it.kind === "item"){
      const childId = String(it.recipeId || "");
      if (!childId) continue;
      const childSum = sumBaseResources(childId, recipesById, qty, visiting);
      for (const k of Object.keys(childSum)){
        out[k] = (out[k] || 0) + childSum[k];
      }
    }
  }

  visiting.delete(recipeId);
  return out;
}

function getSampleRecipes(){
  return [
    {
      id: "staff_gray",
      name: "Посох",
      type: "weapon",
      rarity: "gray",
      icon: "imagesRecept/Посох.png",
      ingredients: [
        { kind: "resource", key: "metal", qty: 120 },
        { kind: "resource", key: "rags", qty: 220 },
      ],
      notes: "",
    },
  ];
}

export async function renderRecipes(ctx){
  const root = document.createElement("div");
  root.className = "recipes-page";

  const state = {
    recipes: [],
    recipesById: new Map(),
    hist: [],
    histIdx: -1,
    q: "",
    rar: "",
	catType: "", // "", weapon, consumable, other
    selected: null,
  };

  function updateNav(){
    const backBtn = root.querySelector("#back");
    const fwdBtn = root.querySelector("#fwd");
    if (!backBtn || !fwdBtn) return;
    backBtn.disabled = state.histIdx <= 0;
    fwdBtn.disabled = state.histIdx >= state.hist.length - 1;
  }

  function pushHist(id){
    state.hist = state.hist.slice(0, state.histIdx + 1);
    state.hist.push(id);
    state.histIdx = state.hist.length - 1;
    localStorage.setItem(LS_LAST, id);
    updateNav();
  }

  function setSelectedInCatalog(recipeId){
    const grid = root.querySelector("#grid");
    if (!grid) return;
    grid.querySelectorAll(".rcp-variant.active").forEach(x=>x.classList.remove("active"));
    const btn = grid.querySelector(`.rcp-variant[data-recipe="${CSS.escape(recipeId)}"]`);
    if (btn){
      btn.classList.add("active");
      btn.scrollIntoView({ block: "nearest" });
    }
  }

  function filterRecipes(){
    const q = normalizeSearch(state.q);
    const rar = state.rar || "";

    let list = state.recipes.slice();

    // скрытые не показываем в каталоге
    list = list.filter(r => !r.hidden);

    if (rar) list = list.filter(r => r.rarity === rar);

    if (q){
      list = list.filter(r => {
        const name = normalizeSearch(r.name);
        const id = normalizeSearch(r.id);
        return name.includes(q) || id.includes(q);
      });
    }
	
	const catType = state.catType || "";
	if (catType) list = list.filter(r => r.type === catType);


    list.sort((a,b)=>{
      const an = baseNameOf(a).localeCompare(baseNameOf(b), "ru");
      if (an !== 0) return an;
      return (RARITY_ORDER[a.rarity] || 99) - (RARITY_ORDER[b.rarity] || 99);
    });

    return list;
  }

  function renderShell(){
    root.innerHTML = `
      <div class="card">
        <div class="row" style="align-items:flex-start;">
          <div>
            <div class="card-title">Рецепты</div>
            <div class="card-sub">Каталог • просмотр цепочек</div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn" id="invBtn" style="width:auto;">Мои ресурсы</button>
            ${ctx.isAdmin ? `<button class="btn" id="seedBtn" style="width:auto;">Админ: загрузить шаблон</button>` : ``}
          </div>
        </div>

        <div class="hr"></div>

        <div class="rcp-controls">
          <input class="input" id="q" placeholder="Поиск (название или id)..." />
          <select class="input" id="rar">
            <option value="">Редкость: все</option>
            ${RARITY.map(r=>`<option value="${r.key}">${r.label}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="rcp-layout">
        <div class="card rcp-left">
          <div class="row">
            <div class="section-title">Каталог</div>
            <span class="badge" id="cnt">0</span>
          </div>
<div class="hr"></div>

<div class="rcp-chipbar" style="margin-bottom:10px;">
  <button class="rcp-chip" id="chipAll" type="button">Все</button>
  <button class="rcp-chip" id="chipWeapon" type="button">Оружие</button>
  <button class="rcp-chip" id="chipCons" type="button">Расходники</button>
  <button class="rcp-chip" id="chipOther" type="button">Прочее</button>
</div>

<div id="grid"></div>

        </div>

        <div class="card rcp-right">
          <div class="row">
            <div>
              <div class="section-title" id="ttl">Выберите предмет</div>
              <div class="muted" id="sub">Кликните по варианту слева</div>
            </div>
            <div style="display:flex; gap:8px;">
              <button class="btn small" id="back" style="width:auto;" disabled>←</button>
              <button class="btn small" id="fwd" style="width:auto;" disabled>→</button>
            </div>
          </div>

          <div class="hr"></div>

          <div id="paneWrap">
            <div id="pane" class="muted">Нет выбранного рецепта.</div>
          </div>
        </div>
      </div>
    `;

    const qEl = root.querySelector("#q");
    const rarEl = root.querySelector("#rar");

    qEl.value = state.q;
    rarEl.value = state.rar;

    qEl.addEventListener("input", ()=>{
      clearTimeout(qEl._t);
      qEl._t = setTimeout(()=>{
        state.q = qEl.value || "";
        renderCatalog();
      }, 150);
    });
    rarEl.addEventListener("change", ()=>{
      state.rar = rarEl.value || "";
      renderCatalog();
    });
	
	const setChipActive = ()=>{
  const all = root.querySelector("#chipAll");
  const w = root.querySelector("#chipWeapon");
  const c = root.querySelector("#chipCons");
  const o = root.querySelector("#chipOther");
  [all,w,c,o].forEach(x=>x?.classList.remove("active"));

  if (!state.catType) all?.classList.add("active");
  else if (state.catType === "weapon") w?.classList.add("active");
  else if (state.catType === "consumable") c?.classList.add("active");
  else if (state.catType === "other") o?.classList.add("active");
};

const applyType = (t)=>{
  state.catType = t || "";
  // синхронизируем селект
  const typEl2 = root.querySelector("#typ");
  if (typEl2) typEl2.value = state.catType;
  setChipActive();
  renderCatalog();
};

root.querySelector("#chipAll")?.addEventListener("click", ()=> applyType(""));
root.querySelector("#chipWeapon")?.addEventListener("click", ()=> applyType("weapon"));
root.querySelector("#chipCons")?.addEventListener("click", ()=> applyType("consumable"));
root.querySelector("#chipOther")?.addEventListener("click", ()=> applyType("other"));

setChipActive();


    root.querySelector("#back").addEventListener("click", ()=>{
      if (state.histIdx <= 0) return;
      state.histIdx -= 1;
      renderRecipe(state.hist[state.histIdx], { push:false });
      updateNav();
    });
    root.querySelector("#fwd").addEventListener("click", ()=>{
      if (state.histIdx >= state.hist.length - 1) return;
      state.histIdx += 1;
      renderRecipe(state.hist[state.histIdx], { push:false });
      updateNav();
    });

    root.querySelector("#invBtn").addEventListener("click", openInvModal);
    root.querySelector("#seedBtn")?.addEventListener("click", seedSample);
  }


function renderCatalog(){
  const grid = root.querySelector("#grid");
  const cnt = root.querySelector("#cnt");
  const list = filterRecipes();

  cnt.textContent = String(list.length);
  if (!list.length){
    grid.innerHTML = `<div class="muted">Ничего не найдено</div>`;
    return;
  }

  // groups: baseName -> recipes
  const groups = new Map();
  for (const r of list){
    const key = baseNameOf(r) || r.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const groupNames = Array.from(groups.keys()).sort((a,b)=>a.localeCompare(b, "ru"));

  // recent (top)
  const recentIds = loadRecent().filter(id => state.recipesById.has(id));
  const recentHtml = recentIds.length ? `
    <div class="rcp-recent">
      <div class="rcp-recent-title">
        <span>Последние</span>
        <button class="btn small" id="recentClear" type="button" style="width:auto;">Очистить</button>
      </div>
      <div class="rcp-recent-row">
        ${recentIds.map((id)=>{
          const r = state.recipesById.get(id);
          return `
            <div class="rcp-recent-item ${rarityClassFor(r)}" data-recipe="${escapeHtml(id)}">
              ${iconBox(r?.icon, r?.name || id)}
              <div class="t">${escapeHtml(r?.name || id)}</div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  ` : ``;

  const groupsHtml = groupNames.map((name)=>{
    const items = groups.get(name).slice().sort((a,b)=>{
      return (RARITY_ORDER[a.rarity] || 99) - (RARITY_ORDER[b.rarity] || 99)
        || String(a.id||"").localeCompare(String(b.id||""));
    });

    const head = items[0];

    // IMPORTANT: collapsed by default
    const open = false;

    return `
      <div class="rcp-catGroup ${open ? "open" : ""}" data-group="${escapeHtml(name)}">
        <div class="rcp-catHead" data-group-toggle="${escapeHtml(name)}">
          <div class="rcp-catLeft">
            <div class="rcp-catIco">${iconBox(head.icon, head.name || name)}</div>
            <div class="rcp-catMeta">
              <div class="rcp-catTitle">${escapeHtml(name)}</div>
              <div class="rcp-catSub">${escapeHtml(head.type || "")} • вариантов: <b>${items.length}</b></div>
            </div>
          </div>
          <span class="badge">${items.length}</span>
        </div>

        <div class="rcp-catBody">
          ${items.map((r)=>`
            <button class="rcp-variant ${rarityClassFor(r)} ${state.selected===r.id?"active":""}"
              type="button" data-recipe="${escapeHtml(r.id)}">
              <div class="rcp-variant-left">
                <div class="rcp-variant-ico">${iconBox(r.icon, r.name)}</div>
                <div class="rcp-variant-name">${escapeHtml(r.name || r.id)}</div>
              </div>
              <div class="rcp-variant-right">
                ${r.type === "consumable" ? `<span class="muted">—</span>` : `${rarityDot(r.rarity)}`}
                ${ctx.isAdmin ? `<span class="muted" style="font-family:var(--mono); font-size:11px;">${escapeHtml(r.id)}</span>` : ``}
              </div>
            </button>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");

  grid.innerHTML = recentHtml + groupsHtml;

  applyIconBoxes(grid);

  // recent clear
  grid.querySelector("#recentClear")?.addEventListener("click", ()=>{
    localStorage.setItem(LS_RECENT, "[]");
    renderCatalog();
  });

  // group toggle (collapse/expand)
  grid.querySelectorAll("[data-group-toggle]").forEach((head)=>{
    head.addEventListener("click", ()=>{
      const key = head.getAttribute("data-group-toggle");
      const box = grid.querySelector(`.rcp-catGroup[data-group="${CSS.escape(key)}"]`);
      box?.classList.toggle("open");
    });
  });
}

  
  function loadRecent(){
  try{
    const arr = JSON.parse(localStorage.getItem(LS_RECENT) || "[]");
    return Array.isArray(arr) ? arr : [];
  }catch{
    return [];
  }
}
function pushRecent(id){
  const cur = loadRecent().filter(x => x !== id);
  cur.unshift(id);
  localStorage.setItem(LS_RECENT, JSON.stringify(cur.slice(0, 3)));
}

  

  function renderRecipe(recipeId, { push }){
    const pane = root.querySelector("#pane");
    const ttl = root.querySelector("#ttl");
    const sub = root.querySelector("#sub");

    const r = state.recipesById.get(recipeId);
    if (!r){
      ttl.textContent = "Рецепт не найден";
      sub.textContent = recipeId;
      pane.innerHTML = `<div class="muted">Нет данных.</div>`;
      return;
    }

    state.selected = recipeId;
    setSelectedInCatalog(recipeId);
    if (push) pushHist(recipeId);
	pushRecent(recipeId);
	renderCatalog();          // обновит блок "Последние"
	setSelectedInCatalog(recipeId); // вернём подсветку выбранного (после перерендера)



    ttl.textContent = r.name || r.id;
    sub.textContent = r.type === "consumable" ? (r.type || "—") : `${rarityLabel(r.rarity)} • ${r.type || "—"}`;

    const ing = Array.isArray(r.ingredients) ? r.ingredients : [];

    // суммарные базовые ресурсы (для крафта цепочкой)
    const inv = loadInv();
    const sum = sumBaseResources(recipeId, state.recipesById, 1);
    const sumRows = Object.keys(sum).sort().map((k)=>{
      const need = clampQty(sum[k]);
      const have = clampQty(inv[k] ?? 0);
      const ok = have >= need;
      const left = ok ? 0 : (need - have);
      return `
        <div class="rcp-ing" style="justify-content:space-between;">
          <div style="display:flex; gap:12px; align-items:center; min-width:0;">
            <div class="rcp-ing-ico">${iconBox(RES[k]?.icon, keyLabel(k))}</div>
            <div class="rcp-ing-meta">
              <div class="rcp-ing-name">${escapeHtml(keyLabel(k))}</div>
              <div class="muted">Нужно: <b>${need}</b> • Есть: <b>${have}</b></div>
            </div>
          </div>
          <span class="badge ${ok ? "ok" : "bad"}">${ok ? "хватает" : `не хватает ${left}`}</span>
        </div>
      `;
    }).join("");

    pane.innerHTML = `
      <div class="rcp-main ${rarityClassFor(r)}">
        <div class="rcp-main-ico">${iconBox(r.icon, r.name)}</div>
        <div style="min-width:0;">
          <div style="font-weight:1000; font-size:18px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${escapeHtml(r.name || r.id)}
          </div>
          <div class="muted">
            ${r.type === "consumable" ? escapeHtml(r.type || "") : `${escapeHtml(rarityLabel(r.rarity))} • ${escapeHtml(r.type || "")}`}
          </div>
        </div>
      </div>


      <div class="hr"></div>

      <div class="section-title">Ингредиенты (карточки)</div>
      <div class="rcp-ings">
        ${
          ing.length ? ing.map((it)=>{
            const qty = clampQty(it.qty);
            if (it.kind === "resource"){
              const k = String(it.key || "");
              return `
                <div class="rcp-ing">
                  <div class="rcp-ing-ico">${iconBox(RES[k]?.icon, keyLabel(k))}</div>
                  <div class="rcp-ing-meta">
                    <div class="rcp-ing-name">${escapeHtml(keyLabel(k))}</div>
                    <div class="muted">x <b>${qty}</b></div>
                  </div>
                </div>
              `;
            }
            if (it.kind === "item"){
              const childId = String(it.recipeId || "");
              const child = state.recipesById.get(childId);
              return `
                <button class="rcp-ing ${rarityClassFor(child)}" type="button" data-jump="${escapeHtml(childId)}" style="cursor:pointer; text-align:left;">
                  <div class="rcp-ing-ico">${iconBox(child?.icon, child?.name || childId)}</div>
                  <div class="rcp-ing-meta">
                    <div class="rcp-ing-name">${escapeHtml(child?.name || childId)}</div>
                    <div class="muted">x <b>${qty}</b> • открыть рецепт</div>
                  </div>
                </button>
              `;
            }
            return "";
          }).join("") : `<div class="muted">Ингредиенты не указаны</div>`
        }
      </div>

      <div class="hr"></div>

      <div class="row">
        <div class="section-title">Суммарно базовые ресурсы</div>
        <button class="btn small" id="editInv2" style="width:auto;">Изменить “что есть”</button>
      </div>

      <div style="display:grid; gap:12px;">
        ${sumRows || `<div class="muted">Нет данных по сумме</div>`}
      </div>

      ${r.notes ? `
        <div class="hr"></div>
        <div class="section-title">Заметка</div>
        <div class="muted" style="white-space:pre-wrap;">${escapeHtml(r.notes)}</div>
      ` : ``}
    `;

    applyIconBoxes(pane);

    pane.querySelector("#editInv2")?.addEventListener("click", ()=> root.querySelector("#invBtn").click());

    updateNav();
  }

  function openInvModal(){
    const inv = loadInv();
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="muted">Хранится локально в браузере.</div>
      <div class="hr"></div>
      <div class="formgrid" id="invForm"></div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn danger" id="clear" style="width:auto;">Сбросить</button>
        <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
      </div>
    `;

    const invForm = node.querySelector("#invForm");
    invForm.innerHTML = Object.keys(RES).map((k)=>`
      <div class="rcp-ing" style="justify-content:space-between;">
        <div style="display:flex; gap:12px; align-items:center; min-width:0;">
          <div class="rcp-ing-ico">${iconBox(RES[k].icon, RES[k].label)}</div>
          <div class="rcp-ing-meta">
            <div class="rcp-ing-name">${escapeHtml(RES[k].label)}</div>
            <div class="muted">${escapeHtml(k)}</div>
          </div>
        </div>
        <input class="input" data-k="${escapeHtml(k)}" type="number" min="0" step="1"
          value="${escapeHtml(String(inv[k] ?? 0))}" style="width:140px;">
      </div>
    `).join("");

    applyIconBoxes(node);

    const close = openModal("Мои ресурсы", node);

    node.querySelector("#clear").addEventListener("click", ()=>{
      saveInv({});
      close();
      notify("warn","Сброшено","Ресурсы очищены");
      const cur = state.hist[state.histIdx];
      if (cur) renderRecipe(cur, { push:false });
    });

    node.querySelector("#save").addEventListener("click", ()=>{
      const next = {};
      invForm.querySelectorAll("input[data-k]").forEach((inp)=>{
        next[inp.dataset.k] = clampQty(inp.value);
      });
      saveInv(next);
      close();
      notify("ok","Сохранено","Ресурсы обновлены");
      const cur = state.hist[state.histIdx];
      if (cur) renderRecipe(cur, { push:false });
    });
  }

  async function seedSample(){
    try{
      const sample = getSampleRecipes();
      for (const r of sample){
        const { id, ...payload } = r;
        await upsertRecipe(id, payload);
      }
      notify("ok","Готово","Шаблон рецептов загружен");
      location.reload();
    }catch(e){
      notify("bad","Ошибка", e.message);
    }
  }

  // delegated clicks
  root.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-recipe]");
    if (btn){
      const id = btn.getAttribute("data-recipe");
      if (id) renderRecipe(id, { push:true });
      return;
    }
    const jump = e.target.closest("[data-jump]");
    if (jump){
      const id = jump.getAttribute("data-jump");
      if (id) renderRecipe(id, { push:true });
    }
  });

  renderShell();

  try{
    state.recipes = await listRecipes();
  }catch(e){
    root.querySelector("#grid").innerHTML =
      `<div class="muted">Ошибка загрузки рецептов: ${escapeHtml(e?.message || String(e))}</div>`;
    return root;
  }

  state.recipesById = new Map(state.recipes.map(r => [r.id, r]));
  renderCatalog();

  const last = localStorage.getItem(LS_LAST);
  if (last && state.recipesById.has(last)){
    renderRecipe(last, { push:false });
    pushHist(last);
  }

  return root;
}
