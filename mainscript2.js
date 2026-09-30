/*

hey warning! this code is pretty old and needs refactoring but that is hard so bleh.

*/

let CURRENT_VERSION;
let viewsLoading = false;
let offlineMode;
let viewJSON;
let bypassOn;
const root = document.getElementById("root");
const updateLog = document.getElementById("update-log");
if (document.currentScript?.src) {
  const matchingCSS = document.createElement("link");
  matchingCSS.rel = "stylesheet";
  matchingCSS.href = new URL("main.css", document.currentScript.src).href;
  document.head.appendChild(matchingCSS);
}
let username = null;
let fatalError = false;
let currentDir = "root";
let sorting = "abc";
let currentTerminalHandler = null;
let html;
let aiOverlay = null;
let aiLog = null;
let aiInputEl = null;
let aiDragging = false;
let aiDragOffsetX = 0;
let aiDragOffsetY = 0;
let aiModel = "llama-3.3-70b-versatile";
let aiHistory = [];
const AI_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "groq/compound",
  "groq/compound-mini",
];
const AI_ENDPOINT = "https://sfools-stuff-342b8fbbb030.herokuapp.com/ai";
const rootLink = window.rootLink;
const directories = ["root", "games", "gooner", "chat"];
const files = {
  root: [
    {
      name: "discord",
      extension: ".txt",
      content: "join discord server for stuff https://discord.gg/F9wfAcBGsM",
    },
  ],
  games: [],
  themes: [],
};

window.onerror = function (msg, src, line, col, err) {
  if (
    !src ||
    src.includes("gcore.") ||
    src.includes("cdnjs.") ||
    src.includes("vanta") ||
    src.includes("three")
  )
    return false;
  alert(`ERR: ${msg}\nFile: ${src}\nLine: ${line}\n${err?.stack || ""}`);
  return false;
};

let gameWindow = null;
const launchListener = (e) => {
  if (e.key === "Enter") actuallyLaunch();
};

let socket = null;
let chatUsername = localStorage.getItem("chat-username") || null;
let currentRoom = null;
let chatOverlay = null;
let chatLog = null;
let chatInputEl = null;
let chatDragging = false;
let chatDragOffsetX = 0;
let chatDragOffsetY = 0;

const userColorMap = new Map();
const chatColors = [
  "#e06c75",
  "#61afef",
  "#98c379",
  "#e5c07b",
  "#c678dd",
  "#56b6c2",
  "#d19a66",
  "#ff79c6",
  "#8be9fd",
  "#50fa7b",
  "#ffb86c",
  "#bd93f9",
];

function getUserColor(u) {
  if (u === chatUsername) return "rgb(139, 253, 139)";
  if (userColorMap.has(u)) return userColorMap.get(u);
  let hash = 0;
  for (let i = 0; i < u.length; i++) hash = (hash * 31 + u.charCodeAt(i)) >>> 0;
  const color = chatColors[hash % chatColors.length];
  userColorMap.set(u, color);
  return color;
}

function connectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io("https://sfools-stuff-342b8fbbb030.herokuapp.com", {
    reconnection: false,
  });

  socket.on("connect", () => {
    const storedSession = localStorage.getItem("chat-session-id");
    socket.emit("session:init", { sessionId: storedSession || null });
  });

  socket.on("session:ready", ({ sessionId }) => {
    localStorage.setItem("chat-session-id", sessionId);
  });

  socket.on("session:banned", () => {
    localStorage.removeItem("chat-session-id");
    closeChatOverlay();
    log("chat: you have been banned", "error");
    loadTyper();
  });

  socket.on("room:force:closed", ({ code }) => {
    if (currentRoom === code) {
      currentRoom = null;
      closeChatOverlay();
      log(`chat: room [${code}] was closed by a moderator`, "warn");
      loadTyper();
    }
  });

  socket.on("disconnect", () => {
    if (chatOverlay) {
      currentRoom = null;
      closeChatOverlay();
      log("chat: disconnected from server", "error");
      loadTyper();
    }
  });

  socket.on("connect_error", () => {
    if (chatOverlay) {
      currentRoom = null;
      closeChatOverlay();
    }
    log("chat: could not reach server", "error");
    loadTyper();
  });

  socket.on("user:register:success", ({ username: u }) => {
    chatUsername = u;
    localStorage.setItem("chat-username", u);
    log(`chat: registered as ${u}`, "info");
    loadTyper();
  });

  socket.on("user:register:error", ({ message }) => {
    log(`chat: ${message}`, "error");
    loadTyper();
  });

  socket.on("room:created", ({ name, code, isPrivate }) => {
    log(
      `chat: room created — ${name} [${code}] ${isPrivate ? "private" : "public"}`,
      "info",
    );
    socket.emit("room:join", { code });
  });

  socket.on("room:join:success", ({ name, code, users: roomUsers }) => {
    currentRoom = code;
    openChatOverlay(name, code, roomUsers);
  });

  socket.on("room:join:error", ({ message }) => {
    log(`chat: ${message}`, "error");
    loadTyper();
  });

  socket.on("room:leave:success", () => {
    currentRoom = null;
    closeChatOverlay();
    loadTyper();
  });

  socket.on("room:user_joined", ({ username: u }) => {
    chatPrint(`\u2192 ${u} joined`, "info");
    updateUserList();
  });

  socket.on("room:user_left", ({ username: u }) => {
    chatPrint(`\u2190 ${u} left`, "info");
    updateUserList();
  });

  socket.on("room:users", ({ users: roomUsers }) => {
    renderUserList(roomUsers);
  });

  socket.on("message:receive", ({ from, message }) => {
    chatPrint(`@${from}: ${message}`, from === chatUsername ? "self" : "other");
  });

  socket.on("image:receive", ({ from, dataUrl, mimeType }) => {
    chatPrintImage(from, dataUrl, mimeType);
  });

  socket.on("rooms:public", (publicRooms) => {
    renderRoomList(publicRooms);
  });

  socket.on("error", ({ message }) => {
    log(`chat: ${message}`, "error");
    loadTyper();
  });
}

function ensureSocket(cb) {
  if (socket && socket.connected) {
    cb();
    return;
  }
  connectSocket();
  socket.once("connect", cb);
  socket.once("connect_error", () => {
    log("chat: failed to connect to server", "error");
    loadTyper();
  });
}

function openChatOverlay(name, code, roomUsers) {
  if (chatOverlay) closeChatOverlay();

  chatOverlay = document.createElement("div");
  chatOverlay.classList.add("chat-overlay");

  const header = document.createElement("div");
  header.classList.add("chat-overlay-header");

  const title = document.createElement("span");
  title.textContent = `${name} [${code}]`;
  title.classList.add("chat-overlay-title");

  const userBar = document.createElement("span");
  userBar.id = "chat-user-bar";
  userBar.classList.add("chat-overlay-users");
  userBar.textContent = `online: ${roomUsers.join(", ")}`;

  const leaveBtn = document.createElement("button");
  leaveBtn.textContent = "leave";
  leaveBtn.classList.add("chat-overlay-leave");
  leaveBtn.addEventListener("click", () => {
    socket.emit("room:leave", { code: currentRoom });
  });

  header.appendChild(title);
  header.appendChild(userBar);
  header.appendChild(leaveBtn);

  chatLog = document.createElement("div");
  chatLog.classList.add("chat-overlay-log");

  const inputRow = document.createElement("div");
  inputRow.classList.add("chat-overlay-input-row");
  inputRow.id = "chat-input-wrap";

  const label = document.createElement("span");
  label.classList.add("chat-overlay-prompt");
  label.style.color = getUserColor(chatUsername);
  label.textContent = `@${chatUsername}$ `;

  const field = document.createElement("input");
  field.type = "text";
  field.classList.add("chat-overlay-field");
  field.autocomplete = "off";
  field.spellcheck = false;
  chatInputEl = field;

  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    const val = field.value.trim();
    field.value = "";
    if (!val) return;
    socket.emit("message:send", { roomCode: currentRoom, message: val });
  });

  const imgInput = document.createElement("input");
  imgInput.type = "file";
  imgInput.accept = "image/png,image/jpeg,image/gif,image/webp";
  imgInput.style.display = "none";
  imgInput.addEventListener("change", () => {
    const file = imgInput.files[0];
    imgInput.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      chatPrint("image too large (max 2 MB)", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      const mimeType = file.type;
      socket.emit("image:send", { roomCode: currentRoom, dataUrl, mimeType });
    };
    reader.readAsDataURL(file);
  });

  const imgBtn = document.createElement("button");
  imgBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  imgBtn.classList.add("chat-overlay-img-btn");
  imgBtn.title = "send image";
  imgBtn.addEventListener("click", () => {
    imgInput.click();
  });

  inputRow.appendChild(label);
  inputRow.appendChild(field);
  inputRow.appendChild(imgBtn);
  inputRow.appendChild(imgInput);

  chatOverlay.appendChild(header);
  chatOverlay.appendChild(chatLog);
  chatOverlay.appendChild(inputRow);
  document.body.appendChild(chatOverlay);

  header.addEventListener("mousedown", (e) => {
    if (e.target === leaveBtn) return;
    chatDragging = true;
    const rect = chatOverlay.getBoundingClientRect();
    chatDragOffsetX = e.clientX - rect.left;
    chatDragOffsetY = e.clientY - rect.top;
    chatOverlay.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!chatDragging) return;
    chatOverlay.style.left = `${e.clientX - chatDragOffsetX}px`;
    chatOverlay.style.top = `${e.clientY - chatDragOffsetY}px`;
    chatOverlay.style.transform = "none";
  });

  document.addEventListener("mouseup", () => {
    chatDragging = false;
  });

  setTimeout(() => field.focus(), 0);
}

