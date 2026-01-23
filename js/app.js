// js/app.js
import { initAuth, loginGoogle, logout, loginEmail, registerEmail, resetPassword } from "./auth.js";
import { parseHash } from "./router.js";
import { setActiveTab, setAuthedVisibility, openModal } from "./ui.js";
import { notify } from "./notify.js";
import { cleanupChat } from "./pages/chat.js";

const state = {
  authed: false,
  uid: null,
  firebaseUser: null,
  userDoc: null,
  isAdmin: false
};

const pagesPromise = (async ()=>{
  const [home, roster, events, profile, chat, admin, user] = await Promise.all([
    import("./pages/home.js"),
    import("./pages/roster.js"),
    import("./pages/events.js"),
    import("./pages/profile.js"),
    import("./pages/chat.js"),
    import("./pages/admin.js"),
    import("./pages/user.js"),
  ]);
  return { home, roster, events, profile, chat, admin, user };
})();

function applyTheme(){
  const sel = document.getElementById("themeSelect");
  const saved = localStorage.getItem("theme") || "theme-dark";
  document.body.classList.remove("theme-dark","theme-neon","theme-light");
  document.body.classList.add(saved);
  if (sel){
    sel.value = saved;
    sel.addEventListener("change", ()=>{
      localStorage.setItem("theme", sel.value);
      document.body.classList.remove("theme-dark","theme-neon","theme-light");
      document.body.classList.add(sel.value);
    });
  }
}

