export const RESOLVE_SESSION_PATTERN = "auth.resolve-session";

export type ResolveSessionRequest = {
  sessionToken: string;
};

export type ResolveSessionResult =
  | {
      authenticated: true;
      accountId: string;
      username: string;
    }
  | {
      authenticated: false;
    };
