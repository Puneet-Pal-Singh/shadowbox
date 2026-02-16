/** Vite environment variables */
interface ImportMetaEnv {
  readonly VITE_BRAIN_BASE_URL?: string;
  readonly VITE_MUSCLE_BASE_URL?: string;
  readonly VITE_MUSCLE_WS_URL?: string;
  readonly MODE: "development" | "production";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
