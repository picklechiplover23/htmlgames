let CURRENT_VERSION;
let offlineMode;
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
// aint no one using this cuh
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

function actuallyLaunch() {
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
      initScript.textContent = `
            eruda.init();
          `;
      gameWindow.document.documentElement.appendChild(initScript);
    };
    gameWindow.document.documentElement.appendChild(erudaScript);
  }

  loadIntoWindow();
}

async function showUpdateMenu(latestVersion) {
  if (!lastUpdateLog || lastUpdateLog !== latestVersion) {
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
      showDonate();
    });
  }
}

async function showDonate() {
  const dialogShow = document.createElement("dialog");
  dialogShow.classList.add("einstein-demands");

  const res = await fetch(`${rootLink}money.txt`, {
    cache: "no-store",
  });

  if (!res.ok) {
    log("donated amount fetch failed", "error");
    loadTyper();
  }

  const data = await res.text();

  dialogShow.innerHTML = `
               <img
        src="https://cdn.jsdelivr.net/gh/picklechiplover23/htmlgames@main/Farrow-JeffreyEpstein-2.webp"
        id="einstein"
      />
      <div class="info-demands">
        <h2>donate tight boy.</h2>
        <p>
          HEY YOU! do you wanna have a private youtube client? AND visit my
          private island? donate to SFools NOW! our goal is $30
        </p>
        <div class="donation-wrapper">
          <span class="amount">$0</span>

          <div class="progress-bar">
            <progress id="donation-progress" value="${data}" max="30"></progress>
          </div>

          <span class="amount">$30</span>
        </div>

        <div class="clicking-stuff">
          <button id="donate-now">yes i will</button>
        </div>
      </div>
        `;

  document.body.appendChild(dialogShow);
  dialogShow.showModal();

  const buttonClose = dialogShow.querySelector("#donate-now");

  buttonClose.addEventListener("click", () => {
    dialogShow.close();
    dialogShow.remove();
  });
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
sort <abc or id> - changes how ls command sorts stuff by either alphabetically or numbered with id
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

  ls: (args) => {
    const currentFiles = files[currentDir];
    if (currentDir === "games") {
      loadJSON()
        .then((stuff) => {
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

          if (args[0] === "all") {
            const allGames = Object.values(stuff).flat();
            let gays;

            if (sorting === "abc") {
              gays = allGames.sort((a, b) => a.name.localeCompare(b.name));
            } else if (sorting === "id") {
              gays = allGames.sort((a, b) => a.id - b.id);
            }

            gays.forEach((gay) => {
              const gameidfk = document.createElement("div");
              gameidfk.classList.add("game");

              gameidfk.innerHTML = `
                            <p class="id">${gay.id}</p>
                            <p>${gay.name}</p>
                          `;

              gameidfk.addEventListener("click", () => {
                loadGame(gay.id).then((gameHtml) => {
                  html = gameHtml;
                  actuallyLaunch();
                });
              });

              gameDiv.appendChild(gameidfk);
            });
            root.appendChild(gameDiv);
          } else if (stuff[currentPage]) {
            let sortedGames;

            if (sorting === "abc") {
              sortedGames = stuff[currentPage].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
            } else if (sorting === "id") {
              sortedGames = stuff[currentPage].sort((a, b) => a.id - b.id);
            }
            sortedGames.forEach((game) => {
              const gameidfk = document.createElement("div");
              gameidfk.classList.add("game");

              gameidfk.innerHTML = `
                            <p class="id">${game.id}</p>
                            <p>${game.name}</p>
                          `;

              gameidfk.addEventListener("click", () => {
                loadGame(game.id).then((gameHtml) => {
                  html = gameHtml;
                  actuallyLaunch();
                });
              });

              gameDiv.appendChild(gameidfk);
            });

            root.appendChild(gameDiv);
            log(`(page ${currentPage} out of ${pages})`, "info");
          } else {
            log(`Page ${currentPage} not found`, "warn");
          }
          loadTyper();
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

    if (whatYouTyped === "abc" || whatYouTyped === "id") {
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
    log("warn: this is a beta version, report issues to amir", "warn");
    loadTyper();
  }, 700);
}

function addUIElements() {
  const button = document.createElement("button");
  button.classList.add("forum-button");

  button.textContent = "requests & issues";

  document.querySelector("body").appendChild(button);

  button.addEventListener("click", () => {
    window.open(
      "https://docs.google.com/forms/d/e/1FAIpQLSetcNAFkZMXlVZ9MCik9xGfTDwzhjtwP88WjLdH55BY4bqb9g/viewform?usp=publish-editor",
      "_blank",
    );
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
  try {
    const url = `${rootLink}games.json?v=${Date.now()}`;

    const response = await fetch(url, {
      cache: "no-store",
    });

    if (!response.ok) throw new Error("network error");

    const data = await response.json();
    return data;
  } catch (err) {
    throw new Error(`Failed to load games: ${err.message}`);
  }
}

async function loadGame(id) {
  try {
    const response = await fetch(`${rootLink}games/${id}.html`);
    if (!response.ok) throw new Error("network error");
    const data = await response.text();
    return data;
  } catch (err) {
    throw new Error(`Failed to load game: ${err.message}`);
  }
}

// (function () {
//   const debug = new Function("debugger");
//   setInterval(debug, 100);
// })();

// document.addEventListener("keydown", function (e) {
//   if (e.keyCode === 123) {
//     e.preventDefault();
//     return false;
//   }

//   if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
//     e.preventDefault();
//     return false;
//   }

//   if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
//     e.preventDefault();
//     return false;
//   }

//   if (e.ctrlKey && e.shiftKey && e.keyCode === 67) {
//     e.preventDefault();
//     return false;
//   }

//   if (e.ctrlKey && e.keyCode === 85) {
//     e.preventDefault();
//     return false;
//   }

//   if (e.key === "F12") {
//     e.preventDefault();
//     return false;
//   }
// });

document.addEventListener("contextmenu", function (e) {
  e.preventDefault();
  return false;
});
