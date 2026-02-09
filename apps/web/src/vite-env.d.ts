/** Vite environment variables */
interface ImportMetaEnv {
  readonly VITE_BRAIN_API_URL: string;
  // Add other env variables here as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