function closeChatOverlay() {
  if (!chatOverlay) return;
  chatOverlay.remove();
  chatOverlay = null;
  chatLog = null;
  chatInputEl = null;
}

function openAiOverlay() {
  if (aiOverlay) return;

  aiOverlay = document.createElement("div");
  aiOverlay.classList.add("chat-overlay");

  const header = document.createElement("div");
  header.classList.add("chat-overlay-header");

  const title = document.createElement("span");
  title.textContent = "ai chat";
  title.classList.add("chat-overlay-title");

  const modelSelect = document.createElement("select");
  modelSelect.classList.add("ai-model-select");
  AI_MODELS.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = m;
    if (m === aiModel) opt.selected = true;
    modelSelect.appendChild(opt);
  });
  modelSelect.addEventListener("change", () => {
    aiModel = modelSelect.value;
  });
  modelSelect.addEventListener("mousedown", (e) => e.stopPropagation());
  modelSelect.addEventListener("keydown", (e) => e.stopPropagation());

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "close";
  closeBtn.classList.add("chat-overlay-leave");
  closeBtn.addEventListener("click", closeAiOverlay);

  header.appendChild(title);
  header.appendChild(modelSelect);
  header.appendChild(closeBtn);

  aiLog = document.createElement("div");
  aiLog.classList.add("chat-overlay-log");

  const inputRow = document.createElement("div");
  inputRow.classList.add("chat-overlay-input-row");

  const label = document.createElement("span");
  label.classList.add("chat-overlay-prompt");
  label.textContent = "chud$ ";

  const field = document.createElement("input");
  field.type = "text";
  field.classList.add("chat-overlay-field");
  field.autocomplete = "off";
  field.spellcheck = false;
  aiInputEl = field;

  field.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key !== "Enter") return;
    const val = field.value.trim();
    if (!val) return;
    field.value = "";
    field.disabled = true;

    aiPrint(`chud: ${val}`, "self");
    aiHistory.push({ role: "user", content: val });

    const thinking = document.createElement("pre");
    thinking.textContent = "ai: thinking...";
    thinking.classList.add("info");
    aiLog.appendChild(thinking);
    aiLog.scrollTop = aiLog.scrollHeight;

    try {
      const res = await fetch(AI_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: aiModel, messages: aiHistory }),
      });
      const data = await res.json();
      thinking.remove();
      if (!res.ok) {
        aiPrint(`error: ${data.error || "unknown error"}`, "error");
        aiHistory.pop();
      } else {
        const reply = data.content || "";
        aiHistory.push({ role: "assistant", content: reply });
        aiPrint(`ai: ${reply}`, "other");
      }
    } catch (err) {
      thinking.remove();
      aiPrint(`error: ${err.message}`, "error");
      aiHistory.pop();
    }

    field.disabled = false;
    field.focus();
  });

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "clear";
  clearBtn.classList.add("chat-overlay-img-btn", "ai-clear-btn");
  clearBtn.addEventListener("click", () => {
    aiHistory = [];
    aiLog.innerHTML = "";
    aiPrint("context cleared", "info");
  });
  clearBtn.addEventListener("mousedown", (e) => e.stopPropagation());

  inputRow.appendChild(label);
  inputRow.appendChild(field);
  inputRow.appendChild(clearBtn);

  aiOverlay.appendChild(header);
  aiOverlay.appendChild(aiLog);
  aiOverlay.appendChild(inputRow);
  document.body.appendChild(aiOverlay);

  header.addEventListener("mousedown", (e) => {
    if (
      e.target === closeBtn ||
      e.target === modelSelect ||
      e.target === clearBtn
    )
      return;
    aiDragging = true;
    const rect = aiOverlay.getBoundingClientRect();
    aiDragOffsetX = e.clientX - rect.left;
    aiDragOffsetY = e.clientY - rect.top;
    aiOverlay.style.transition = "none";
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!aiDragging) return;
    aiOverlay.style.left = `${e.clientX - aiDragOffsetX}px`;
    aiOverlay.style.top = `${e.clientY - aiDragOffsetY}px`;
    aiOverlay.style.transform = "none";
  });

  document.addEventListener("mouseup", () => {
    aiDragging = false;
  });

  setTimeout(() => field.focus(), 0);
}

function closeAiOverlay() {
  if (!aiOverlay) return;
  aiOverlay.remove();
  aiOverlay = null;
  aiLog = null;
  aiInputEl = null;
}

function playIntroThenInit(versionCheck) {
  const overlay = document.createElement("div");
  overlay.id = "intro-overlay";
  overlay.classList.add("intro-overlay");

  const video = document.createElement("video");
  video.src = `${rootLink}intro.mp4`;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.classList.add("tutorial-video");

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "skip intro";
  skipBtn.classList.add("skip-intro-btn");

  let finished = false;
  function finishIntro() {
    if (finished) return;
    finished = true;
    localStorage.setItem("has-seen-intro", "true");
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 1000);
    showUIChoice();
  }

  video.addEventListener("ended", finishIntro);
  video.addEventListener("error", (e) => {
    console.error("intro video failed to load:", video.error, video.src);
    finishIntro();
  });
  skipBtn.addEventListener("click", finishIntro);

  overlay.appendChild(video);
  overlay.appendChild(skipBtn);
  document.body.appendChild(overlay);

  video.play().catch((err) => {
    console.error("blehhh error!", err);
    finishIntro();
  });
}

const TUTORIAL_PART_COUNT = 13;
let tutorialBlobUrl = null;
let tutorialLoadPromise = null;

function loadTutorialVideo(onProgress) {
  if (tutorialBlobUrl) return Promise.resolve(tutorialBlobUrl);
  if (tutorialLoadPromise) return tutorialLoadPromise;

  tutorialLoadPromise = (async () => {
    const parts = [];
    for (let i = 1; i <= TUTORIAL_PART_COUNT; i++) {
      const partNum = String(i).padStart(2, "0");
      if (onProgress) onProgress(i, TUTORIAL_PART_COUNT, partNum);
      const res = await fetch(`${rootLink}vijeo/tut.mov.part${partNum}`, {
        cache: "no-store",
      });
      if (!res.ok)
        throw new Error(
          `failed to fetch tut.mov.part${partNum} (${res.status})`,
        );
      const buf = await res.arrayBuffer();
      parts.push(buf);
    }
    const blob = new Blob(parts, { type: "video/quicktime" });
    tutorialBlobUrl = URL.createObjectURL(blob);
    return tutorialBlobUrl;
  })();

  tutorialLoadPromise.catch(() => {
    tutorialLoadPromise = null;
  });

  return tutorialLoadPromise;
}

