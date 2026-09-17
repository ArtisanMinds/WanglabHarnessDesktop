/*
 * @title dsh-tauri-model-config
 * @swagger 2.0
 * @version 0.0.0
 */

import type { FetchOptions } from "dsh-tauri/client";
import { ofetch } from "dsh-tauri/client";
import type * as Types from "./index.type";

export const baseURL = "/api/desktop/dsh-tauri-model-config";

/** @method post */
export function postConfigOpen(options?: FetchOptions) {
  return ofetch<Types.OpenModelsConfigResponse>("/config/open", { baseURL, method: "post", ...options });
}

/** @method get */
export function getRapidMlxModels(params?: Types.GetRapidMlxModelsQuery, options?: FetchOptions) {
  return ofetch<Types.RapidMlxModelsResponse>("/rapid-mlx/models", { baseURL, method: "get", params, ...options });
}
