/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Read-only shortlist viewer (GitHub Pages / local preview). */
  readonly VITE_PUBLIC_VIEWER?: string;
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