function showFirstVisitPrompt() {
  const overlay = document.createElement("dialog");
  overlay.id = "first-visit-overlay";
  overlay.classList.add("first-visit-overlay");

  const box = document.createElement("div");
  box.classList.add("first-visit-box");

  const heading = document.createElement("h2");
  heading.textContent = "first time here?";

  const desc = document.createElement("p");
  desc.textContent = "want a tutorial on how 2 use the big sfools";

  const btnRow = document.createElement("div");
  btnRow.classList.add("first-visit-btn-row");

  const yesBtn = document.createElement("button");
  yesBtn.textContent = "yes, show me";
  yesBtn.classList.add("button-log");

  const noBtn = document.createElement("button");
  noBtn.textContent = "i know what im doing";
  noBtn.classList.add("button-log");

  btnRow.appendChild(yesBtn);
  btnRow.appendChild(noBtn);
  box.appendChild(heading);
  box.appendChild(desc);
  box.appendChild(btnRow);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.showModal();

  yesBtn.addEventListener("click", () => {
    overlay.close();
    overlay.remove();
    localStorage.setItem("has-seen-intro", "true");
    playTutorialThenInit();
  });

  noBtn.addEventListener("click", () => {
    overlay.close();
    overlay.remove();
    localStorage.setItem("has-seen-intro", "true");
    playIntroThenInit(true);
  });
}

function playTutorialThenInit() {
  const overlay = document.createElement("div");
  overlay.id = "tutorial-overlay";
  overlay.classList.add("tutorial-overlay");

  const loadingText = document.createElement("p");
  loadingText.textContent = "loading tutorial...";
  loadingText.classList.add("tutorial-loading-text");
  overlay.appendChild(loadingText);

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "skip tutorial";
  skipBtn.classList.add("overlay-corner-btn");

  let finished = false;
  function finishTutorial() {
    if (finished) return;
    finished = true;
    overlay.style.transition = "opacity 1s ease";
    overlay.style.opacity = "0";
    setTimeout(() => overlay.remove(), 1000);
    showUIChoice();
  }

  skipBtn.addEventListener("click", finishTutorial);
  overlay.appendChild(skipBtn);
  document.body.appendChild(overlay);

  loadTutorialVideo((i, total, partNum) => {
    loadingText.textContent = `loading tut.mov.part${partNum} (${i}/${total})...`;
  })
    .then((url) => {
      if (finished) return;
      loadingText.textContent = "combining parts...";

      const video = document.createElement("video");
      video.src = url;
      video.autoplay = true;
      video.playsInline = true;
      video.classList.add("tutorial-video");

      video.addEventListener("ended", finishTutorial);
      video.addEventListener("error", (e) => {
        console.error("tutorial video failed to play:", video.error);
        finishTutorial();
      });

      loadingText.remove();
      overlay.insertBefore(video, skipBtn);

      video.play().catch((err) => {
        console.error("tutorial video play blocked:", err);
        finishTutorial();
      });
    })
    .catch((err) => {
      console.error("failed to load tutorial:", err);
      loadingText.textContent = "failed to load tutorial, skipping...";
      setTimeout(finishTutorial, 1500);
    });
}

const UI_PREFERENCE_KEY = "sfools-ui";
let newUIGames = [];
let newUIState = { sort: "abc", query: "" };
let newUIViewRequestFinished = false;

function startSite() {
  if (!localStorage.getItem("has-seen-intro")) {
    showFirstVisitPrompt();
  } else if (!localStorage.getItem(UI_PREFERENCE_KEY)) {
    showUIChoice();
  } else {
    openSelectedUI();
  }
}

function showUIChoice() {
  document.getElementById("ui-choice")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "ui-choice";
  dialog.className = "first-visit-overlay";
  dialog.innerHTML = `<div class="first-visit-box">
    <h2>choose your UI</h2>
    <p>you can switch later from either UI.</p>
    <div class="first-visit-btn-row">
      <button type="button" class="button-log" data-ui="new">New UI</button>
      <button type="button" class="button-log" data-ui="terminal">Terminal UI</button>
    </div>
  </div>`;
  dialog.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ui]");
    if (!button) return;
    localStorage.setItem(UI_PREFERENCE_KEY, button.dataset.ui);
    dialog.close();
    dialog.remove();
    openSelectedUI();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}

function openSelectedUI() {
  if (localStorage.getItem(UI_PREFERENCE_KEY) === "new") initNewUI();
  else init(true);
}

function switchUI(ui) {
  localStorage.setItem(UI_PREFERENCE_KEY, ui);
  document.getElementById("btn-strip")?.remove();
  if (ui === "new") {
    if (currentTerminalHandler) {
      document.removeEventListener("keydown", currentTerminalHandler);
      currentTerminalHandler = null;
    }
    initNewUI();
  } else {
    init(false);
  }
}

function formatViews(count) {
  return Number(count).toLocaleString();
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "/" || !document.body.classList.contains("new-ui-mode")) return;
  const search = document.getElementById("new-ui-search");
  if (!search || document.activeElement === search) return;
  event.preventDefault();
  search.focus();
});

function renderNewUIGames() {
  const grid = document.getElementById("new-ui-grid");
  if (!grid) return;
  const query = newUIState.query;
  const games = newUIGames.filter((game) =>
    game.name.toLowerCase().includes(query) || String(game.id).includes(query),
  );
  if (newUIState.sort === "abc") {
    games.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
  } else if (newUIState.sort === "id") {
    games.sort((a, b) => Number(a.id) - Number(b.id));
  } else {
    games.sort((a, b) => getViewsForGame(b.id) - getViewsForGame(a.id));
  }
  grid.replaceChildren();
  if (!games.length) {
    const empty = document.createElement("p");
    empty.className = "new-ui-empty";
    empty.textContent = newUIGames.length ? "no games match your search" : "no games available";
    grid.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  games.forEach((game) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "new-ui-card";
    card.title = `play ${game.name}`;
    const thumb = document.createElement("span");
    thumb.className = "new-ui-thumb";
    const img = document.createElement("img");
    img.src = `${rootLink}img/${encodeURIComponent(game.id)}.png`;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => {
      img.remove();
      thumb.textContent = game.name.slice(0, 2).toUpperCase();
    }, { once: true });
    thumb.appendChild(img);
    const info = document.createElement("span");
    info.className = "new-ui-card-info";
    const name = document.createElement("span");
    name.className = "new-ui-name";
    name.textContent = game.name;
    const tags = document.createElement("span");
    tags.className = "new-ui-tags";
    const id = document.createElement("span");
    id.textContent = `id: ${game.id}`;
    const views = document.createElement("span");
    views.textContent = viewJSON ? `views: ${formatViews(getViewsForGame(game.id))}` :
      (newUIViewRequestFinished ? "views: unavailable" : "views: loading");
    tags.append(id, views);
    info.append(name, tags);
    card.append(thumb, info);
    card.addEventListener("click", () => openGameFromNewUI(game.id));
    fragment.appendChild(card);
  });
  grid.appendChild(fragment);
}

async function openGameFromNewUI(id) {
  const popup = bypassOn ? null : window.open("about:blank", "_blank");
  if (!bypassOn && !popup) {
    alert("allow popups to open games");
    return;
  }
  try {
    html = await loadGame(id);
    actuallyLaunch(popup);
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    alert(error.message);
  }
}

