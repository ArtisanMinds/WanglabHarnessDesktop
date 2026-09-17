export type OpenModelsConfigResponse = {
  ok?: boolean;
  path?: string;
  opened?: "file" | "directory";
  error?: string;
};
export type EndpointModelsResponse = {
  ok?: boolean;
  url?: string;
  models?: EndpointModelCard[];
  error?: string;
};
export type EndpointModelCard = {
  id: string;
  name?: string;
  contextWindow?: number;
  maxTokens?: number;
};

export interface GetEndpointModelsQuery {
  ns?: string;
  profilePath?: string;
  baseURL?: string;
  apiKey?: string;
}
