// ============================================================
//  AETHER RAG - Electron desktop shell (main process)
//
//  Boots the full stack inside one application and opens a native
//  window pointing at the Next.js app.
//
//  DEV  (npm run app, not packaged):
//    1. FastAPI backend via the source venv  (python -m uvicorn)
//    2. Next.js dev server                   (npm run dev)
//    3. Ollama LLM server (optional)         (:11434)
//
//  PROD (installed .exe, app.isPackaged):
//    1. Frozen FastAPI backend exe           (resources/backend/...)
//    2. Next.js standalone server.js via Electron's bundled Node
//    LLM is hosted (OpenRouter) — Ollama is NOT required.
//
//  Writable data (DB, vector store, uploads, model cache, logs) lives in
//  the user's writable userData folder, injected via env vars (which take
//  precedence over the bundled backend .env).
// ============================================================

const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const { spawn, execSync } = require("child_process");
const net = require("net");
const path = require("path");
const fs = require("fs");

const isDev = !app.isPackaged;

// --- Paths -------------------------------------------------------------
const FRONTEND_DIR = path.join(__dirname, "..");
const ROOT_DIR = path.join(FRONTEND_DIR, "..");
const BACKEND_DIR = path.join(ROOT_DIR, "backend");
const VENV_PY = path.join(BACKEND_DIR, "venv", "Scripts", "python.exe");
// App icon (dev window). In the packaged app the icon is embedded in the exe by
// electron-builder, so this guarded path simply no-ops there.
const ICON_PATH = path.join(FRONTEND_DIR, "build", "icon.ico");
const iconOption = () => (fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {});

// Packaged resources (extraResources land in process.resourcesPath).
const RES_DIR = process.resourcesPath || "";
const PROD_BACKEND_EXE = path.join(RES_DIR, "backend", "aetherrag-backend.exe");
const PROD_FRONTEND_DIR = path.join(RES_DIR, "frontend");
const PROD_FRONTEND_SERVER = path.join(PROD_FRONTEND_DIR, "server.js");

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;
const OLLAMA_PORT = 11434;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

// Child processes we spawn, so we can tear them down on quit.
const children = [];

// --- Helpers -----------------------------------------------------------

/** Resolve true if a TCP port is accepting connections. */
function isPortOpen(port, host = "127.0.0.1", timeout = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeout);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

