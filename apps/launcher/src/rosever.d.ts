import type { LauncherApi } from '../electron/preload';

declare global {
  interface Window {
    rosever: LauncherApi;
  }
}

export {};