async function openExtraPage(page) {
  const popup = bypassOn ? null : window.open("about:blank", "_blank");
  if (!bypassOn && !popup) {
    alert("allow popups to open this page");
    return;
  }
  try {
    const base = await pickShittifyBase();
    const response = await fetch(`${base}/${page}?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`failed to open ${page} (${response.status})`);
    const pageHtml = await response.text();
    if (bypassOn) {
      const overlay = document.createElement("div");
      overlay.className = "bypass-overlay";
      const frame = document.createElement("iframe");
      frame.className = "bypass-iframe";
      frame.srcdoc = pageHtml;
      const close = document.createElement("button");
      close.className = "bypass-close-btn";
      close.textContent = "×";
      close.setAttribute("aria-label", "close page");
      close.addEventListener("click", () => { overlay.remove(); close.remove(); });
      overlay.appendChild(frame);
      document.body.append(overlay, close);
    } else if (!popup.closed) {
      popup.document.open();
      popup.document.write(pageHtml.replace(/<head([^>]*)>/i, `<head$1><base href="${base}/">`));
      popup.document.close();
    }
  } catch (error) {
    if (popup && !popup.closed) popup.close();
    alert(error.message);
  }
}

async function initNewUI() {
  newUIViewRequestFinished = Boolean(viewJSON);
  document.body.classList.add("new-ui-mode");
  document.getElementById("btn-strip")?.remove();
  root.innerHTML = `<div class="new-ui">
    <header class="new-ui-header">
      <h1>sfools v7</h1>
      <label class="new-ui-search"><span aria-hidden="true">⌕</span><input type="search" id="new-ui-search" placeholder="search games" autocomplete="off"></label>
      <nav class="new-ui-nav" aria-label="site navigation">
        <button type="button" class="new-ui-shittify" data-action="shittify" aria-label="open Shittify" title="Shittify"><img src="https://gcore.jsdelivr.net/gh/SomeRandomFella/shittifylol@master/logo.png" alt=""></button>
        <button type="button" data-action="movies">movies &amp; shows</button>
        <button type="button" data-action="ai">ai</button>
        <button type="button" data-action="chat">chat</button>
        <button type="button" data-action="updates">updates</button>
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSetcNAFkZMXlVZ9MCik9xGfTDwzhjtwP88WjLdH55BY4bqb9g/viewform?pli=1" target="_blank" rel="noopener">requests &amp; issues</a>
        <button type="button" data-action="terminal">terminal UI</button>
      </nav>
    </header>
    <main class="new-ui-main">
      <div class="new-ui-bar"><h2>all games</h2><div class="new-ui-pills" aria-label="sort games">
        <button type="button" data-sort="abc" aria-pressed="true">abc</button>
        <button type="button" data-sort="id" aria-pressed="false">id</button>
        <button type="button" data-sort="views" aria-pressed="false">views</button>
      </div></div>
      <p id="new-ui-status" class="new-ui-status" role="status">loading games...</p>
      <div id="new-ui-grid" class="new-ui-grid"></div>
    </main>
  </div>`;
  const ui = root.querySelector(".new-ui");
  ui.querySelector("#new-ui-search").addEventListener("input", (event) => {
    newUIState.query = event.target.value.trim().toLowerCase();
    renderNewUIGames();
  });
  ui.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", async () => {
    newUIState.sort = button.dataset.sort;
    ui.querySelectorAll("[data-sort]").forEach((pill) => pill.setAttribute("aria-pressed", String(pill === button)));
    if (newUIState.sort === "views" && !viewJSON) await getViews();
    renderNewUIGames();
  }));
  ui.querySelector(".new-ui-nav").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "movies") openExtraPage("FoolFlix.html");
    else if (action === "shittify") openExtraPage("shittify21.html");
    else if (action === "ai") openAiOverlay();
    else if (action === "chat") { currentDir = "chat"; switchUI("terminal"); commands.ls([]); }
    else if (action === "updates") checkNewUIUpdates(true);
    else if (action === "terminal") switchUI("terminal");
  });
  checkNewUIUpdates();
  try {
    const pages = await loadJSON();
    if (!ui.isConnected) return;
    newUIGames = Object.values(pages).flat().filter((game) => game && game.id != null && game.name);
    ui.querySelector("#new-ui-status").textContent = `${newUIGames.length} games`;
    renderNewUIGames();
    await getViews();
    newUIViewRequestFinished = true;
    if (ui.isConnected) renderNewUIGames();
  } catch (error) {
    if (ui.isConnected) ui.querySelector("#new-ui-status").textContent = error.message;
  }
}

async function checkNewUIUpdates(force = false) {
  try {
    const response = await fetch(`${rootLink}version.txt`, { cache: "no-cache" });
    if (!response.ok) throw new Error(`server responded with ${response.status}`);
    const version = (await response.text()).trim();
    CURRENT_VERSION = version;
    if (!force && !document.body.classList.contains("new-ui-mode")) return;
    await showUpdateMenu(version, force);
  } catch (error) {
    console.error("failed to check for updates", error);
    if (force) alert("failed to load updates");
  }
}

function replayTutorial() {
  const existing = document.getElementById("tutorial-replay-overlay");
  if (existing) return;

  const overlay = document.createElement("div");
  overlay.id = "tutorial-replay-overlay";
  overlay.classList.add("tutorial-overlay");

  const loadingText = document.createElement("p");
  loadingText.textContent = "loading tutorial...";
  loadingText.classList.add("tutorial-loading-text");
  overlay.appendChild(loadingText);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "close";
  closeBtn.classList.add("overlay-corner-btn");
  closeBtn.addEventListener("click", () => overlay.remove());

  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);

  loadTutorialVideo((i, total, partNum) => {
    loadingText.textContent = `loading tut.mov.part${partNum} (${i}/${total})...`;
  })
    .then((url) => {
      if (!document.body.contains(overlay)) return;

      const video = document.createElement("video");
      video.src = url;
      video.controls = true;
      video.playsInline = true;
      video.classList.add("tutorial-video");
      video.addEventListener("ended", () => overlay.remove());

      loadingText.remove();
      overlay.insertBefore(video, closeBtn);

      video.play().catch(() => {});
    })
    .catch((err) => {
      console.error("failed to load tutorial:", err);
      loadingText.textContent = "failed to load tutorial";
    });
}

function aiPrint(text, type) {
  if (!aiLog) return;
  const line = document.createElement("pre");
  if (type === "error") {
    line.textContent = text;
    line.classList.add("error");
  } else if (type === "info") {
    line.textContent = text;
    line.classList.add("info");
  } else {
    const colonIdx = text.indexOf(": ");
    if (colonIdx > 0) {
      const who = text.slice(0, colonIdx);
      const body = text.slice(colonIdx + 2);
      const nameSpan = document.createElement("span");
      nameSpan.textContent = who + ": ";
      nameSpan.classList.add(
        type === "self" ? "ai-name-self" : "ai-name-other",
      );
      line.appendChild(nameSpan);
      line.appendChild(document.createTextNode(body));
    } else {
      line.textContent = text;
    }
  }
  aiLog.appendChild(line);
  aiLog.scrollTop = aiLog.scrollHeight;
}

function chatPrint(text, type) {
  if (!chatLog) return;
  const line = document.createElement("pre");

  if (type === "error") {
    line.textContent = text;
    line.classList.add("error");
  } else if (type === "info") {
    line.textContent = text;
    line.classList.add("info");
  } else {
    const atIdx = text.indexOf("@");
    const colonIdx = text.indexOf(": ");
    if (atIdx === 0 && colonIdx > 1) {
      const uname = text.slice(1, colonIdx);
      const msgBody = text.slice(colonIdx + 2);

      const nameSpan = document.createElement("span");
      nameSpan.textContent = `@${uname}`;
      nameSpan.style.color = getUserColor(uname);
      nameSpan.classList.add("chat-name");

      const colonSpan = document.createElement("span");
      colonSpan.textContent = ": ";

      line.appendChild(nameSpan);
      line.appendChild(colonSpan);

      const words = msgBody.split(/(\s+)/);
      for (const word of words) {
        if (/^@\S+$/.test(word)) {
          const mentionSpan = document.createElement("span");
          mentionSpan.textContent = word;
          const mentionTarget = word.slice(1);
          mentionSpan.style.color = getUserColor(mentionTarget);
          mentionSpan.classList.add("chat-name");
          if (mentionTarget === chatUsername) {
            mentionSpan.style.textDecoration = "underline";
          }
          line.appendChild(mentionSpan);
        } else {
          line.appendChild(document.createTextNode(word));
        }
      }
    } else {
      line.textContent = text;
    }
  }

  chatLog.appendChild(line);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function chatPrintImage(from, dataUrl, mimeType) {
  if (!chatLog) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("chat-image-wrapper");

  const nameSpan = document.createElement("span");
  nameSpan.classList.add("chat-image-sender");
  nameSpan.textContent = `@${from}`;
  nameSpan.style.color = getUserColor(from);

  const img = document.createElement("img");
  img.src = dataUrl;
  img.classList.add("chat-image");
  img.alt = `image from ${from}`;
  img.addEventListener("click", () => {
    window.open(dataUrl, "_blank");
  });

  wrapper.appendChild(nameSpan);
  wrapper.appendChild(img);
  chatLog.appendChild(wrapper);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateUserList() {
  if (currentRoom) socket.emit("room:users", { code: currentRoom });
}

function renderUserList(roomUsers) {
  const bar = document.getElementById("chat-user-bar");
  if (bar) bar.textContent = `online: ${roomUsers.join(", ")}`;
}

function renderRoomList(publicRooms) {
  const roomDiv = document.createElement("div");
  roomDiv.classList.add("games");

  const headerRow = document.createElement("div");
  headerRow.classList.add("header");

  const codeHeader = document.createElement("p");
  codeHeader.textContent = "code";
  codeHeader.style.width = "60px";
  codeHeader.style.minWidth = "60px";
  codeHeader.style.borderRight = "1px solid white";

  const nameHeader = document.createElement("p");
  nameHeader.textContent = "name";

  headerRow.appendChild(codeHeader);
  headerRow.appendChild(nameHeader);
  roomDiv.appendChild(headerRow);

  if (!publicRooms.length) {
    log("no public rooms", "info");
    loadTyper();
    return;
  }

  publicRooms.forEach((r) => {
    const row = document.createElement("div");
    row.classList.add("game");

    const codeCell = document.createElement("p");
    codeCell.classList.add("id");
    codeCell.textContent = r.code;
    codeCell.style.width = "60px";
    codeCell.style.minWidth = "60px";
    codeCell.style.maxWidth = "60px";
    codeCell.style.overflow = "hidden";
    codeCell.style.textOverflow = "ellipsis";

    const rightCell = document.createElement("div");
    rightCell.classList.add("right-ls");

    const nameP = document.createElement("p");
    nameP.textContent = r.name;

    const usersP = document.createElement("p");
    usersP.classList.add("views");
    usersP.textContent = `users: ${r.memberCount}`;

    rightCell.appendChild(nameP);
    rightCell.appendChild(usersP);
    row.appendChild(codeCell);
    row.appendChild(rightCell);

    row.addEventListener("click", () => {
      ensureSocket(() => {
        if (!chatUsername) {
          log("chat: set a username first with 'name <username>'", "warn");
          loadTyper();
          return;
        }
        socket.emit("room:join", { code: r.code });
      });
    });

    roomDiv.appendChild(row);
  });

  root.appendChild(roomDiv);
  loadTyper();
}

function actuallyLaunch(openedWindow) {
  if (bypassOn) {
    const overlay = document.createElement("div");
    overlay.id = "bypass-overlay";
    overlay.classList.add("bypass-overlay");

    const closeBtn = document.createElement("button");
    closeBtn.id = "bypass-close";
    closeBtn.classList.add("bypass-close-btn");
    closeBtn.textContent = "\u00d7";

    const iframe = document.createElement("iframe");
    iframe.classList.add("bypass-iframe");
    iframe.srcdoc = html;

    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
    document.body.appendChild(closeBtn);

    closeBtn.addEventListener("click", () => {
      overlay.remove();
      closeBtn.remove();
    });

    return;
  }

  const gameWindow = openedWindow || window.open("about:blank", "_blank");
  if (!gameWindow) return;

  const originalHTML = html;

  function loadIntoWindow() {
    gameWindow.document.open();
    gameWindow.document.write(originalHTML);
    gameWindow.document.close();

    const erudaScript = gameWindow.document.createElement("script");
    erudaScript.src = "https://gcore.jsdelivr.net/npm/eruda";
    erudaScript.onload = () => {
      const initScript = gameWindow.document.createElement("script");
      initScript.textContent = `eruda.init();`;
      gameWindow.document.documentElement.appendChild(initScript);
    };
    gameWindow.document.documentElement.appendChild(erudaScript);
  }

  loadIntoWindow();
}

async function showUpdateMenu(latestVersion, force = false) {
  if (force || localStorage.getItem("update-log") !== latestVersion) {
    const updateAlert = document.createElement("dialog");
    updateAlert.classList.add("update-log");

    const res = await fetch(`${rootLink}update.json?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!res.ok) log("update thingy fetch failed", "error");

    const data = await res.json();

    const tip = document.createElement("div");
    tip.id = "tip";

    const tipH1 = document.createElement("h1");
    tipH1.textContent = `update v${data.version}`;

    const tipP = document.createElement("p");
    tipP.textContent = data.tip;

    tip.appendChild(tipH1);
    tip.appendChild(tipP);

    const listing = document.createElement("ul");
    data.list.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      listing.appendChild(li);
    });

    const footer = document.createElement("div");
    footer.id = "enoughWithTheWrappersSmh";

    const closeBtn = document.createElement("button");
    closeBtn.id = "closeMe";
    closeBtn.textContent = "close me";

    footer.appendChild(closeBtn);
    updateAlert.appendChild(tip);
    updateAlert.appendChild(listing);
    updateAlert.appendChild(footer);

    document.body.appendChild(updateAlert);
    updateAlert.showModal();
    localStorage.setItem("update-log", `${latestVersion}`);

    closeBtn.addEventListener("click", () => {
      updateAlert.close();
      updateAlert.remove();
    });
  }
}

