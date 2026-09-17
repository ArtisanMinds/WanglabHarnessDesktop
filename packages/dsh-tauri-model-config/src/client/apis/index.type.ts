export type OpenModelsConfigResponse = {
  ok?: boolean;
  path?: string;
  opened?: "file" | "directory";
  error?: string;
};
export type RapidMlxModelsResponse = {
  ok?: boolean;
  models?: RapidMlxModelCard[];
  error?: string;
};
export type RapidMlxModelCard = {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
  input?: string[];
};

export interface GetRapidMlxModelsQuery {
  baseURL?: string;
}
