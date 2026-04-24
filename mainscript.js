let CURRENT_VERSION;
let viewsLoading = false;
let offlineMode;
let viewJSON;
let bypassOn;
const lastUpdateLog = localStorage.getItem("update-log");
const root = document.getElementById("root");
const updateLog = document.getElementById("update-log");
let username = null;
let fatalError = false;
let currentDir = "root";
let sorting = "abc";
let currentTerminalHandler = null;
let html;
const rootLink =
  "https://cdn.jsdelivr.net/gh/picklechiplover23/htmlgames@master/";
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

  socket.on("connect_error", () => {
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
    chatPrint(`→ ${u} joined`, "info");
    updateUserList();
  });

  socket.on("room:user_left", ({ username: u }) => {
    chatPrint(`← ${u} left`, "info");
    updateUserList();
  });

  socket.on("room:users", ({ users: roomUsers }) => {
    renderUserList(roomUsers);
  });

  socket.on("message:receive", ({ from, message }) => {
    chatPrint(`@${from}: ${message}`, from === chatUsername ? "self" : "");
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
    if (e.key !== "Enter") return;
    const val = field.value.trim();
    field.value = "";
    if (!val) return;
    socket.emit("message:send", { roomCode: currentRoom, message: val });
  });

  inputRow.appendChild(label);
  inputRow.appendChild(field);

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
      const rest = text.slice(colonIdx);
      const nameSpan = document.createElement("span");
      nameSpan.textContent = `@${uname}`;
      nameSpan.style.color = getUserColor(uname);
      nameSpan.style.fontWeight = "bold";
      const restSpan = document.createElement("span");
      restSpan.textContent = rest;
      line.appendChild(nameSpan);
      line.appendChild(restSpan);
    } else {
      line.textContent = text;
    }
  }

  chatLog.appendChild(line);
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

  roomDiv.innerHTML = `
    <div class="header">
      <p>code</p>
      <p>name</p>
    </div>
  `;

  if (!publicRooms.length) {
    log("no public rooms", "info");
    loadTyper();
    return;
  }

  publicRooms.forEach((r) => {
    const row = document.createElement("div");
    row.classList.add("game");

    row.innerHTML = `
      <p class="id">${r.code}</p>
      <div class="right-ls">
        <p>${r.name}</p>
        <p class="views">users: ${r.memberCount}</p>
      </div>
    `;

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

function actuallyLaunch() {
  if (bypassOn) {
    const overlay = document.createElement("div");
    overlay.id = "bypass-overlay";
    overlay.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;";

    const closeBtn = document.createElement("button");
    closeBtn.id = "bypass-close";
    closeBtn.style.cssText =
      "position:fixed;top:12px;right:12px;width:36px;height:36px;border-radius:50%;background:#000;color:#fff;font-size:18px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10000;line-height:1;";
    closeBtn.textContent = "×";

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "width:100%;height:100%;border:none;";
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

  const gameWindow = window.open("", "_blank");
  if (!gameWindow) return;

  const originalHTML = html;

  function loadIntoWindow() {
    gameWindow.document.open();
    gameWindow.document.write(originalHTML);
    gameWindow.document.close();

    const erudaScript = gameWindow.document.createElement("script");
    erudaScript.src = "https://cdn.jsdelivr.net/npm/eruda";
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
  if (force || !lastUpdateLog || lastUpdateLog !== latestVersion) {
    const updateAlert = document.createElement("dialog");
    updateAlert.classList.add("update-log");

    const res = await fetch(`${rootLink}update.json?t=${Date.now()}`, {
      cache: "no-store",
    });

    if (!res.ok) log("update thingy fetch failed", "error");

    const data = await res.json();

    updateAlert.innerHTML = `
      <div id="tip">
        <h1>update v${data.version}</h1>
        <p>${data.tip}</p>
      </div>
      <ul></ul>
      <div id="enoughWithTheWrappersSmh">
        <button id="closeMe">close me</button>
      </div>
    `;

    const listing = updateAlert.querySelector("ul");

    data.list.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      listing.appendChild(li);
    });

    document.body.appendChild(updateAlert);
    updateAlert.showModal();
    localStorage.setItem("update-log", `${latestVersion}`);

    updateAlert.querySelector("#closeMe").addEventListener("click", () => {
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
    const newName = args[0];
    if (!newName) {
      log("name: missing username", "warn");
      loadTyper();
      return;
    }
    ensureSocket(() => {
      socket.emit("user:register", { username: newName });
    });
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
          const gameDiv = document.createElement("div");
          gameDiv.classList.add("games");

          gameDiv.innerHTML = `
            <div class="header">
              <p>id</p>
              <p>name</p>
            </div>
          `;

          const pages = Object.keys(stuff).length;
          const currentPage = args[0] || 1;

          const renderGame = (gameObj) => {
            const gameidfk = document.createElement("div");
            gameidfk.classList.add("game");

            const viewText = viewJSON
              ? `views: ${getViewsForGame(gameObj.id)}`
              : "views: loading";

            gameidfk.innerHTML = `
              <p class="id">${gameObj.id}</p>
              <div class="right-ls">
                <p>${gameObj.name}</p>
                <p class="views" id="views-${gameObj.id}">${viewText}</p>
              </div>
            `;

            gameidfk.addEventListener("click", () => {
              loadGame(gameObj.id).then((gameHtml) => {
                html = gameHtml;
                actuallyLaunch();
              });
            });

            return gameidfk;
          };

          const patchViews = () => {
            const allGames = Object.values(stuff).flat();
            allGames.forEach((game) => {
              const el = document.getElementById(`views-${game.id}`);
              if (el) el.textContent = `views: ${getViewsForGame(game.id)}`;
            });
          };

          if (args[0] === "all") {
            const allGames = Object.values(stuff).flat();
            let sorted;
            if (sorting === "abc")
              sorted = allGames.sort((a, b) => a.name.localeCompare(b.name));
            else if (sorting === "id")
              sorted = allGames.sort((a, b) => a.id - b.id);
            else if (sorting === "views")
              sorted = allGames.sort(
                (a, b) => getViewsForGame(b.id) - getViewsForGame(a.id),
              );

            sorted.forEach((game) => gameDiv.appendChild(renderGame(game)));
            root.appendChild(gameDiv);
          } else if (stuff[currentPage]) {
            let sortedGames;
            if (sorting === "abc")
              sortedGames = stuff[currentPage].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
            else if (sorting === "id")
              sortedGames = stuff[currentPage].sort((a, b) => a.id - b.id);
            else if (sorting === "views")
              sortedGames = stuff[currentPage].sort(
                (a, b) => getViewsForGame(b.id) - getViewsForGame(a.id),
              );

            sortedGames.forEach((game) =>
              gameDiv.appendChild(renderGame(game)),
            );
            root.appendChild(gameDiv);
            log(`(page ${currentPage} out of ${pages})`, "info");
          } else {
            log(`Page ${currentPage} not found`, "warn");
          }

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
      log(names || "No files", "info");
      loadTyper();
    }
  },

  cloak: () => {
    document.title = "Home - Google Drive";
    let favicon = document.querySelector("link[rel~='icon']");
    favicon.href =
      "https://ssl.gstatic.com/images/branding/product/1x/drive_2020q4_48dp.png";
    log("cloaked!");
    loadTyper();
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

if (document.currentScript === null) {
  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    init(true);
  } else {
    window.addEventListener("DOMContentLoaded", () => init(true));
  }
}

function init(versionCheck) {
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

    if (currentDir === "chat" && chatUsername) {
      log(`chat: logged in as ${chatUsername}`, "info");
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
    log("error: failed to get game views (DATA API not sfools fault)", "error");
  } finally {
    viewsLoading = false;
  }
}

function getViewsForGame(id) {
  if (!viewJSON) return 0;
  return viewJSON[`/games/${id}.html`]?.total ?? 0;
}

function addUIElements() {
  const button = document.createElement("button");
  button.classList.add("forum-button");
  button.textContent = "requests & issues";
  document.querySelector("body").appendChild(button);

  button.addEventListener("click", () => {
    button.blur();
    window.open(
      "https://docs.google.com/forms/d/e/1FAIpQLSetcNAFkZMXlVZ9MCik9xGfTDwzhjtwP88WjLdH55BY4bqb9g/viewform?usp=publish-editor",
      "_blank",
    );
  });

  const button2 = document.createElement("button");
  button2.classList.add("button-log");
  button2.textContent = "show update log";
  document.querySelector("body").appendChild(button2);

  button2.addEventListener("click", () => {
    button2.blur();
    showUpdateMenu(CURRENT_VERSION, true);
  });

  const button3 = document.createElement("button");
  button3.classList.add("button-general", "bypasser", "button-log");

  if (!bypassOn) {
    button3.innerHTML = "<p>bypass: <span class='showerfalse'>off</span></p>";
  } else {
    button3.innerHTML = "<p>bypass: <span class='showertrue'>on</span></p>";
  }

  document.querySelector("body").appendChild(button3);

  button3.addEventListener("click", () => {
    button3.blur();
    if (bypassOn) {
      bypassOn = false;
      button3.innerHTML = "<p>bypass: <span class='showerfalse'>off</span></p>";
      log("bypass disabled", "info");
      loadTyper();
    } else {
      bypassOn = true;
      button3.innerHTML = "<p>bypass: <span class='showertrue'>on</span></p>";
      alert(
        "fyi, bypasser is NOT reccomended for normal use, ONLY use if your tabs are being automatically closed (via stahmer patch)",
      );
      log("bypass enabled", "info");
      loadTyper();
    }
  });

  const button4 = document.createElement("button");
  button4.classList.add("button-general", "button-log", "spotify");
  button4.innerHTML = `<img src="https://cdn.jsdelivr.net/gh/SomeRandomFella/shittifylol@master/logo.png"/>`;
  document.querySelector("body").appendChild(button4);

  button4.addEventListener("click", async function () {
    this.blur();
    const res = await fetch(
      "https://cdn.jsdelivr.net/gh/SomeRandomFella/shittifylol@master/shittify21.html?v=" +
        Date.now(),
      { cache: "no-store" },
    );
    const pageHtml = await res.text();

    if (bypassOn) {
      const overlay = document.createElement("div");
      overlay.id = "bypass-overlay";
      overlay.style.cssText =
        "position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;";

      const closeBtn = document.createElement("button");
      closeBtn.style.cssText =
        "position:fixed;top:12px;right:12px;width:36px;height:36px;border-radius:50%;background:#000;color:#fff;font-size:18px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:10000;line-height:1;";
      closeBtn.textContent = "×";

      const iframe = document.createElement("iframe");
      iframe.style.cssText = "width:100%;height:100%;border:none;";
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
    case "support":
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
  typing.innerHTML = `<span class="input"></span><span class="cursor"></span>`;

  const input = typing.querySelector(".input");
  const cursor = typing.querySelector(".cursor");

  const handleTerminalLine = (e) => {
    if (chatInputEl && document.activeElement === chatInputEl) return;
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
      `${rootLink}games/${id}.html?v=${Date.now()}`,
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
