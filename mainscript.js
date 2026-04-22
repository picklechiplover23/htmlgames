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
const directories = ["root", "games", "gooner"];
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

let gameWindow = null;
const launchListener = (e) => {
  if (e.key === "Enter") {
    actuallyLaunch();
  }
};

const DB_NAME = "sfools-asset-cache";
const DB_VERSION = 1;
const STORE_ASSETS = "assets";
const STORE_GAMES = "games";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: "url" });
      }
      if (!db.objectStoreNames.contains(STORE_GAMES)) {
        db.createObjectStore(STORE_GAMES, { keyPath: "id" });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbPutAsset(url, base64, mime) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, "readwrite");
    tx.objectStore(STORE_ASSETS).put({ url, base64, mime });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAsset(url) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ASSETS, "readonly");
    const req = tx.objectStore(STORE_ASSETS).get(url);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbPutGameHtml(id, html) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GAMES, "readwrite");
    tx.objectStore(STORE_GAMES).put({ id, html });
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetGameHtml(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GAMES, "readonly");
    const req = tx.objectStore(STORE_GAMES).get(id);
    req.onsuccess = (e) => resolve(e.target.result?.html ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAllGameIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_GAMES, "readonly");
    const req = tx.objectStore(STORE_GAMES).getAllKeys();
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

function buildShim(offlineRead) {
  return `
<script>
(function() {
  const OFFLINE_READ = ${offlineRead};
  const DB_NAME = "sfools-asset-cache";
  const DB_VERSION = 1;
  const STORE = "assets";

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "url" });
        }
        if (!db.objectStoreNames.contains("games")) {
          db.createObjectStore("games", { keyPath: "id" });
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  function dbGet(url) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(url);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror = (e) => reject(e.target.error);
    }));
  }

  function dbPut(url, base64, mime) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ url, base64, mime });
      tx.oncomplete = resolve;
      tx.onerror = (e) => reject(e.target.error);
    }));
  }

  function toBase64(arrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(arrayBuffer);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBlob(base64, mime) {
    const binary = atob(base64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function resolveUrl(url) {
    try { return new URL(url, location.href).href; } catch { return url; }
  }

  const _fetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const url = resolveUrl(typeof input === "string" ? input : input.url);
    if (OFFLINE_READ) {
      const cached = await dbGet(url).catch(() => null);
      if (cached) {
        const blob = base64ToBlob(cached.base64, cached.mime);
        return new Response(blob, { status: 200, headers: { "Content-Type": cached.mime } });
      }
    }
    const res = await _fetch(input, init);
    if (res.ok) {
      const clone = res.clone();
      clone.arrayBuffer().then(buf => {
        const mime = clone.headers.get("content-type") || "application/octet-stream";
        dbPut(url, toBase64(buf), mime).catch(() => {});
      }).catch(() => {});
    }
    return res;
  };

  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._shimUrl = resolveUrl(url);
    return _xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const xhr = this;
    const url = xhr._shimUrl;
    if (!url) return _xhrSend.apply(xhr, args);

    if (OFFLINE_READ) {
      dbGet(url).then(cached => {
        if (cached) {
          const blob = base64ToBlob(cached.base64, cached.mime);
          const blobUrl = URL.createObjectURL(blob);
          const fakeXhr = new XMLHttpRequest();
          fakeXhr.open("GET", blobUrl);
          fakeXhr.responseType = xhr.responseType || "";
          fakeXhr.addEventListener("load", () => {
            Object.defineProperty(xhr, "response", { get: () => fakeXhr.response, configurable: true });
            Object.defineProperty(xhr, "responseText", { get: () => { try { return fakeXhr.responseText; } catch { return ""; } }, configurable: true });
            Object.defineProperty(xhr, "status", { get: () => 200, configurable: true });
            Object.defineProperty(xhr, "readyState", { get: () => 4, configurable: true });
            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.dispatchEvent(new Event("load"));
            xhr.dispatchEvent(new ProgressEvent("loadend"));
            URL.revokeObjectURL(blobUrl);
          });
          fakeXhr.send();
        } else {
          _xhrSend.apply(xhr, args);
          installXhrCapture(xhr, url);
        }
      }).catch(() => {
        _xhrSend.apply(xhr, args);
        installXhrCapture(xhr, url);
      });
    } else {
      _xhrSend.apply(xhr, args);
      installXhrCapture(xhr, url);
    }
  };

  function installXhrCapture(xhr, url) {
    xhr.addEventListener("load", function() {
      try {
        if (xhr.status === 200) {
          if (xhr.responseType === "arraybuffer" && xhr.response) {
            const mime = xhr.getResponseHeader("content-type") || "application/octet-stream";
            dbPut(url, toBase64(xhr.response), mime).catch(() => {});
          } else if (xhr.responseType === "blob" && xhr.response) {
            xhr.response.arrayBuffer().then(b => {
              dbPut(url, toBase64(b), xhr.response.type || "application/octet-stream").catch(() => {});
            }).catch(() => {});
          } else {
            const text = xhr.responseText || "";
            const buf = new TextEncoder().encode(text).buffer;
            const mime = xhr.getResponseHeader("content-type") || "application/octet-stream";
            dbPut(url, toBase64(buf), mime).catch(() => {});
          }
        }
      } catch {}
    });
  }

  const _createElement = document.createElement.bind(document);
  document.createElement = function(tag, ...rest) {
    const el = _createElement(tag, ...rest);
    const tagLower = tag.toLowerCase();
    if (["img", "script", "audio", "video", "source", "link"].includes(tagLower)) {
      const attr = tagLower === "link" ? "href" : "src";
      let _val = "";
      const proto = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(proto, attr);
      Object.defineProperty(el, attr, {
        get() { return _val; },
        set(v) {
          _val = v;
          if (!v) return;
          const url = resolveUrl(v);
          if (OFFLINE_READ) {
            dbGet(url).then(cached => {
              if (cached) {
                const blob = base64ToBlob(cached.base64, cached.mime);
                const blobUrl = URL.createObjectURL(blob);
                if (descriptor && descriptor.set) descriptor.set.call(el, blobUrl);
                else el.setAttribute(attr, blobUrl);
              } else {
                if (descriptor && descriptor.set) descriptor.set.call(el, v);
                else el.setAttribute(attr, v);
                cacheUrlPassive(url);
              }
            }).catch(() => {
              if (descriptor && descriptor.set) descriptor.set.call(el, v);
              else el.setAttribute(attr, v);
            });
          } else {
            if (descriptor && descriptor.set) descriptor.set.call(el, v);
            else el.setAttribute(attr, v);
            cacheUrlPassive(url);
          }
        },
        configurable: true,
      });
    }
    return el;
  };

  function cacheUrlPassive(url) {
    _fetch(url).then(res => {
      if (!res.ok) return;
      const mime = res.headers.get("content-type") || "application/octet-stream";
      res.arrayBuffer().then(buf => {
        dbPut(url, toBase64(buf), mime).catch(() => {});
      }).catch(() => {});
    }).catch(() => {});
  }
})();
<\/script>
`;
}

