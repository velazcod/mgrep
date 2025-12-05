/**
 * Local embedding storage module.
 * Provides LocalStore implementation using Qdrant and OpenAI-compatible APIs.
 */

export type { LocalConfig } from "./config";
export { isLocalProvider, loadLocalConfig } from "./config";
export { LocalStore } from "./local-store";
