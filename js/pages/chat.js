// js/pages/chat.js
import {
  listenChat, sendChatMessage,
  deleteChatMessage, setChatMute, setChatBan,
  listenPinned, setPinned,
  updateChatMessage,
  listenTyping, setTyping,
  adminClearChatLastN
} from "../db.js";

import { notify } from "../notify.js";
import { openModal } from "../ui.js";
import { go } from "../router.js";

let unsubChat = null;
let unsubPinned = null;
let unsubTyping = null;

export async function renderChat(ctx){
  const root = document.createElement("div");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Чат клана</div>
        <div class="card-sub">Поиск • печатает… • редактирование последнего сообщения</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <input class="input" id="search" placeholder="Поиск по сообщениям…" style="max-width:260px;" />
        <span class="badge ${ctx.isAdmin ? "ok" : ""}">${ctx.isAdmin ? "Админ" : "Участник"}</span>
        ${ctx.isAdmin ? `<button class="btn danger" id="clear" style="width:auto;">Очистить 50</button>` : ``}
      </div>
    </div>

    <div class="hr"></div>

    <div id="pinned" class="card" style="background: rgba(124,92,255,0.10); border-color: rgba(124,92,255,0.25);">
      <div class="muted">Закреп: нет</div>
    </div>

    <div class="hr"></div>

    <div class="muted" id="typing" style="min-height:18px;"></div>

    <div id="chatBox" style="display:grid; gap:10px; max-height: 520px; overflow:auto; padding-right:6px;"></div>

    <div class="hr"></div>

    <div class="row">
      <input class="input" id="msg" placeholder="Написать сообщение..." />
      <button class="btn primary" id="send" style="width:auto;">Отправить</button>
      <button class="btn" id="editLast" style="width:auto;">Редактировать последнее</button>
    </div>
    <div class="muted" style="margin-top:8px; font-size:12px;">
      Клик по автору — открыть профиль. Админ: удалить/мут/бан/закреп/очистка.
    </div>
  `;

  const box = card.querySelector("#chatBox");
  const msg = card.querySelector("#msg");
  const pinnedEl = card.querySelector("#pinned");
  const typingEl = card.querySelector("#typing");
  const searchEl = card.querySelector("#search");

  let allMsgs = [];

  // pinned realtime
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
        ${ctx.isAdmin ? `<button class="btn small" id="unpin" style="width:auto;">Снять</button>` : ``}
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

  // typing realtime
  if (unsubTyping) unsubTyping();
  unsubTyping = listenTyping((list)=>{
    const alive = list
      .filter(x => x?.uid && x.uid !== ctx.uid)
      .slice(0, 3)
      .map(x => x.displayName || "Игрок");

    typingEl.textContent = alive.length ? `${alive.join(", ")} печатает…` : "";
  });

  const render = (msgs)=>{
    // apply local search
    const q = (searchEl.value || "").toLowerCase().trim();
    const filtered = q ? msgs.filter(m => String(m.text || "").toLowerCase().includes(q)) : msgs;

    box.innerHTML = "";
    for (const m of filtered){
      const item = document.createElement("div");
      item.className = "card";
      item.style.background = "rgba(255,255,255,0.04)";
      item.style.padding = "12px";

      item.innerHTML = `
        <div class="row">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn small" data-u="${escapeAttr(m.uid)}" style="width:auto;">${escapeHtml(m.displayName || "Игрок")}</button>
            <div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid || "")}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end;">
            ${ctx.isAdmin ? `<button class="btn small" data-pin="${escapeAttr(m.id)}" style="width:auto;">Закреп</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn danger small" data-del="${escapeAttr(m.id)}" style="width:auto;">Удалить</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn small" data-mod="${escapeAttr(m.uid)}" style="width:auto;">Мод</button>` : ``}
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
              <button class="btn small" id="mute10" style="width:auto;">Мут 10 мин</button>
              <button class="btn small" id="mute60" style="width:auto;">Мут 60 мин</button>
              <button class="btn small" id="unmute" style="width:auto;">Размут</button>
            </div>

            <div class="hr"></div>

            <div class="row">
              <button class="btn danger small" id="ban" style="width:auto;">Бан</button>
              <button class="btn ok small" id="unban" style="width:auto;">Разбан</button>
            </div>

            <div class="hr"></div>
            <button class="btn" id="openProfile" style="width:auto;">Открыть профиль</button>
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
  unsubChat = listenChat((msgs)=>{
    allMsgs = msgs;
    render(allMsgs);
  });

  searchEl.addEventListener("input", ()=> render(allMsgs));

  // typing: on input
  let typingTimer = null;
  msg.addEventListener("input", ()=>{
    setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", true).catch(()=>{});
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(()=>{
      setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", false).catch(()=>{});
    }, 1200);
  });

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
      await setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", false).catch(()=>{});
    }catch(e){
      notify("bad", "Ошибка", e.message);
    }
  };

  card.querySelector("#send").addEventListener("click", send);
  msg.addEventListener("keydown", (e)=>{ if (e.key === "Enter") send(); });

  // edit last message (own) - tries to edit newest message by current user
  card.querySelector("#editLast").addEventListener("click", async ()=>{
    try{
      const last = [...allMsgs].reverse().find(m => m.uid === ctx.uid);
      if (!last) throw new Error("У вас нет сообщений для редактирования");

      const node = document.createElement("div");
      node.innerHTML = `
        <div class="muted">Редактирование последнего сообщения (ограничение ~2 минуты)</div>
        <div class="hr"></div>
        <textarea class="textarea" id="t"></textarea>
        <div class="hr"></div>
        <div class="row">
          <button class="btn" id="cancel" style="width:auto;">Отмена</button>
          <button class="btn primary" id="save" style="width:auto;">Сохранить</button>
        </div>
      `;
      node.querySelector("#t").value = last.text || "";
      const close = openModal("Редактирование", node);

      node.querySelector("#cancel").addEventListener("click", close);
      node.querySelector("#save").addEventListener("click", async ()=>{
        try{
          const newText = node.querySelector("#t").value.trim();
          if (!newText) throw new Error("Сообщение не может быть пустым");
          if (newText.length > 600) throw new Error("Макс 600 символов");
          await updateChatMessage(last.id, newText);
          notify("ok", "Готово", "Сообщение обновлено");
          close();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    }catch(e){
      notify("bad", "Ошибка", e.message);
    }
  });

  // admin clear
  if (ctx.isAdmin){
    card.querySelector("#clear").addEventListener("click", ()=>{
      const node = document.createElement("div");
      node.innerHTML = `
        <div class="muted">Удалить последние 50 сообщений?</div>
        <div class="hr"></div>
        <div class="row">
          <button class="btn" id="cancel" style="width:auto;">Отмена</button>
          <button class="btn danger" id="yes" style="width:auto;">Удалить</button>
        </div>
      `;
      const close = openModal("Очистка чата", node);
      node.querySelector("#cancel").addEventListener("click", close);
      node.querySelector("#yes").addEventListener("click", async ()=>{
        try{
          await adminClearChatLastN(50);
          notify("warn", "Готово", "Удалено 50 сообщений");
          close();
        }catch(e){
          notify("bad", "Ошибка", e.message);
        }
      });
    });
  }

  root.appendChild(card);
  return root;
}

export function cleanupChat(){
  if (unsubChat) unsubChat();
  if (unsubPinned) unsubPinned();
  if (unsubTyping) unsubTyping();
  unsubChat = null;
  unsubPinned = null;
  unsubTyping = null;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
