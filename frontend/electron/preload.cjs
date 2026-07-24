// Minimal, secure preload. Context isolation is on and node integration is
// off, so the renderer (the Next.js app) runs as a normal web page with no
// privileged access. We expose only a tiny, explicit API surface.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("aetherRAG", {
  isDesktop: true,
  // First-run / settings: persist the user's OpenRouter API key (no key is
  // bundled in the installer). These are the only privileged operations
  // exposed, and they are write-only/status-only — no arbitrary FS access.
  setApiKey: (key) => ipcRenderer.invoke("aetherrag:set-api-key", key),
  getApiKeyStatus: () => ipcRenderer.invoke("aetherrag:get-api-key-status"),
});