function injectShim(gameHtml, offlineRead) {
  const shim = buildShim(offlineRead);
  const doctype = gameHtml.match(/^<!DOCTYPE[^>]*>/i)?.[0] ?? "";
  const withoutDoctype = doctype ? gameHtml.slice(doctype.length) : gameHtml;
  const headMatch = withoutDoctype.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = withoutDoctype.indexOf(headMatch[0]) + headMatch[0].length;
    return (
      doctype + withoutDoctype.slice(0, idx) + shim + withoutDoctype.slice(idx)
    );
  }
  const htmlMatch = withoutDoctype.match(/<html[^>]*>/i);
  if (htmlMatch) {
    const idx = withoutDoctype.indexOf(htmlMatch[0]) + htmlMatch[0].length;
    return (
      doctype +
      withoutDoctype.slice(0, idx) +
      "<head>" +
      shim +
      "</head>" +
      withoutDoctype.slice(idx)
    );
  }
  return doctype + shim + withoutDoctype;
}

let offlineModeActive = localStorage.getItem("offline-mode") === "true";

function actuallyLaunch() {
  const finalHtml = injectShim(html, offlineModeActive);

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
    iframe.srcdoc = finalHtml;

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

  function loadIntoWindow() {
    gameWindow.document.open();
    gameWindow.document.write(finalHtml);
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

    if (!res.ok) {
      log("update thingy fetch failed", "error");
    }

    const data = await res.json();

    updateAlert.innerHTML = `
            <div id="tip">
              <h1>update v${data.version}</h1>
              <p>${data.tip}</p>
            </div>
            <ul>
            </ul> 
            <div id="enoughWithTheWrappersSmh">
              <button id="closeMe">close me</button>
            </div>
          `;

    const listing = updateAlert.querySelector("ul");

    data.list.forEach((list) => {
      const specefic = document.createElement("li");
      specefic.textContent = list;
      listing.appendChild(specefic);
    });

    document.body.appendChild(updateAlert);
    updateAlert.showModal();
    localStorage.setItem("update-log", `${latestVersion}`);

    const buttonClose = updateAlert.querySelector("#closeMe");

    buttonClose.addEventListener("click", () => {
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
chat - DICONTINUED FOR NOW!
exit - exit chat room
clear - clears console
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

  chat: () => {
    log(
      "chat has been discontinued for now, as it has a lot of improvements and had a lot of issues.",
    );
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
              if (offlineModeActive) {
                dbGetGameHtml(gameObj.id)
                  .then((cached) => {
                    if (!cached) {
                      log(
                        `game ${gameObj.id}: not cached — open it online first`,
                        "warn",
                      );
                      loadTyper();
                      return;
                    }
                    html = cached;
                    actuallyLaunch();
                  })
                  .catch((err) => {
                    log(`ERROR: ${err}`, "error");
                    loadTyper();
                  });
                return;
              }
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
        if (offlineModeActive) {
          return dbGetGameHtml(gameNumber)
            .then((cached) => {
              if (!cached) {
                log(
                  `game ${gameNumber}: not cached — open it online first`,
                  "warn",
                );
                loadTyper();
                return;
              }
              log(`To launch game press "Enter"`, "info");
              html = cached;
              document.addEventListener("keydown", launchListener, {
                once: true,
              });
            })
            .catch((err) => {
              log(`ERROR: ${err}`, "error");
              loadTyper();
            });
        }
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
  if (roomId && username) {
    db.ref(`rooms/${roomId}/users/${username}`).remove();
  }
});

window.addEventListener("DOMContentLoaded", () => {
  init(true);

  window.addEventListener("unhandledrejection", (event) => {
    log(event.reason, "error");
    loadTyper();
  });

  window.addEventListener("error", (event) => {
    log(event.error || event.message, "error");
    loadTyper();
  });
});

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

        if (!res.ok) {
          throw new Error(`server responded with ${res.status}`);
        }

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
    if (offlineModeActive) {
      const cached = await dbGetAsset("__views_json__").catch(() => null);
      if (cached) {
        viewJSON = JSON.parse(atob(cached.base64));
        return;
      }
      log("views not cached yet — open ls online first", "warn");
      return;
    }
    const res = await fetch(
      `https://data.jsdelivr.com/v1/package/gh/picklechiplover23/htmlgames@master/stats?v=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    viewJSON = data.files;
    dbPutAsset(
      "__views_json__",
      btoa(JSON.stringify(data.files)),
      "application/json",
    ).catch(() => {});
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
  button.tabIndex = -1;
  button.textContent = "requests & issues";
  document.querySelector("body").appendChild(button);
  button.addEventListener("click", () => {
    document.body.focus();
    window.open(
      "https://docs.google.com/forms/d/e/1FAIpQLSetcNAFkZMXlVZ9MCik9xGfTDwzhjtwP88WjLdH55BY4bqb9g/viewform?usp=publish-editor",
      "_blank",
    );
  });

  const button2 = document.createElement("button");
  button2.classList.add("button-log");
  button2.tabIndex = -1;
  button2.textContent = "show update log";
  document.querySelector("body").appendChild(button2);
  button2.addEventListener("click", () => {
    document.body.focus();
    showUpdateMenu(CURRENT_VERSION, true);
  });

  const button3 = document.createElement("button");
  button3.classList.add("button-general");
  button3.classList.add("bypasser");
  button3.classList.add("button-log");
  button3.tabIndex = -1;
  if (!bypassOn) {
    button3.innerHTML = "<p>bypass: <span class='showerfalse'>off</span></p>";
  } else {
    button3.innerHTML = "<p>bypass: <span class='showertrue'>on</span></p>";
  }
  document.querySelector("body").appendChild(button3);
  button3.addEventListener("click", () => {
    document.body.focus();
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
  button4.classList.add("button-general");
  button4.classList.add("button-log");
  button4.classList.add("spotify");
  button4.tabIndex = -1;
  button4.innerHTML = `<img src="https://cdn.jsdelivr.net/gh/SomeRandomFella/shittifylol@master/logo.png"/>`;
  document.querySelector("body").appendChild(button4);
  button4.addEventListener("click", async () => {
    document.body.focus();
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

  const button5 = document.createElement("button");
  button5.classList.add("button-general");
  button5.classList.add("button-log");
  button5.classList.add("offline-btn");
  button5.tabIndex = -1;
  updateOfflineButton(button5);
  document.querySelector("body").appendChild(button5);
  button5.addEventListener("click", () => {
    document.body.focus();
    if (offlineModeActive) {
      offlineModeActive = false;
      localStorage.setItem("offline-mode", "false");
      updateOfflineButton(button5);
      log("offline mode disabled — everything will load normally", "info");
      loadTyper();
    } else {
      offlineModeActive = true;
      localStorage.setItem("offline-mode", "true");
      updateOfflineButton(button5);
      log(
        "offline mode enabled — you MUST open a game and do ls all in online mode for it to work",
        "warn",
      );
      loadTyper();
    }
  });
}

function updateOfflineButton(btn) {
  if (offlineModeActive) {
    btn.innerHTML = "<p>offline: <span class='showertrue'>on</span></p>";
  } else {
    btn.innerHTML = "<p>offline: <span class='showerfalse'>off</span></p>";
  }
}

function addAprilFools() {}

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
    kill.remove();
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
  if (offlineModeActive) {
    const cached = await dbGetAsset("__games_json__").catch(() => null);
    if (cached) {
      try {
        return JSON.parse(atob(cached.base64));
      } catch {}
    }
    throw new Error(
      "game not cached (you have to open it in online mode first)",
    );
  }
  try {
    const url = `${rootLink}games.json?v=${Date.now()}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("network error");
    const data = await response.json();
    const encoded = btoa(JSON.stringify(data));
    dbPutAsset("__games_json__", encoded, "application/json").catch(() => {});
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
    dbPutGameHtml(id, data).catch(() => {});
    return data;
  } catch (err) {
    throw new Error(`failed to load game: ${err.message}`);
  }
}

document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  return false;
});

window.addEventListener("beforeunload", function (e) {
  e.preventDefault();
  e.returnValue = "";
  return "";
});