function openLoginModal(){
  const node = document.createElement("div");
  node.innerHTML = `
    <div class="authbar">
      <div class="seg" id="seg">
        <button data-mode="login" class="active">Вход</button>
        <button data-mode="register">Регистрация</button>
        <button data-mode="reset">Сброс</button>
      </div>
    </div>
    <div class="hr"></div>
    <div id="pane"></div>
  `;

  const close = openModal("Вход / Регистрация", node);
  const pane = node.querySelector("#pane");
  const seg = node.querySelector("#seg");

  const setMode = (mode)=>{
    seg.querySelectorAll("button[data-mode]").forEach(b=>{
      b.classList.toggle("active", b.dataset.mode === mode);
    });

    if (mode === "login"){
      pane.innerHTML = `
        <div class="formgrid">
          <button class="btn primary" id="google">Войти через Google</button>
          <div class="hr"></div>
          <div>
            <div class="label">Email</div>
            <input class="input" id="email" type="email" autocomplete="email" placeholder="you@mail.com" />
          </div>
          <div>
            <div class="label">Пароль</div>
            <input class="input" id="pass" type="password" autocomplete="current-password" placeholder="••••••••" />
          </div>
          <div class="help-row">
            <button class="btn primary" id="loginEmail" style="width:auto;">Войти</button>
            <button class="linkbtn" id="toReset" type="button">Забыли пароль?</button>
          </div>
        </div>
      `;

      pane.querySelector("#google").addEventListener("click", async ()=>{
        try{ await loginGoogle(); close(); }
        catch(e){ notify("bad","Ошибка", e.message); }
      });

      pane.querySelector("#loginEmail").addEventListener("click", async ()=>{
        try{
          const email = pane.querySelector("#email").value.trim();
          const password = pane.querySelector("#pass").value;
          if (!email) throw new Error("Укажите email");
          if (!password) throw new Error("Укажите пароль");
          await loginEmail({ email, password });
          close();
        }catch(e){
          notify("bad","Ошибка входа", e.message);
        }
      });

      pane.querySelector("#toReset").addEventListener("click", ()=> setMode("reset"));
      return;
    }

    if (mode === "register"){
      pane.innerHTML = `
        <div class="formgrid">
          <button class="btn primary" id="google">Регистрация через Google</button>
          <div class="hr"></div>
          <div>
            <div class="label">Ник</div>
            <input class="input" id="name" type="text" autocomplete="nickname" placeholder="Ваш ник" />
          </div>
          <div>
            <div class="label">Email</div>
            <input class="input" id="regEmail" type="email" autocomplete="email" placeholder="you@mail.com" />
          </div>
          <div>
            <div class="label">Пароль</div>
            <input class="input" id="regPass" type="password" autocomplete="new-password" placeholder="Минимум 6 символов" />
          </div>
          <div class="help-row">
            <button class="btn ok" id="register" style="width:auto;">Создать аккаунт</button>
            <button class="linkbtn" id="toLogin" type="button">Уже есть аккаунт?</button>
          </div>
        </div>
      `;

      pane.querySelector("#google").addEventListener("click", async ()=>{
        try{ await loginGoogle(); close(); }
        catch(e){ notify("bad","Ошибка", e.message); }
      });

      pane.querySelector("#register").addEventListener("click", async ()=>{
        try{
          const displayName = pane.querySelector("#name").value.trim() || "Игрок";
          const email = pane.querySelector("#regEmail").value.trim();
          const password = pane.querySelector("#regPass").value;

          if (!email) throw new Error("Укажите email");
          if (!password || password.length < 6) throw new Error("Пароль минимум 6 символов");

          await registerEmail({ email, password, displayName });
          notify("ok","Готово","Аккаунт создан, вы вошли");
          close();
        }catch(e){
          notify("bad","Ошибка регистрации", e.message);
        }
      });

      pane.querySelector("#toLogin").addEventListener("click", ()=> setMode("login"));
      return;
    }

    if (mode === "reset"){
      pane.innerHTML = `
        <div class="formgrid">
          <div class="muted">Мы отправим письмо для сброса пароля.</div>
          <div>
            <div class="label">Email</div>
            <input class="input" id="email" type="email" autocomplete="email" placeholder="you@mail.com" />
          </div>
          <div class="help-row">
            <button class="btn primary" id="send" style="width:auto;">Отправить</button>
            <button class="linkbtn" id="toLogin" type="button">Вернуться ко входу</button>
          </div>
        </div>
      `;

      pane.querySelector("#send").addEventListener("click", async ()=>{
        try{
          const email = pane.querySelector("#email").value.trim();
          if (!email) throw new Error("Укажите email");
          await resetPassword(email);
          notify("ok","Готово","Письмо отправлено");
        }catch(e){
          notify("bad","Ошибка", e.message);
        }
      });

      pane.querySelector("#toLogin").addEventListener("click", ()=> setMode("login"));
      return;
    }
  };

  seg.addEventListener("click", (e)=>{
    const b = e.target.closest("button[data-mode]");
    if (!b) return;
    setMode(b.dataset.mode);
  });

  setMode("login");
  return close;
}

function initTabs(){
  const tabs = document.getElementById("tabs");
  if (!tabs) return;
  tabs.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-route]");
    if (!btn) return;
    location.hash = `#${btn.dataset.route}`;
  });
}