/** Poll a port until it is open or we exhaust the timeout. */
async function waitForPort(port, { tries = 60, intervalMs = 1000 } = {}) {
  for (let i = 0; i < tries; i++) {
    if (await isPortOpen(port)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function track(child, name) {
  if (!child) return;
  child.on("exit", (code) =>
    console.log(`[${name}] exited with code ${code}`)
  );
  children.push({ child, name });
}

/**
 * Kill whatever process is LISTENING on a port. Used to clear a stale backend
 * or frontend before we start our own, so config/code changes always take
 * effect on relaunch (otherwise a lingering process gets silently reused).
 */
function killPort(port) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr LISTENING | findstr :${port}`, {
        encoding: "utf8",
      });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (/^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`taskkill /PID ${pid} /F /T`);
          console.log(`[killPort] freed :${port} (pid ${pid})`);
        } catch {}
      }
    } else {
      execSync(`lsof -ti tcp:${port} | xargs -r kill -9`);
    }
  } catch {
    // Nothing was listening on the port — fine.
  }
}

function killChildren() {
  for (const { child, name } of children) {
    try {
      // On Windows, kill the whole process tree.
      if (process.platform === "win32" && child.pid) {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"]);
      } else {
        child.kill();
      }
    } catch (e) {
      console.error(`Failed to kill ${name}:`, e.message);
    }
  }
}

/**
 * Build the writable runtime config for the PROD backend. The app is installed
 * read-only (Program Files), so DB / vector store / uploads / model cache / logs
 * are redirected into the user's writable userData folder. These env vars
 * override the bundled backend .env (env vars win in pydantic-settings).
 *
 * The OpenRouter key (and model) can be overridden by a settings.env in
 * userData; otherwise the bundled .env default is used.
 */
function prodBackendEnv() {
  const userData = app.getPath("userData");
  const dataDir = path.join(userData, "data");
  for (const sub of ["", "vector_store", "uploads", "model_cache", "logs"]) {
    try {
      fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
    } catch {}
  }
  // First run: seed the bundled embedding model into the writable cache so the
  // first launch works offline (no HuggingFace download). No-op if present.
  seedModelCache(path.join(dataDir, "model_cache"));
  // SQLite URL needs forward slashes even on Windows.
  const dbPath = path.join(dataDir, "sql_app.db").replace(/\\/g, "/");

  const env = {
    ...process.env,
    SECRET_KEY: readOrCreateSecret(userData),
    DATABASE_URL: `sqlite:///${dbPath}`,
    LANCE_URI: path.join(dataDir, "vector_store"),
    EMBEDDING_CACHE_DIR: path.join(dataDir, "model_cache"),
    UPLOAD_DIR: path.join(dataDir, "uploads"),
    LOG_DIR: path.join(dataDir, "logs"),
    APP_PORT: String(BACKEND_PORT),
    BACKEND_PORT: String(BACKEND_PORT),
    BACKEND_HOST: "127.0.0.1",
  };

  // Optional user overrides (e.g. their own OpenRouter key / model).
  const overridePath = path.join(userData, "settings.env");
  if (fs.existsSync(overridePath)) {
    for (const line of fs.readFileSync(overridePath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
    console.log("[backend] applied user overrides from settings.env");
  }
  return env;
}

/** Copy the bundled read-only embedding model into the writable cache on first
 *  run so the first launch needs no download. No-op if a model is already there. */
function seedModelCache(destDir) {
  const src = path.join(RES_DIR, "backend", "model_cache");
  try {
    if (!fs.existsSync(src)) return;
    const hasModel =
      fs.existsSync(destDir) &&
      fs.readdirSync(destDir).some((n) => n.startsWith("models--"));
    if (hasModel) return;
    fs.cpSync(src, destDir, { recursive: true });
    console.log("[backend] seeded bundled embedding model ->", destDir);
  } catch (e) {
    console.warn("[backend] embedding model seed failed:", e.message);
  }
}

/** Persist a generated SECRET_KEY in userData so tokens survive restarts. */
function readOrCreateSecret(userData) {
  const p = path.join(userData, "secret.key");
  try {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
    const key = require("crypto").randomBytes(32).toString("hex");
    fs.writeFileSync(p, key, "utf8");
    return key;
  } catch {
    return "aetherrag-fallback-secret";
  }
}

// --- Service launchers -------------------------------------------------

async function startOllama() {
  // Dev convenience only; prod uses hosted OpenRouter.
  if (!isDev) return;
  if (await isPortOpen(OLLAMA_PORT)) {
    console.log("[ollama] already running");
    return;
  }
  console.log("[ollama] starting...");
  try {
    const child = spawn("ollama", ["serve"], {
      detached: false,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    track(child, "ollama");
  } catch (e) {
    console.warn("[ollama] could not start (is it installed?):", e.message);
  }
}

async function startBackend() {
  killPort(BACKEND_PORT);

  if (isDev) {
    if (!fs.existsSync(VENV_PY)) {
      console.error(`[backend] venv python not found at ${VENV_PY}`);
      return;
    }
    console.log("[backend] starting FastAPI (dev/venv)...");
    const child = spawn(
      VENV_PY,
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
      { cwd: BACKEND_DIR, stdio: "inherit" }
    );
    track(child, "backend");
    return;
  }

  // PROD: spawn the frozen backend exe with userData-redirected config.
  if (!fs.existsSync(PROD_BACKEND_EXE)) {
    console.error(`[backend] frozen backend not found at ${PROD_BACKEND_EXE}`);
    return;
  }
  console.log("[backend] starting frozen FastAPI exe...");
  const env = prodBackendEnv();
  const child = spawn(PROD_BACKEND_EXE, [], {
    cwd: path.dirname(PROD_BACKEND_EXE),
    env,
    stdio: "inherit",
    // The frozen backend is a console app (keeps stdout valid for uvicorn);
    // hide its console window so no terminal pops up on launch.
    windowsHide: true,
  });
  track(child, "backend");
}

async function startFrontend() {
  killPort(FRONTEND_PORT);

  if (isDev) {
    console.log("[frontend] starting Next.js (dev)...");
    const child = spawn("npm", ["run", "dev"], {
      cwd: FRONTEND_DIR,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    track(child, "frontend");
    return;
  }

  // PROD: run the Next.js standalone server.js using Electron's bundled Node.
  if (!fs.existsSync(PROD_FRONTEND_SERVER)) {
    console.error(`[frontend] standalone server not found at ${PROD_FRONTEND_SERVER}`);
    return;
  }
  console.log("[frontend] starting Next.js standalone (bundled node)...");
  // The BFF persists app metadata (conversations/workspaces/...) to a JSON file
  // in this writable dir — the same userData/data folder the backend uses.
  const frontendDataDir = path.join(app.getPath("userData"), "data");
  try {
    fs.mkdirSync(frontendDataDir, { recursive: true });
  } catch {}
  const child = spawn(process.execPath, [PROD_FRONTEND_SERVER], {
    cwd: PROD_FRONTEND_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(FRONTEND_PORT),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
      AETHERRAG_DATA_DIR: frontendDataDir,
    },
    stdio: "inherit",
    windowsHide: true,
  });
  track(child, "frontend");
}

// --- First-run API key (no key is bundled) -----------------------------

function userSettingsPath() {
  return path.join(app.getPath("userData"), "settings.env");
}

/** Read userData/settings.env into a plain object (empty if absent). */
function readUserSettings() {
  const out = {};
  try {
    const p = userSettingsPath();
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2];
      }
    }
  } catch {}
  return out;
}

/** Persist the OpenRouter key to settings.env (merging existing keys). */
function persistApiKey(key) {
  const settings = readUserSettings();
  settings.OPENROUTER_API_KEY = key;
  const body =
    Object.entries(settings)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n";
  fs.writeFileSync(userSettingsPath(), body, "utf8");
}

function restartBackend() {
  killPort(BACKEND_PORT);
  startBackend();
}

// Renderer asks to save the key, then we restart the backend to pick it up.
ipcMain.handle("aetherrag:set-api-key", async (_evt, key) => {
  if (typeof key !== "string" || !/^sk-or-\S{10,}$/.test(key.trim())) {
    return { ok: false, error: "Invalid OpenRouter key (expected 'sk-or-...')." };
  }
  try {
    persistApiKey(key.trim());
    if (!isDev) restartBackend();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

ipcMain.handle("aetherrag:get-api-key-status", async () => {
  const settings = readUserSettings();
  return { configured: Boolean((settings.OPENROUTER_API_KEY || "").trim()) };
});

// Reveal the writable data folder so the user can copy it out as a backup. This
// is the same userData/data dir the backend + frontend persist into, so copying
// it captures the DB, vector store, uploads, and chat metadata in one folder.
ipcMain.handle("aetherrag:open-data-folder", async () => {
  const dataDir = path.join(app.getPath("userData"), "data");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const err = await shell.openPath(dataDir); // "" on success
    return err ? { ok: false, error: err } : { ok: true, path: dataDir };
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
});

// --- Window ------------------------------------------------------------

let mainWindow = null;
let loadingWindow = null;

function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 420,
    height: 240,
    frame: false,
    resizable: false,
    center: true,
    backgroundColor: "#0b0b0f",
    ...iconOption(),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  loadingWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`
        <html><body style="margin:0;display:flex;flex-direction:column;
          align-items:center;justify-content:center;height:100vh;
          font-family:Segoe UI,sans-serif;background:#0b0b0f;color:#e5e5e5;">
          <h2 style="margin:0 0 8px;">AETHER RAG</h2>
          <p style="color:#888;margin:0;">Starting services…</p>
        </body></html>`)
  );
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: "#0b0b0f",
    ...iconOption(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.loadURL(FRONTEND_URL);

  mainWindow.once("ready-to-show", () => {
    if (loadingWindow) {
      loadingWindow.close();
      loadingWindow = null;
    }
    mainWindow.show();
  });

  // Open external links in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(FRONTEND_URL)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// --- App lifecycle -----------------------------------------------------

async function boot() {
  createLoadingWindow();

  await startOllama();
  await startBackend();
  await startFrontend();

  // Wait for BOTH servers before showing the window. The backend is the slow
  // one on first run (Redis timeout + embedding-model download), so opening the
  // window on the frontend alone lets the user hit "Sign in" before auth is up,
  // producing "Authentication service unavailable".
  const backendReady = await waitForPort(BACKEND_PORT, { tries: 120, intervalMs: 1000 });
  if (!backendReady) {
    console.error("[boot] backend did not become ready in time");
  }
  const ready = await waitForPort(FRONTEND_PORT, { tries: 90, intervalMs: 1000 });
  if (!ready) {
    console.error("[boot] frontend did not become ready in time");
  }
  createMainWindow();
}

// Remove the default application menu bar (File / Edit / View / Window).
Menu.setApplicationMenu(null);

app.whenReady().then(boot);

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("window-all-closed", () => {
  killChildren();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", killChildren);
process.on("exit", killChildren);
