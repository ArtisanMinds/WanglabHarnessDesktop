export type SessionResumeResponse = {
  ok?: boolean;
  error?: string;
};

export interface PostSessionResumeBody {
  sessionId?: string;
}
