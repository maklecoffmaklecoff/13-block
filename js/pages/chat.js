// js/pages/chat.js
import {
  listenChat, sendChatMessage,
  deleteChatMessage, setChatMute, setChatBan,
  listenPinned, setPinned
} from "../db.js";
import { notify } from "../notify.js";
import { openModal } from "../ui.js";
import { go } from "../router.js";

let unsubChat = null;
let unsubPinned = null;

export async function renderChat(ctx){
  const root = document.createElement("div");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Чат клана</div>
        <div class="card-sub">Добавлю управление позже</div>
      </div>
      <div class="badge ${ctx.isAdmin ? "ok" : ""}">${ctx.isAdmin ? "Админ" : "Участник"}</div>
    </div>

    <div class="hr"></div>

    <div id="pinned" class="card" style="background: rgba(124,92,255,0.10); border-color: rgba(124,92,255,0.25);">
      <div class="muted">Закреп: нет</div>
    </div>

    <div class="hr"></div>

    <div id="chatBox" style="display:grid; gap:10px; max-height: 520px; overflow:auto; padding-right:6px;"></div>

    <div class="hr"></div>

    <div class="row">
      <input class="input" id="msg" placeholder="Написать сообщение..." />
      <button class="btn primary" id="send">Отправить</button>
    </div>
    <div class="muted" style="margin-top:8px; font-size:12px;">
      Клик по автору — открыть профиль.
    </div>
  `;

  const box = card.querySelector("#chatBox");
  const msg = card.querySelector("#msg");
  const pinnedEl = card.querySelector("#pinned");

  if (unsubPinned) unsubPinned();
  unsubPinned = listenPinned((p)=>{
    if (!p?.text){
      pinnedEl.innerHTML = `<div class="muted">Закреп: нет</div>`;
      return;
    }
    pinnedEl.innerHTML = `
      <div class="row">
        <div>
          <div style="font-weight:1000;">Закреплено</div>
          <div class="muted" style="margin-top:6px; white-space:pre-wrap;">${escapeHtml(p.text)}</div>
          <div class="muted" style="margin-top:6px; font-size:12px;">by ${escapeHtml(p.pinnedByName || p.pinnedByUid || "")}</div>
        </div>
        ${ctx.isAdmin ? `<button class="btn small" id="unpin">Снять</button>` : ``}
      </div>
    `;
    const unpin = pinnedEl.querySelector("#unpin");
    if (unpin){
      unpin.addEventListener("click", async ()=>{
        try{
          await setPinned({ text: "" });
          notify("warn", "Готово", "Закреп снят");
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    }
  });

  const render = (msgs)=>{
    box.innerHTML = "";
    for (const m of msgs){
      const item = document.createElement("div");
      item.className = "card";
      item.style.background = "rgba(255,255,255,0.04)";
      item.style.padding = "12px";

      item.innerHTML = `
        <div class="row">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn small" data-u="${escapeAttr(m.uid)}">${escapeHtml(m.displayName || "Игрок")}</button>
            <div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid || "")}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            ${ctx.isAdmin ? `<button class="btn small" data-pin="${escapeAttr(m.id)}">Закреп</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn danger small" data-del="${escapeAttr(m.id)}">Удалить</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn small" data-mod="${escapeAttr(m.uid)}">Мод</button>` : ``}
          </div>
        </div>
        <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(m.text || "")}</div>
      `;

      box.appendChild(item);

      item.querySelector(`[data-u="${m.uid}"]`).addEventListener("click", ()=>{
        go("user", { uid: m.uid });
      });

      if (ctx.isAdmin){
        item.querySelector(`[data-del="${m.id}"]`)?.addEventListener("click", async ()=>{
          try{
            await deleteChatMessage(m.id);
            notify("warn", "Удалено", "Сообщение удалено");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        item.querySelector(`[data-pin="${m.id}"]`)?.addEventListener("click", async ()=>{
          try{
            await setPinned({
              text: m.text || "",
              pinnedByUid: ctx.uid,
              pinnedByName: ctx.userDoc?.displayName || "Админ"
            });
            notify("ok", "Готово", "Сообщение закреплено");
          }catch(e){
            notify("bad", "Ошибка", e.message);
          }
        });

        item.querySelector(`[data-mod="${m.uid}"]`)?.addEventListener("click", ()=>{
          const node = document.createElement("div");
          node.innerHTML = `
            <div class="muted">UID: <span style="font-family:var(--mono);">${escapeHtml(m.uid)}</span></div>
            <div class="hr"></div>

            <div class="row">
              <button class="btn small" id="mute10">Мут 10 мин</button>
              <button class="btn small" id="mute60">Мут 60 мин</button>
              <button class="btn small" id="unmute">Размут</button>
            </div>

            <div class="hr"></div>

            <div class="row">
              <button class="btn danger small" id="ban">Бан</button>
              <button class="btn ok small" id="unban">Разбан</button>
            </div>

            <div class="hr"></div>
            <button class="btn" id="openProfile">Открыть профиль игрока</button>
          `;

          openModal("Модерация", node);

          const now = Date.now();
          node.querySelector("#mute10").addEventListener("click", async ()=>{
            try{ await setChatMute(m.uid, new Date(now + 10*60*1000)); notify("warn","Готово","Мут на 10 минут"); }
            catch(e){ notify("bad","Ошибка", e.message); }
          });
          node.querySelector("#mute60").addEventListener("click", async ()=>{
            try{ await setChatMute(m.uid, new Date(now + 60*60*1000)); notify("warn","Готово","Мут на 60 минут"); }
            catch(e){ notify("bad","Ошибка", e.message); }
          });
          node.querySelector("#unmute").addEventListener("click", async ()=>{
            try{ await setChatMute(m.uid, null); notify("ok","Готово","Мут снят"); }
            catch(e){ notify("bad","Ошибка", e.message); }
          });

          node.querySelector("#ban").addEventListener("click", async ()=>{
            try{ await setChatBan(m.uid, true); notify("warn","Готово","Пользователь забанен"); }
            catch(e){ notify("bad","Ошибка", e.message); }
          });
          node.querySelector("#unban").addEventListener("click", async ()=>{
            try{ await setChatBan(m.uid, false); notify("ok","Готово","Пользователь разбанен"); }
            catch(e){ notify("bad","Ошибка", e.message); }
          });

          node.querySelector("#openProfile").addEventListener("click", ()=> go("user", { uid: m.uid }));
        });
      }
    }
    box.scrollTop = box.scrollHeight;
  };

  if (unsubChat) unsubChat();
  unsubChat = listenChat(render);

  const send = async ()=>{
    try{
      const text = msg.value.trim();
      if (!text) return;
      if (text.length > 600) throw new Error("Слишком длинное сообщение (макс 600 символов)");
      await sendChatMessage({
        uid: ctx.uid,
        displayName: ctx.userDoc?.displayName || "Игрок",
        role: ctx.userDoc?.role || "user",
        text
      });
      msg.value = "";
    }catch(e){
      notify("bad", "Ошибка", e.message);
    }
  };

  card.querySelector("#send").addEventListener("click", send);
  msg.addEventListener("keydown", (e)=>{ if (e.key === "Enter") send(); });

  root.appendChild(card);
  return root;
}

export function cleanupChat(){
  if (unsubChat) unsubChat();
  if (unsubPinned) unsubPinned();
  unsubChat = null;
  unsubPinned = null;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s).replace(/"/g, "&quot;");
}
