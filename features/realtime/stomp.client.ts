"use client";

import { appConfig } from "@/lib/config";

type Frame = {
  command: string;
  headers: Record<string, string>;
  body: string;
};

type MessageHandler = (frame: Frame) => void;

export class StompClient {
  private socket: WebSocket | null = null;
  private sequence = 0;
  private readonly handlers = new Map<string, MessageHandler>();

  connect() {
    return new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(appConfig.websocketUrl, ["v12.stomp"]);
      this.socket = socket;

      socket.addEventListener("open", () => {
        this.sendFrame("CONNECT", {
          "accept-version": "1.2",
          "heart-beat": "0,0",
        });
      });

      socket.addEventListener("message", (event) => {
        const frames = parseFrames(String(event.data));

        for (const frame of frames) {
          if (frame.command === "CONNECTED") {
            resolve();
            continue;
          }

          if (frame.command === "ERROR") {
            reject(new Error(frame.body || "Não foi possível conectar à sala."));
            continue;
          }

          if (frame.command === "MESSAGE") {
            const subscription = frame.headers.subscription;
            const handler = subscription ? this.handlers.get(subscription) : undefined;

            handler?.(frame);
          }
        }
      });

      socket.addEventListener("error", () => {
        reject(new Error("Não foi possível conectar ao WebSocket."));
      });

      socket.addEventListener("close", () => {
        this.socket = null;
      });
    });
  }

  subscribe(destination: string, handler: MessageHandler) {
    const id = `subscription-${this.sequence++}`;

    this.handlers.set(id, handler);
    this.sendFrame("SUBSCRIBE", { id, destination });

    return () => {
      this.handlers.delete(id);
      this.sendFrame("UNSUBSCRIBE", { id });
    };
  }

  send(destination: string, payload: unknown) {
    this.sendFrame(
      "SEND",
      { destination, "content-type": "application/json" },
      JSON.stringify(payload),
    );
  }

  disconnect() {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendFrame("DISCONNECT", {});
      this.socket.close();
    }

    this.handlers.clear();
    this.socket = null;
  }

  private sendFrame(
    command: string,
    headers: Record<string, string>,
    body = "",
  ) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const headerLines = Object.entries(headers)
      .map(([name, value]) => `${name}:${value}`)
      .join("\n");

    this.socket.send(`${command}\n${headerLines}\n\n${body}\0`);
  }
}

function parseFrames(rawValue: string): Frame[] {
  return rawValue
    .split("\0")
    .map((rawFrame) => rawFrame.trimStart())
    .filter(Boolean)
    .map((rawFrame) => {
      const [headerSection, ...bodySections] = rawFrame.split("\n\n");
      const [command, ...headerLines] = headerSection.split("\n");
      const headers: Record<string, string> = {};

      for (const line of headerLines) {
        const separatorIndex = line.indexOf(":");

        if (separatorIndex > 0) {
          headers[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 1);
        }
      }

      return {
        command,
        headers,
        body: bodySections.join("\n\n"),
      };
    });
}
