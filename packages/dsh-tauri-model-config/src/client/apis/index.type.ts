export type OpenModelsConfigResponse = {
  ok?: boolean;
  path?: string;
  opened?: "file" | "directory";
  error?: string;
};
