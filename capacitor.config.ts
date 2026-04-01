import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.markerofek.app",
  appName: "מרקר אופק",
  /**
   * Local assets copied on `cap sync` (Capacitor bridge, splash fallbacks).
   * The WebView loads the deployed app via `server.url` so production stays server-rendered.
   */
  webDir: "public",
  server: {
    url: "https://smart-building-os-rho.vercel.app",
    cleartext: true,
    androidScheme: "https",
  },
}

export default config
