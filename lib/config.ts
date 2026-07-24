export const appConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080",
  websocketUrl: process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080/ws",
} as const;
