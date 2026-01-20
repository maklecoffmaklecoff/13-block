// js/notify.js
export function notify(type, title, desc, timeoutMs = 3200){
  const host = document.getElementById("notifyHost");
  const el = document.createElement("div");
  el.className = `toast ${type || ""}`.trim();
  el.innerHTML = `<div class="t">${escapeHtml(title || "")}</div>
                  <div class="d">${escapeHtml(desc || "")}</div>`;
  host.appendChild(el);
  setTimeout(()=> el.remove(), timeoutMs);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
