// Ambient type for the Electron preload bridge (window.aetherRAG). Present only
// in the packaged desktop app; undefined in a plain browser.
export {}

declare global {
  interface AetherRAGBridge {
    isDesktop: boolean
    setApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>
    getApiKeyStatus: () => Promise<{ configured: boolean }>
    openDataFolder: () => Promise<{ ok: boolean; path?: string; error?: string }>
  }

  interface Window {
    aetherRAG?: AetherRAGBridge
  }
}
