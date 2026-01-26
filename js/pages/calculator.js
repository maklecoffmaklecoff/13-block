// js/pages/calculator.js
const NPC_LIST = [
  { name: "Барыга", sigPerHour: 25, maxCount: 7 },
  { name: "Пекарь", sigPerHour: 40, maxCount: 6 },
  { name: "Ткач", sigPerHour: 110, maxCount: 5 },
  { name: "Охранник", sigPerHour: 70, maxCount: 8 },
  { name: "Слесарь", sigPerHour: 220, maxCount: 5 },
  { name: "Завхоз", sigPerHour: 140, maxCount: 7 },
];

export async function renderCalculator(ctx){
  const root = document.createElement("div");
  root.className = "grid";
  root.style.gap = "14px";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">🚬 Калькулятор добычи сигарет</div>
        <div class="card-sub">Уважение + Добыча + Шестёрки → скорость и лимит</div>
      </div>
      <span class="badge">🚭</span>
    </div>

    <div class="hr"></div>

    <div class="grid two" style="align-items:start;">
      <div class="card soft">
        <div class="section-title">⚙️ Основные параметры</div>
        <div class="hr"></div>

        <div class="calc-form">
          <div>
            <div class="label">Уважение</div>
            <input class="input" id="respect" type="number" step="0.01" placeholder="0" />
          </div>

          <div>
            <div class="label">Добыча</div>
            <input class="input" id="mining" type="number" step="0.01" placeholder="0" />
          </div>
        </div>

        <div class="hr"></div>

        <div class="section-title">👥 Шестёрки</div>
        <div class="muted" style="font-size:12px;">Выбери количество для каждого НПС</div>
        <div style="height:10px;"></div>

        <div class="npc-grid" id="npcGrid"></div>
      </div>

      <div class="card soft">
        <div class="section-title">📊 Результаты</div>
        <div class="hr"></div>

        <div class="calc-result" id="result">
          <div class="muted">Введи параметры — результаты появятся тут.</div>
        </div>

      </div>
    </div>
  `;
  root.appendChild(card);

  // state
  const npcCounts = Object.create(null);
  const $respect = card.querySelector("#respect");
  const $mining = card.querySelector("#mining");
  const $npcGrid = card.querySelector("#npcGrid");
  const $result = card.querySelector("#result");

  // optional: prefill from profile if exists
  // (если хочешь, чтобы уважение/добыча подтягивались из stats — скажи)
  $respect.value = "0";
  $mining.value = "0";

  // build NPC UI
  for (const npc of NPC_LIST){
    const row = document.createElement("div");
    row.className = "npc-item";
    row.innerHTML = `
      <div class="npc-name">${escapeHtml(npc.name)}</div>
      <select class="input npc-select" data-npc="${escapeAttr(npc.name)}"></select>
    `;
    const sel = row.querySelector("select");
    for (let i = 0; i <= npc.maxCount; i++){
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = String(i);
      sel.appendChild(opt);
    }
    sel.value = "0";
    npcCounts[npc.name] = 0;

    sel.addEventListener("change", ()=>{
      const v = parseInt(sel.value, 10) || 0;
      npcCounts[npc.name] = clamp(v, 0, npc.maxCount);
      calculateAndRender();
    });

    $npcGrid.appendChild(row);
  }

  // listeners
  $respect.addEventListener("input", calculateAndRender);
  $mining.addEventListener("input", calculateAndRender);

  // initial calculate
  calculateAndRender();

  function calculateAndRender(){
    const respectNum = parseNumber($respect.value);
    const miningNum = parseNumber($mining.value);

    // 1) capacity from mining
    const capacity = Math.round(21000 + 2100 * miningNum);

    // 2) npc speed (sig/hour * count / 60)
    let npcSpeed = 0;
    for (const npc of NPC_LIST){
      const count = npcCounts[npc.name] || 0;
      if (count > 0){
        npcSpeed += (npc.sigPerHour * count) / 60;
      }
    }

    // 3) respect speed
    const respectSpeed = 0.4375 * respectNum;

    // 4) total speed
    const totalSpeed = npcSpeed + respectSpeed;
    const safeSpeed = totalSpeed > 0 ? totalSpeed : 0.000001;

    const timeMinutes = capacity / safeSpeed;
    const dailyUnlimited = safeSpeed * 1440;

    $result.innerHTML = `
      <div class="calc-stat">
        <span class="muted">Максимальная вместимость (лимит):</span>
        <b>${fmtInt(capacity)} сиг</b>
      </div>

      <div class="calc-stat highlight">
        <span class="muted">Скорость (сиг/мин):</span>
        <b>${totalSpeed.toFixed(2)} сиг/мин</b>
      </div>

      <div class="calc-stat">
        <span class="muted">Время заполнения до лимита:</span>
        <b>${formatTimeHM(timeMinutes)}</b>
      </div>

      <div class="calc-stat highlight">
        <span class="muted">Максимум за день (без лимита):</span>
        <b>${fmtInt(Math.round(dailyUnlimited))} сиг</b>
      </div>
    `;
  }

  return root;
}

function parseNumber(value){
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function clamp(n, a, b){
  return Math.max(a, Math.min(b, n));
}
function fmtInt(n){
  return Number(n || 0).toLocaleString("ru-RU");
}

function getRussianPlural(num, forms){
  const n = Math.abs(num) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

function formatTimeHM(totalMinutes){
  const total = Math.round(totalMinutes);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const hText = getRussianPlural(hours, ["час", "часа", "часов"]);
  const mText = getRussianPlural(minutes, ["минута", "минуты", "минут"]);
  return `${hours} ${hText}, ${minutes} ${mText}`;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
