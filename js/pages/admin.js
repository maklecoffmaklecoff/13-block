// js/pages/admin.js
import { notify } from "../notify.js";
import { removeMember, listMembers } from "../db.js";

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
    <div class="card-title">Админ-панель</div>
    <div class="card-sub">Управление участниками</div>
    <table class="table">
      <thead><tr><th>Игрок</th><th>UID</th><th>Действия</th></tr></thead>
      <tbody id="mb"></tbody>
    </table>
  `;

  const members = await listMembers();
  const mb = card.querySelector("#mb");
  mb.innerHTML = members.length ? "" : `<tr><td colspan="3" class="muted">Нет участников</td></tr>`;
  for (const m of members){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:900;">${escapeHtml(m.displayName || "Игрок")}</td>
      <td class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid)}</td>
      <td><button class="btn danger small" data-rm="${escapeHtml(m.uid)}">Удалить</button></td>
    `;
    mb.appendChild(tr);

    tr.querySelector(`[data-rm="${m.uid}"]`).addEventListener("click", async ()=>{
      try{
        await removeMember(m.uid);
        notify("warn", "Удалено", "Участник удалён из members");
        location.reload();
      }catch(e){
        notify("bad", "Ошибка", e.message);
      }
    });
  }

  root.appendChild(card);
  return root;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