const commands = {
  help: (args) => {
    if (args.length === 0) {
      log(
        `
help <command> - shows the list of commands or can help with certain commands
imreallydumb - for a toddler level guide
cd <dir> - navigate to a section (e.g cd games)
ls <page> - see all the current files in the dir and use pages for dirs with lots of files (do ls all to see all for games)
sort <abc or id> - changes how ls command sorts stuff by either alphabetically or numbered with id or views (sort abc, sort id or sort views)
cloak - cloaks the tab
game - open HTML5 games by numbered id
cat - open files
clear - clears console

--- chat dir commands ---
name <username> - set your chat username
ls - list public rooms
create <roomname> public - create a public room
create <roomname> private - create a private room
join <code> - join a room by code
        `,
        "info",
      );
    } else if (args[0] === "cd") {
      log(
        `
cd - use cd to go into a specific dir

all dirs:

-root

-games

-themes

-chat
        `,
        "info",
      );
    } else {
      log(`no specific help for '${args[0]}'`, "info");
    }

    loadTyper();
  },

  cd: (args) => {
    if (!args[0]) {
      log("cd: missing directory", "warn");
      loadTyper();
      return;
    }
    const dir = args[0];
    if (currentDir === dir) {
      log("cd: already in dir", "warn");
      loadTyper();
      return;
    }
    if (directories.includes(dir)) {
      currentDir = dir;
      init();
    } else {
      log(`cd: unknown directory '${dir}'`, "warn");
      loadTyper();
    }
  },

  name: (args) => {
    if (currentDir !== "chat") {
      log("name: not in chat dir", "warn");
      loadTyper();
      return;
    }
    if (currentRoom) {
      log("name: cannot change username while in a room", "warn");
      loadTyper();
      return;
    }
    const newName = args[0];
    if (!newName) {
      log("name: missing username", "warn");
      loadTyper();
      return;
    }
    ensureSocket(() => {
      try {
        socket.emit("user:register", { username: newName });
      } catch (e) {
        log("chat: failed to register username", "error");
        loadTyper();
      }
    });
  },

  ai: () => {
    openAiOverlay();
    loadTyper();
  },

  create: (args) => {
    if (currentDir !== "chat") {
      log("create: not in chat dir", "warn");
      loadTyper();
      return;
    }
    if (!chatUsername) {
      log("create: set a username first with 'name <username>'", "warn");
      loadTyper();
      return;
    }
    const roomName = args[0];
    const visibility = args[1];
    if (!roomName || !visibility) {
      log("create: how 2 use — create <roomname> public|private", "warn");
      loadTyper();
      return;
    }
    if (visibility !== "public" && visibility !== "private") {
      log("create: put it as must be 'public' or 'private'", "warn");
      loadTyper();
      return;
    }
    ensureSocket(() => {
      socket.emit("room:create", {
        name: roomName,
        isPrivate: visibility === "private",
      });
    });
  },

  join: (args) => {
    if (currentDir !== "chat") {
      log("join: not in chat dir", "warn");
      loadTyper();
      return;
    }
    if (!chatUsername) {
      log("join: set a username first with 'name <username>'", "warn");
      loadTyper();
      return;
    }
    const code = args[0];
    if (!code) {
      log("join: missing room code", "warn");
      loadTyper();
      return;
    }
    ensureSocket(() => {
      socket.emit("room:join", { code: code.toUpperCase() });
    });
  },

  exit: () => {
    loadTyper();
  },

  clear: () => {
    init();
  },

  imreallydumb: () => {
    log(
      'OK so to get to games (im assuming thats what ur here for) do cd games THEN ls all then click on a game u wanna play or do "game {id}"',
      "info",
    );
    loadTyper();
  },

  random: () => {
    if (currentDir !== "games") {
      log("random: not in games dir", "warn");
      loadTyper();
      return;
    }
    loadJSON()
      .then((stuff) => {
        const allGames = Object.values(stuff).flat();
        if (!allGames.length) {
          log("random: no games found", "warn");
          loadTyper();
          return;
        }
        const pick = allGames[Math.floor(Math.random() * allGames.length)];
        log(`launching: ${pick.name} (id: ${pick.id})`, "info");
        loadGame(pick.id).then((gameHtml) => {
          html = gameHtml;
          actuallyLaunch();
          loadTyper();
        });
      })
      .catch((err) => {
        log(`ERROR: ${err}`, "error");
        loadTyper();
      });
  },

  ls: async (args) => {
    if (currentDir === "chat") {
      ensureSocket(() => {
        socket.emit("rooms:list");
      });
      return;
    }

    const currentFiles = files[currentDir];
    if (currentDir === "games") {
      loadJSON()
        .then(async (stuff) => {
          if (sorting === "views" && !viewJSON) {
            log("loading view counts for sort...", "info");
            await getViews().catch(() => {});
          }

          const gameDiv = document.createElement("div");
          gameDiv.classList.add("games");

          const headerRow = document.createElement("div");
          headerRow.classList.add("header");

          const idHeader = document.createElement("p");
          idHeader.textContent = "id";

          const nameHeader = document.createElement("p");
          nameHeader.textContent = "name";

          headerRow.appendChild(idHeader);
          headerRow.appendChild(nameHeader);
          gameDiv.appendChild(headerRow);

          const searchWrap = document.createElement("div");
          searchWrap.classList.add("search-bar-wrap");

          const searchInput = document.createElement("input");
          searchInput.type = "text";
          searchInput.classList.add("game-search-input");
          searchInput.placeholder = "search games...";
          searchInput.autocomplete = "off";
          searchInput.spellcheck = false;

          searchWrap.appendChild(searchInput);
          gameDiv.appendChild(searchWrap);

          const pages = Object.keys(stuff).length;
          const currentPage = args[0] || 1;

          const renderGame = (gameObj) => {
            const gameidfk = document.createElement("div");
            gameidfk.classList.add("game");

            const viewText = viewJSON
              ? `views: ${getViewsForGame(gameObj.id)}`
              : "views: loading";

            const idCell = document.createElement("p");
            idCell.classList.add("id");
            idCell.textContent = gameObj.id;

            const rightCell = document.createElement("div");
            rightCell.classList.add("right-ls");

            const nameP = document.createElement("p");
            nameP.textContent = gameObj.name;

            const viewsP = document.createElement("p");
            viewsP.classList.add("views");
            viewsP.id = `views-${gameObj.id}`;
            viewsP.textContent = viewText;

            rightCell.appendChild(nameP);
            rightCell.appendChild(viewsP);
            gameidfk.appendChild(idCell);
            gameidfk.appendChild(rightCell);

            gameidfk.addEventListener("click", () => {
              loadGame(gameObj.id).then((gameHtml) => {
                html = gameHtml;
                actuallyLaunch();
              });
            });

            return gameidfk;
          };

          const sortGames = (arr) => {
            if (sorting === "abc")
              return [...arr].sort((a, b) => a.name.localeCompare(b.name));
            if (sorting === "id") return [...arr].sort((a, b) => a.id - b.id);
            if (sorting === "views")
              return [...arr].sort(
                (a, b) => getViewsForGame(b.id) - getViewsForGame(a.id),
              );
            return arr;
          };

          const patchViews = () => {
            const allGames = Object.values(stuff).flat();
            allGames.forEach((game) => {
              const el = document.getElementById(`views-${game.id}`);
              if (el) el.textContent = `views: ${getViewsForGame(game.id)}`;
            });

            if (sorting === "views") {
              const existingRows = gameDiv.querySelectorAll(".game");
              existingRows.forEach((r) => r.remove());
              sortGames(displayedGames).forEach((game) =>
                gameDiv.appendChild(renderGame(game)),
              );
            }
          };

          let displayedGames = [];

          if (args[0] === "all") {
            const allGames = Object.values(stuff).flat();
            displayedGames = sortGames(allGames);
            displayedGames.forEach((game) =>
              gameDiv.appendChild(renderGame(game)),
            );
            root.appendChild(gameDiv);
          } else if (stuff[currentPage]) {
            displayedGames = sortGames(stuff[currentPage]);
            displayedGames.forEach((game) =>
              gameDiv.appendChild(renderGame(game)),
            );
            root.appendChild(gameDiv);
            log(`(page ${currentPage} out of ${pages})`, "info");
          } else {
            log(`Page ${currentPage} not found`, "warn");
          }

          searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();

            const existingRows = gameDiv.querySelectorAll(".game");
            existingRows.forEach((r) => r.remove());

            const emptyMsg = gameDiv.querySelector(".search-empty");
            if (emptyMsg) emptyMsg.remove();

            const filtered = query
              ? displayedGames.filter(
                  (g) =>
                    g.name.toLowerCase().includes(query) ||
                    String(g.id).includes(query),
                )
              : displayedGames;

            if (filtered.length === 0) {
              const empty = document.createElement("p");
              empty.classList.add("info", "search-empty");
              empty.textContent = `no games matching "${query}"`;
              gameDiv.appendChild(empty);
            } else {
              filtered.forEach((game) => gameDiv.appendChild(renderGame(game)));
            }
          });

          searchInput.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.preventDefault();
          });

          loadTyper();

          if (!viewJSON) {
            getViews()
              .then(patchViews)
              .catch(() => {});
          } else {
            patchViews();
          }
        })
        .catch((err) => {
          log(`ERROR: ${err}`, "error");
          loadTyper();
        });
    } else {
      const names = currentFiles.map((f) => f.name + f.extension).join("  ");
      log(names || "no files", "info");
      loadTyper();
    }
  },

  cloak: () => {
    cloakk();
  },

  cat: (args) => {
    if (currentDir === "games") {
      log(
        "ERROR: cat cannot read html files, if you meant to open the file use 'game' instead",
        "error",
      );
      return loadTyper();
    }
    const file = args[0];
    const currentFiles = files[currentDir];
    const theFile = currentFiles.find((f) => f.name + f.extension === file);

    if (!file || !theFile) {
      log("cat: file not found", "warn");
      loadTyper();
    } else {
      log(theFile.content, "info");
      loadTyper();
    }
  },

  game: (args) => {
    if (currentDir !== "games") {
      log("games: not in games dir", "warn");
      loadTyper();
      return;
    }
    const game = args[0];
    if (!game) {
      log("game: no game specified", "warn");
      loadTyper();
    } else {
      const gameNumber = parseInt(game, 10);

      if (!isNaN(gameNumber)) {
        return loadGame(gameNumber)
          .then((gameHtml) => {
            log(`To launch game press "Enter"`, "info");
            html = gameHtml;
            document.addEventListener("keydown", launchListener, {
              once: true,
            });
          })
          .catch((err) => {
            log(`ERROR: ${err}`, "error");
            loadTyper();
          });
      }

      log(`${game}: command not found`, "error");
      loadTyper();
    }
  },

  sort: (args) => {
    const whatYouTyped = args[0];

    if (
      whatYouTyped === "abc" ||
      whatYouTyped === "id" ||
      whatYouTyped === "views"
    ) {
      sorting = whatYouTyped;
      log("succesfully changed sorting", "info");
      loadTyper();
    } else {
      log("error: you cannot sort through that...", "error");
      loadTyper();
    }
  },
};

