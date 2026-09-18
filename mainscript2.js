/*
hey warning! this code is pretty old and needs refactoring but that is hard so bleh.
*/
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
