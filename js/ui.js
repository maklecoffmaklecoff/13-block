// js/ui.js
import { STATS_KEYS } from "./validators.js";

export function setActiveTab(route){
  document.querySelectorAll(".tab").forEach(b=>{
    b.classList.toggle("active", b.dataset.route === route);
  });
}

export function renderStatsKV(stats){
  const wrap = document.createElement("div");
  wrap.className = "kv";
  for (const s of STATS_KEYS){
    const card = document.createElement("div");
    card.className = "stat";
    card.innerHTML = `<div class="k">${s.label}</div><div class="v">${Number(stats?.[s.key] ?? 0)}</div>`;
    wrap.appendChild(card);
  }
  return wrap;
}

export function openModal(title, bodyNode){
  const host = document.getElementById("modalHost");
  host.classList.remove("hidden");
  host.innerHTML = "";

  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-head">
      <div class="modal-title"></div>
      <button class="btn small" id="modalClose">Закрыть</button>
    </div>
    <div class="modal-body"></div>
  `;
  modal.querySelector(".modal-title").textContent = title || "";
  modal.querySelector(".modal-body").appendChild(bodyNode);

  host.appendChild(modal);

  const close = ()=> { host.classList.add("hidden"); host.innerHTML=""; };
  host.addEventListener("click", (e)=>{ if (e.target === host) close(); }, { once:true });
  modal.querySelector("#modalClose").addEventListener("click", close, { once:true });

  return close;
}

export function setAuthedVisibility({ authed, isAdmin }){
  document.querySelectorAll(".authed-only").forEach(el=>{
    el.style.display = authed ? "" : "none";
  });
  document.querySelectorAll(".admin-only").forEach(el=>{
    el.style.display = (authed && isAdmin) ? "" : "none";
  });
}

export function buildStatsForm(initialStats = {}){
  const wrap = document.createElement("div");
  wrap.className = "kv";
  for (const s of STATS_KEYS){
    const field = document.createElement("div");
    field.innerHTML = `
      <div class="label">${s.label} (0-9999)</div>
      <input class="input" inputmode="numeric" data-key="${s.key}" value="${Number(initialStats?.[s.key] ?? 0)}" />
    `;
    wrap.appendChild(field);
  }
  return wrap;
}

export function readStatsForm(container){
  const stats = {};
  container.querySelectorAll("input[data-key]").forEach(inp=>{
    stats[inp.dataset.key] = inp.value;
  });
  return stats;
}