window.addEventListener("beforeunload", () => {
  if (currentRoom && socket) {
    socket.emit("room:leave", { code: currentRoom });
  }
});

window.addEventListener("unhandledrejection", (event) => {
  log(event.reason, "error");
  loadTyper();
});

window.addEventListener("error", (event) => {
  log(event.error || event.message, "error");
  loadTyper();
});

function init(versionCheck) {
  const preference = localStorage.getItem(UI_PREFERENCE_KEY);
  if (!preference) return showUIChoice();
  if (preference === "new") return initNewUI();
  return initTerminal(versionCheck);
}

function initTerminal(versionCheck) {
  document.body.classList.remove("new-ui-mode");
  root.innerHTML = ``;
  log("DOM INITIALIZED.");
  setTimeout(() => {
    log("Loading modules...");
  }, 300);
  setTimeout(async () => {
    log(String.raw`
   ______     ______   ______     ______     __         ______
  /\  ___\   /\  ___\ /\  __ \   /\  __ \   /\ \       /\  ___\
  \ \___  \  \ \  __\ \ \ \/\ \  \ \ \/\ \  \ \ \____  \ \___  \
   \/\_____\  \ \_\    \ \_____\  \ \_____\  \ \_____\  \/\_____\
    \/_____/   \/_/     \/_____/   \/_____/   \/_____/   \/_____/
                                                    `);
    log('for list of commands type "help"', "info");
    addUIElements();

    if (versionCheck) {
      try {
        const res = await fetch(`${rootLink}version.txt`, {
          cache: "no-cache",
        });
        const version = (await res.text()).trim();

        if (!res.ok) throw new Error(`server responded with ${res.status}`);

        showUpdateMenu(version);
        CURRENT_VERSION = version;
        log(`updated to version ${version}`, "info");
      } catch (err) {
        log("error: Failed to get latest version.", "error");
      }
    }

    log("warn: report issues to amir", "warn");
    loadTyper();
  }, 700);
}

