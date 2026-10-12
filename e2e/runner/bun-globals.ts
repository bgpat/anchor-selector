interface BunServer {
  port: number;
  stop(closeActiveConnections?: boolean): void;
}

declare global {
  const Bun: {
    serve(options: {
      port?: number;
      hostname?: string;
      fetch(request: Request): Response | Promise<Response>;
    }): BunServer;
    file(path: string): Blob & { exists(): Promise<boolean> };
  };
}

export {};
