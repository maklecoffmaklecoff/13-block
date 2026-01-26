// js/pages/chat.js
import {
  listenChat, sendChatMessage,
  deleteChatMessage, setChatMute, setChatBan,
  listenPinned, setPinned,
  updateChatMessage,
  listenTyping, setTyping,
  adminClearChatLastN,
  setReaction, listenReactions
} from "../db.js";

import { notify } from "../notify.js";
import { openModal } from "../ui.js";
import { go } from "../router.js";

let unsubChat = null;
let unsubPinned = null;
let unsubTyping = null;

// reactions: keep across renders + cleanup on route leave
let reactionUnsubs = new Map(); // msgId -> unsub
let reactionsCache = new Map(); // msgId -> { counts, myEmoji }


const EMOJIS = ["👍","🔥","😂","😡"];

export async function renderChat(ctx){
  const root = document.createElement("div");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="row">
      <div>
        <div class="card-title">Чат</div>
        <div class="card-sub">Ответы • реакции • поиск</div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
        <input class="input" id="search" placeholder="Поиск…" style="max-width:220px;" />
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

    <div id="replyBar" class="card soft" style="display:none; padding:10px;">
      <div class="row">
        <div>
          <div class="muted" style="font-size:12px;">Ответ на:</div>
          <div id="replyText" style="font-weight:900;"></div>
        </div>
        <button class="btn small" id="cancelReply" style="width:auto;">Отмена</button>
      </div>
    </div>

    <div class="row" style="margin-top:10px;">
      <input class="input" id="msg" placeholder="Сообщение…" />
      <button class="btn primary" id="send" style="width:auto;">Отправить</button>
      <button class="btn" id="editLast" style="width:auto;">Редакт. последнее</button>
    </div>
  `;

  const box = card.querySelector("#chatBox");
  const msg = card.querySelector("#msg");
  const pinnedEl = card.querySelector("#pinned");
  const typingEl = card.querySelector("#typing");
  const searchEl = card.querySelector("#search");

  // autoscroll only if user is near bottom
  const isNearBottom = ()=>{
    const gap = 80;
    return (box.scrollHeight - box.scrollTop - box.clientHeight) < gap;
  };

  // reply state
  let replyTo = null;
  const replyBar = card.querySelector("#replyBar");
  const replyText = card.querySelector("#replyText");
  const setReply = (m)=>{
    replyTo = { msgId: m.id, uid: m.uid, displayName: m.displayName || "Игрок", textPreview: String(m.text||"").slice(0,120) };
    replyText.textContent = `${replyTo.displayName}: ${replyTo.textPreview}`;
    replyBar.style.display = "";
  };
  const clearReply = ()=>{
    replyTo = null;
    replyBar.style.display = "none";
    replyText.textContent = "";
  };
  card.querySelector("#cancelReply").addEventListener("click", clearReply);


  const ensureReactionSub = (msgId)=>{
    if (reactionUnsubs.has(msgId)) return;
    const unsub = listenReactions(msgId, (list)=>{
      const counts = {};
      let myEmoji = "";
      for (const r of list){
        if (!r?.emoji) continue;
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        if (r.uid === ctx.uid) myEmoji = r.emoji;
      }
      reactionsCache.set(msgId, { counts, myEmoji });

      // update row if it exists
      const host = box.querySelector(`[data-rx-host="${CSS.escape(msgId)}"]`);
      if (host) renderReactionsRow(host, msgId);
    });
    reactionUnsubs.set(msgId, unsub);
  };

  const cleanupReactionSubs = (keepIds)=>{
    for (const [id, unsub] of reactionUnsubs.entries()){
      if (!keepIds.has(id)){
        try{ unsub(); }catch(_){}
        reactionUnsubs.delete(id);
        reactionsCache.delete(id);
      }
    }
  };

  function renderReactionsRow(host, msgId){
    host.innerHTML = "";
    const st = reactionsCache.get(msgId) || { counts:{}, myEmoji:"" };
    for (const e of EMOJIS){
      const c = st.counts[e] || 0;
      const b = document.createElement("button");
      b.className = `btn small ${st.myEmoji === e ? "primary" : ""}`.trim();
      b.style.width = "auto";
      b.textContent = c ? `${e} ${c}` : e;
      b.addEventListener("click", async ()=>{
        try{
          const next = (st.myEmoji === e) ? "" : e;
          await setReaction(msgId, ctx.uid, ctx.userDoc?.displayName || "Игрок", next);
        }catch(err){
          notify("bad","Ошибка", err.message);
        }
      });
      host.appendChild(b);
    }
  }

  function openModModal(uid){
    const node = document.createElement("div");
    node.innerHTML = `
      <div class="muted">UID: <span style="font-family:var(--mono);">${escapeHtml(uid)}</span></div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn small" id="mute10" style="width:auto;">Мут 10м</button>
        <button class="btn small" id="mute60" style="width:auto;">Мут 60м</button>
        <button class="btn small" id="unmute" style="width:auto;">Размут</button>
      </div>
      <div class="hr"></div>
      <div class="row">
        <button class="btn danger small" id="ban" style="width:auto;">Бан</button>
        <button class="btn ok small" id="unban" style="width:auto;">Разбан</button>
      </div>
    `;
    openModal("Модерация", node);

    const now = Date.now();
    node.querySelector("#mute10").addEventListener("click", async ()=> setChatMute(uid, new Date(now + 10*60*1000)));
    node.querySelector("#mute60").addEventListener("click", async ()=> setChatMute(uid, new Date(now + 60*60*1000)));
    node.querySelector("#unmute").addEventListener("click", async ()=> setChatMute(uid, null));
    node.querySelector("#ban").addEventListener("click", async ()=> setChatBan(uid, true));
    node.querySelector("#unban").addEventListener("click", async ()=> setChatBan(uid, false));
  }

  // pinned
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
        </div>
        ${ctx.isAdmin ? `<button class="btn small" id="unpin" style="width:auto;">Снять</button>` : ``}
      </div>
    `;
    pinnedEl.querySelector("#unpin")?.addEventListener("click", async ()=>{
      await setPinned({ text: "" });
      notify("warn","Готово","Закреп снят");
    });
  });

  // typing
  if (unsubTyping) unsubTyping();
  unsubTyping = listenTyping((list)=>{
    const alive = list.filter(x => x?.uid && x.uid !== ctx.uid).slice(0,3).map(x => x.displayName || "Игрок");
    typingEl.textContent = alive.length ? `${alive.join(", ")} печатает…` : "";
  });

  let allMsgs = [];

  const render = ()=>{
    const q = (searchEl.value || "").toLowerCase().trim();
    const filtered = q ? allMsgs.filter(m => String(m.text || "").toLowerCase().includes(q)) : allMsgs;

    const keepIds = new Set(filtered.map(m=>m.id));
    filtered.forEach(m => ensureReactionSub(m.id));
    cleanupReactionSubs(keepIds);

    const shouldStick = isNearBottom();
    box.innerHTML = "";

    for (const m of filtered){
      const uidLine = ctx.isAdmin
        ? `<div class="muted" style="font-family:var(--mono); font-size:12px;">${escapeHtml(m.uid || "")}</div>`
        : ``;

      const replyHtml = m.replyTo?.msgId
        ? `
          <div class="card soft" style="padding:8px; margin-top:8px;">
            <div class="muted" style="font-size:12px;">Ответ на ${escapeHtml(m.replyTo.displayName || "Игрок")}</div>
            <div class="muted" style="margin-top:4px; white-space:pre-wrap;">${escapeHtml(m.replyTo.textPreview || "")}</div>
          </div>
        `
        : ``;

      const item = document.createElement("div");
      item.className = "card";
      item.style.background = "rgba(255,255,255,0.04)";
      item.style.padding = "12px";

      item.innerHTML = `
        <div class="row">
          <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <button class="btn small" data-u="${escapeAttr(m.uid)}" style="width:auto;">${escapeHtml(m.displayName || "Игрок")}</button>
            ${uidLine}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn small" data-reply="${escapeAttr(m.id)}" style="width:auto;">Ответить</button>
            ${ctx.isAdmin ? `<button class="btn small" data-pin="${escapeAttr(m.id)}" style="width:auto;">Закреп</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn danger small" data-del="${escapeAttr(m.id)}" style="width:auto;">Удалить</button>` : ``}
            ${ctx.isAdmin ? `<button class="btn small" data-mod="${escapeAttr(m.uid)}" style="width:auto;">Мод</button>` : ``}
          </div>
        </div>
        ${replyHtml}
        <div style="margin-top:8px; white-space:pre-wrap;">${escapeHtml(m.text || "")}</div>
        <div class="row" style="margin-top:10px;">
          <div class="muted" style="font-size:12px;">Реакции:</div>
          <div data-rx-host="${escapeAttr(m.id)}" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
        </div>
      `;

      box.appendChild(item);

      item.querySelector(`[data-u="${m.uid}"]`).addEventListener("click", ()=> go("user", { uid: m.uid }));
      item.querySelector(`[data-reply="${m.id}"]`).addEventListener("click", ()=> setReply(m));

      const rxHost = item.querySelector(`[data-rx-host="${m.id}"]`);
      renderReactionsRow(rxHost, m.id);

      if (ctx.isAdmin){
        item.querySelector(`[data-del="${m.id}"]`)?.addEventListener("click", async ()=> deleteChatMessage(m.id));
        item.querySelector(`[data-pin="${m.id}"]`)?.addEventListener("click", async ()=> setPinned({ text: m.text || "", pinnedByUid: ctx.uid, pinnedByName: ctx.userDoc?.displayName || "Админ" }));
        item.querySelector(`[data-mod="${m.uid}"]`)?.addEventListener("click", ()=> openModModal(m.uid));
      }
    }

    if (shouldStick) box.scrollTop = box.scrollHeight;
  };

  if (unsubChat) unsubChat();
  unsubChat = listenChat((msgs)=>{
    allMsgs = msgs;
    render();
  });

  searchEl.addEventListener("input", render);

  // typing
  let typingTimer = null;
  msg.addEventListener("input", ()=>{
    setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", true).catch(()=>{});
    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(()=> setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", false).catch(()=>{}), 1200);
  });

  const send = async ()=>{
    try{
      const text = msg.value.trim();
      if (!text) return;
      if (text.length > 600) throw new Error("Макс 600 символов");
      await sendChatMessage({
        uid: ctx.uid,
        displayName: ctx.userDoc?.displayName || "Игрок",
        role: ctx.userDoc?.role || "user",
        text,
        replyTo: replyTo || null
      });
      msg.value = "";
      clearReply();
      await setTyping(ctx.uid, ctx.userDoc?.displayName || "Игрок", false).catch(()=>{});
    }catch(e){
      notify("bad","Ошибка", e.message);
    }
  };

  card.querySelector("#send").addEventListener("click", send);
  msg.addEventListener("keydown", (e)=>{ if (e.key === "Enter") send(); });

  // edit last (unchanged)
  card.querySelector("#editLast").addEventListener("click", async ()=>{
    try{
      const last = [...allMsgs].reverse().find(m => m.uid === ctx.uid);
      if (!last) throw new Error("Нет сообщений для редактирования");
      const node = document.createElement("div");
      node.innerHTML = `
        <div class="muted">Редактирование последнего сообщения (≈2 минуты)</div>
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
        const newText = node.querySelector("#t").value.trim();
        if (!newText) throw new Error("Пустое сообщение нельзя");
        await updateChatMessage(last.id, newText);
        close();
      });
    }catch(e){ notify("bad","Ошибка", e.message); }
  });

  if (ctx.isAdmin){
    card.querySelector("#clear")?.addEventListener("click", async ()=>{
      await adminClearChatLastN(50);
      notify("warn","Готово","Удалено 50 сообщений");
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

  // cleanup reaction listeners
  for (const [, unsub] of reactionUnsubs.entries()){
    try{ unsub(); }catch(_){}
  }
  reactionUnsubs = new Map();
  reactionsCache = new Map();
}


function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}
function escapeAttr(s){
  return String(s ?? "").replace(/"/g, "&quot;");
}