async function getViews() {
  if (viewJSON) return;
  if (viewsLoading) return;
  viewsLoading = true;
  try {
    const res = await fetch(
      `https://data.jsdelivr.com/v1/package/gh/picklechiplover23/htmlgames@master/stats?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    viewJSON = data.files;
  } catch (err) {
    console.error("failed to get game views", err);
    if (!document.body.classList.contains("new-ui-mode"))
      log("error: failed to get game views (DATA API not sfools fault)", "error");
  } finally {
    viewsLoading = false;
  }
}

function cloakk() {
  document.title = "Home - Google Drive";
  let favicon = document.querySelector("link[rel~='icon']");
  favicon.href =
    "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png";
  log("cloaked!");
  loadTyper();
}

function getViewsForGame(id) {
  if (!viewJSON) return 0;
  return viewJSON[`/games2/${id}.html`]?.total ?? 0;
}

const SHITTIFY_BASES = [
  "https://cdn.jsdelivr.net/gh/SomeRandomFella/shittifylol@master",
  "https://gcore.jsdelivr.net/gh/SomeRandomFella/shittifylol@master",
  "https://cdn.staticdelivr.com/gh/SomeRandomFella/shittifylol/master",
  "https://cdn.statically.io/gh/SomeRandomFella/shittifylol/master",
  "https://raw.githack.com/SomeRandomFella/shittifylol/master",
];
let shittifyBase = null;

async function pickShittifyBase() {
  if (shittifyBase) return shittifyBase;
  for (const u of SHITTIFY_BASES) {
    try {
      const res = await fetch(`${u}/shittify21.html`, { cache: "no-store" });
      if (res.ok) {
        shittifyBase = u;
        return u;
      }
    } catch {
      continue;
    }
  }
  shittifyBase = SHITTIFY_BASES[0];
  return shittifyBase;
}


async function fetchBuhPage() {
  const bases = [...new Set([shittifyBase, ...SHITTIFY_BASES].filter(Boolean))];
  for (const base of bases) {
    try {
      const response = await fetch(`${base}/buh.html?v=${Date.now()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) continue;
      const pageHtml = await response.text();
      if (!/<(?:!doctype\s+html|html)\b/i.test(pageHtml)) continue;
      return pageHtml;
    } catch {}
  }
  throw new Error("could not load buh.html from any configured mirror");
}