function initTabsCollapse(){
  const toggle = document.getElementById("tabsToggle");
  const tabs = document.getElementById("tabs");
  if (!toggle || !tabs) return;

  const apply = ()=>{
    const isMobile = window.matchMedia("(max-width: 860px)").matches;
    if (!isMobile){
      tabs.classList.remove("collapsed");
      toggle.setAttribute("aria-expanded", "true");
      return;
    }
    if (!tabs.dataset.inited){
      tabs.classList.add("collapsed");
      toggle.setAttribute("aria-expanded", "false");
      tabs.dataset.inited = "1";
    }
  };

  apply();
  window.addEventListener("resize", apply);

  toggle.addEventListener("click", ()=>{
    const collapsed = tabs.classList.toggle("collapsed");
    toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  tabs.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-route]");
    if (!btn) return;
    if (window.matchMedia("(max-width: 860px)").matches){
      tabs.classList.add("collapsed");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

function renderUserbox(){
  const box = document.getElementById("userbox");
  box.innerHTML = "";

  if (!state.authed){
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Войти";
    btn.addEventListener("click", ()=> openLoginModal());
    box.appendChild(btn);
    return;
  }

  // Только кликабельный "я" (ник/аватар) + кнопка выхода
  const me = document.createElement("button");
  me.className = "btn";
  me.style.display = "flex";
  me.style.gap = "10px";
  me.style.alignItems = "center";
  me.style.width = "auto";
  me.title = "Открыть профиль";
  me.addEventListener("click", ()=>{ location.hash = "#profile"; });

  const avatar = document.createElement("img");
  avatar.className = "avatar";
  avatar.alt = "avatar";
  avatar.src = state.firebaseUser?.photoURL || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='100%25' height='100%25' fill='%23222'/%3E%3C/svg%3E";

  const meta = document.createElement("div");
  meta.style.display = "grid";
  meta.innerHTML = `<div class="username"></div><div class="userrole"></div>`;
  meta.querySelector(".username").textContent = state.userDoc?.displayName || state.firebaseUser?.displayName || "Игрок";
  meta.querySelector(".userrole").textContent = state.isAdmin ? "Админ" : "Пользователь";

  me.append(avatar, meta);

  const out = document.createElement("button");
  out.className = "btn";
  out.textContent = "Выйти";
  out.addEventListener("click", async ()=>{
    try{
      await logout();
      location.hash = "#home";
    }catch(e){
      notify("bad","Ошибка", e.message);
    }
  });

  box.append(me, out);
}

function showLoading(page){
  page.innerHTML = `
    <div class="card">
      <div class="section-title">Загрузка…</div>
      <div class="skeleton" style="width:62%"></div>
      <div style="height:10px"></div>
      <div class="skeleton" style="width:92%"></div>
      <div style="height:8px"></div>
      <div class="skeleton" style="width:85%"></div>
      <div style="height:8px"></div>
      <div class="skeleton" style="width:78%"></div>
    </div>
  `;
}

async function renderRoute(){
  cleanupChat();

  const { route, q } = parseHash();
  setActiveTab(route);
  setAuthedVisibility({ authed: state.authed, isAdmin: state.isAdmin });

  if ((route === "profile" || route === "chat" || route === "user") && !state.authed){
    location.hash = "#home";
    notify("warn", "Нужно войти", "Авторизуйтесь, чтобы открыть эту вкладку");
    return;
  }
  if (route === "admin" && !state.isAdmin){
    location.hash = "#home";
    notify("warn", "Нет доступа", "Только для админов");
    return;
  }

  const page = document.getElementById("page");
  showLoading(page);

  const ctx = {
    authed: state.authed,
    uid: state.uid,
    userDoc: state.userDoc,
    isAdmin: state.isAdmin,
    q
  };

  const pages = await pagesPromise;

  let nodePromise;
  switch(route){
    case "home": nodePromise = pages.home.renderHome(ctx); break;
    case "roster": nodePromise = pages.roster.renderRoster(ctx); break;
    case "events": nodePromise = pages.events.renderEvents(ctx); break;
    case "profile": nodePromise = pages.profile.renderProfile(ctx); break;
    case "chat": nodePromise = pages.chat.renderChat(ctx); break;
    case "admin": nodePromise = pages.admin.renderAdmin(ctx); break;
    case "user": nodePromise = pages.user.renderUser(ctx); break;
    default: location.hash = "#home"; return;
  }

  const node = await nodePromise;
  page.innerHTML = "";
  page.appendChild(node);
}

window.addEventListener("hashchange", renderRoute);

applyTheme();
initTabs();
initTabsCollapse();

initAuth(({ firebaseUser, userDoc })=>{
  state.firebaseUser = firebaseUser;
  state.userDoc = userDoc;
  state.authed = !!firebaseUser;
  state.uid = firebaseUser?.uid || null;
  state.isAdmin = (userDoc?.role === "admin");

  renderUserbox();
  setAuthedVisibility({ authed: state.authed, isAdmin: state.isAdmin });
  renderRoute();
});
