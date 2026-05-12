// Minimal types for Supabase Edge Functions (Deno).
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

interface Request {
  headers: Headers;
  json(): Promise<unknown>;
}

interface Headers {
  get(name: string): string | null;
}

interface Response {
  // opaque
}

declare const console: {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
};