function addUIElements() {
  const existing = document.getElementById("btn-strip");
  if (existing) existing.remove();

  const strip = document.createElement("div");
  strip.id = "btn-strip";
  document.body.appendChild(strip);

  const button4 = document.createElement("button");
  button4.classList.add("button-general", "button-log", "spotify");
  const spotifyImg = document.createElement("img");
  spotifyImg.src =
    "https://gcore.jsdelivr.net/gh/SomeRandomFella/shittifylol@master/logo.png";
  button4.appendChild(spotifyImg);
  strip.appendChild(button4);

  button4.addEventListener("click", () => openExtraPage("shittify21.html"));

  const proxyBtn = document.createElement("button");
  proxyBtn.classList.add("button-general", "button-log", "dl-latest");
  proxyBtn.textContent = "proxy";
  proxyBtn.addEventListener("click", async () => {
    proxyBtn.blur();
    const useOverlay = Boolean(bypassOn);
    const popup = useOverlay ? null : window.open("", "_blank");
    if (!useOverlay && !popup) {
      log("proxy: allow popups to open buh", "warn");
      return;
    }
    proxyBtn.disabled = true;
    try {
      const pageHtml = await fetchBuhPage();
      if (useOverlay) {
        const overlay = document.createElement("div");
        overlay.id = "bypass-overlay";
        overlay.classList.add("bypass-overlay");
        const closeBtn = document.createElement("button");
        closeBtn.classList.add("bypass-close-btn");
        closeBtn.textContent = "\u00d7";
        closeBtn.setAttribute("aria-label", "close proxy");
        const iframe = document.createElement("iframe");
        iframe.classList.add("bypass-iframe");
        iframe.title = "buh proxy";
        iframe.allow =
          "fullscreen; autoplay; camera; microphone; clipboard-write";
        iframe.srcdoc = pageHtml;
        overlay.appendChild(iframe);
        document.body.appendChild(overlay);
        document.body.appendChild(closeBtn);
        closeBtn.addEventListener("click", () => {
          overlay.remove();
          closeBtn.remove();
        });
      } else if (!popup.closed) {
        popup.document.open();
        popup.document.write(pageHtml);
        popup.document.close();
      }
    } catch (error) {
      if (popup && !popup.closed) popup.close();
      log("proxy: " + error.message, "error");
    } finally {
      proxyBtn.disabled = false;
    }
  });
  strip.appendChild(proxyBtn);

  const button3 = document.createElement("button");
  button3.classList.add("button-general", "bypasser", "button-log");

  if (!bypassOn) {
    const p = document.createElement("p");
    p.appendChild(document.createTextNode("bypass: "));
    const span = document.createElement("span");
    span.classList.add("showerfalse");
    span.textContent = "off";
    p.appendChild(span);
    button3.appendChild(p);
  } else {
    const p = document.createElement("p");
    p.appendChild(document.createTextNode("bypass: "));
    const span = document.createElement("span");
    span.classList.add("showertrue");
    span.textContent = "on";
    p.appendChild(span);
    button3.appendChild(p);
  }
  strip.appendChild(button3);

  button3.addEventListener("click", () => {
    button3.blur();
    button3.innerHTML = "";
    if (bypassOn) {
      bypassOn = false;
      const p = document.createElement("p");
      p.appendChild(document.createTextNode("bypass: "));
      const span = document.createElement("span");
      span.classList.add("showerfalse");
      span.textContent = "off";
      p.appendChild(span);
      button3.appendChild(p);
      log("bypass disabled", "info");
      loadTyper();
    } else {
      bypassOn = true;
      const p = document.createElement("p");
      p.appendChild(document.createTextNode("bypass: "));
      const span = document.createElement("span");
      span.classList.add("showertrue");
      span.textContent = "on";
      p.appendChild(span);
      button3.appendChild(p);
      alert(
        "fyi, bypasser is NOT reccomended for normal use, ONLY use if your tabs are being automatically closed (via stahmer patch)",
      );
      log("bypass enabled", "info");
      loadTyper();
    }
  });

  const button2 = document.createElement("button");
  button2.classList.add("button-log");
  button2.textContent = "show update log";
  strip.appendChild(button2);

  button2.addEventListener("click", () => {
    button2.blur();
    showUpdateMenu(CURRENT_VERSION, true);
  });

  const button = document.createElement("button");
  button.classList.add("forum-button");
  button.textContent = "requests & issues";
  strip.appendChild(button);

  button.addEventListener("click", () => {
    button.blur();
    window.open(
      "https://docs.google.com/forms/d/e/1FAIpQLSetcNAFkZMXlVZ9MCik9xGfTDwzhjtwP88WjLdH55BY4bqb9g/viewform?usp=publish-editor",
      "_blank",
    );
  });

  const aiBtn = document.createElement("button");
  aiBtn.classList.add("button-general", "button-log", "dl-latest");
  aiBtn.textContent = "ai";
  aiBtn.addEventListener("click", () => {
    aiBtn.blur();
    openAiOverlay();
  });
  strip.appendChild(aiBtn);

  const cloakBtn = document.createElement("button");
  cloakBtn.classList.add("button-general", "button-log", "dl-latest");
  cloakBtn.textContent = "cloak";
  cloakBtn.addEventListener("click", () => {
    cloakBtn.blur();
    cloakk();
  });
  strip.appendChild(cloakBtn);

  const tutorialBtn = document.createElement("button");
  tutorialBtn.classList.add("button-general", "button-log", "dl-latest");
  tutorialBtn.textContent = "stutorial";
  tutorialBtn.addEventListener("click", () => {
    tutorialBtn.blur();
    replayTutorial();
  });
  strip.appendChild(tutorialBtn);

  const moviesBtn = document.createElement("button");
  moviesBtn.classList.add("button-general", "button-log");
  moviesBtn.textContent = "movies & shows";
  moviesBtn.addEventListener("click", async () => {
    moviesBtn.blur();
    const shittifyBaseUrl = await pickShittifyBase();
    const res = await fetch(
      `${shittifyBaseUrl}/FoolFlix.html?v=${Date.now()}`,
      { cache: "no-store" },
    );
    const pageHtml = await res.text();

    if (bypassOn) {
      const overlay = document.createElement("div");
      overlay.id = "bypass-overlay";
      overlay.classList.add("bypass-overlay");

      const closeBtn = document.createElement("button");
      closeBtn.classList.add("bypass-close-btn");
      closeBtn.textContent = "\u00d7";

      const iframe = document.createElement("iframe");
      iframe.classList.add("bypass-iframe");
      iframe.srcdoc = pageHtml;

      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
      document.body.appendChild(closeBtn);

      closeBtn.addEventListener("click", () => {
        overlay.remove();
        closeBtn.remove();
      });
    } else {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(pageHtml);
      w.document.close();
    }
  });
  strip.appendChild(moviesBtn);

  const cloudBtn = document.createElement("button");
  cloudBtn.classList.add("button-general", "button-log");
  cloudBtn.textContent = "cloud gaming";
  cloudBtn.addEventListener("click", async () => {
    cloudBtn.blur();
    const shittifyBaseUrl = await pickShittifyBase();
    const res = await fetch(`${shittifyBaseUrl}/cloud.html?v=${Date.now()}`, {
      cache: "no-store",
    });
    const pageHtml = await res.text();

    if (bypassOn) {
      const overlay = document.createElement("div");
      overlay.id = "bypass-overlay";
      overlay.classList.add("bypass-overlay");

      const closeBtn = document.createElement("button");
      closeBtn.classList.add("bypass-close-btn");
      closeBtn.textContent = "\u00d7";

      const iframe = document.createElement("iframe");
      iframe.classList.add("bypass-iframe");
      iframe.srcdoc = pageHtml;

      overlay.appendChild(iframe);
      document.body.appendChild(overlay);
      document.body.appendChild(closeBtn);

      closeBtn.addEventListener("click", () => {
        overlay.remove();
        closeBtn.remove();
      });
    } else {
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.open();
      w.document.write(pageHtml);
      w.document.close();
    }
  });
  strip.appendChild(cloudBtn);

  const newUIBtn = document.createElement("button");
  newUIBtn.classList.add("button-general", "button-log");
  newUIBtn.textContent = "new UI";
  newUIBtn.addEventListener("click", () => switchUI("new"));
  strip.appendChild(newUIBtn);
}

function log(text, type) {
  const consoleText = document.createElement("pre");
  consoleText.textContent = text;

  switch (type) {
    case "info":
      consoleText.classList.add("info");
      break;
    case "error":
      consoleText.classList.add("error");
      break;
    case "warn":
      consoleText.classList.add("warn");
      break;
    case "margin":
      consoleText.classList.add("marginless");
      break;
    case "support"
      consoleText.classList.add("support");
      break;
    default:
      break;
  }
  root.appendChild(consoleText);
  window.scrollTo(0, document.body.scrollHeight);
}

function checkInput(input) {
  const trimmed = input.trim();

  if (!trimmed) {
    loadTyper();
  } else {
    const [cmd, ...args] = trimmed.split(/\s+/);
    if (commands[cmd]) commands[cmd](args);
    else {
      log(`${cmd}: command not found`, "error");
      loadTyper();
    }
  }
}

function loadTyper() {
  const typingDiv = document.createElement("div");
  typingDiv.classList.add("typer");

  const nontype = document.createElement("div");
  const mainUsername = localStorage.getItem("username");
  nontype.textContent = `${mainUsername || "guest"}@host:${
    currentDir === "root" ? "~" : currentDir || "~"
  }$ `;

  const typing = document.createElement("div");
  typing.classList.add("typer");

  const inputSpan = document.createElement("span");
  inputSpan.classList.add("input");

  const cursorSpan = document.createElement("span");
  cursorSpan.classList.add("cursor");

  typing.appendChild(inputSpan);
  typing.appendChild(cursorSpan);

  const input = inputSpan;
  const cursor = cursorSpan;

  const handleTerminalLine = (e) => {
    if (chatInputEl && document.activeElement === chatInputEl) return;
    if (aiInputEl && document.activeElement === aiInputEl) return;
    if (e.key.length === 1) input.textContent += e.key;
    else if (e.key === "Backspace")
      input.textContent = input.textContent.slice(0, -1);
    else if (e.key === "Enter") {
      cursor.classList.remove("cursor");
      document.removeEventListener("keydown", handleTerminalLine);
      currentTerminalHandler = null;
      checkInput(input.textContent);
      window.scrollTo(0, document.body.scrollHeight);
    }
  };

  if (currentTerminalHandler) {
    const kill = document.querySelector(".cursor");
    if (kill) kill.remove();
    document.removeEventListener("keydown", currentTerminalHandler);
  }

  document.addEventListener("keydown", handleTerminalLine);
  currentTerminalHandler = handleTerminalLine;

  typingDiv.appendChild(nontype);
  typingDiv.appendChild(typing);
  root.appendChild(typingDiv);
  window.scrollTo(0, document.body.scrollHeight);
}

async function loadJSON() {
  try {
    const url = `${rootLink}games.json?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("network error");
    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`failed to load games: ${err.message}`);
  }
}

async function loadGame(id) {
  try {
    const response = await fetch(
      `${rootLink}games2/${id}.html?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("network error");
    const data = await response.text();
    return data;
  } catch (err) {
    throw new Error(`failed to load game: ${err.message}`);
  }
}

document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  return false;
});
