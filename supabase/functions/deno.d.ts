// Minimal types for Supabase Edge Functions (Deno).
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
};

declare const console: {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
};
