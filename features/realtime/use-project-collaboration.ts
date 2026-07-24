"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { Participant } from "@/features/participants/participant.types";

import { StompClient } from "./stomp.client";

type ProjectEvent = {
  participantId: string;
  type: "pointer" | "click" | "scroll";
  payload: { x?: number; y: number };
};

export function useProjectCollaboration(
  slug: string,
  self: Participant | null,
  iframeRef: RefObject<HTMLIFrameElement | null>,
) {
  const [cursors, setCursors] = useState<Record<string, { x: number; y: number; clickedAt?: number }>>({});
  const clientRef = useRef<StompClient | null>(null);
  const selfRef = useRef(self);

  useEffect(() => { selfRef.current = self; }, [self]);

  useEffect(() => {
    if (!self) return;
    const currentSelf = self;
    const client = new StompClient();
    clientRef.current = client;
    let unsubscribe: (() => void) | undefined;
    let active = true;

    function sendProjectEvent(eventType: ProjectEvent["type"], payload: ProjectEvent["payload"]) {
      const currentSelf = selfRef.current;
      if (!currentSelf) return;
      client.send(`/app/rooms/${slug}/collaboration`, {
        participantId: currentSelf.participantId,
        type: eventType,
        payload,
      });
    }

    function onProjectMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.type !== "MEETING_PLATFORM_PROJECT_EVENT") return;
      if (!["pointer", "click", "scroll"].includes(data.eventType)) return;
      sendProjectEvent(data.eventType, data.payload);
    }

    async function connect() {
      try {
        await client.connect();
        if (!active) return client.disconnect();
        unsubscribe = client.subscribe(`/topic/rooms/${slug}/collaboration`, (frame) => {
          const event = JSON.parse(frame.body) as ProjectEvent;
          if (event.participantId === currentSelf.participantId) return;
          if (event.type === "pointer" || event.type === "click") {
            setCursors((current) => ({ ...current, [event.participantId]: { x: event.payload.x ?? 0, y: event.payload.y, clickedAt: event.type === "click" ? Date.now() : undefined } }));
          }
          iframeRef.current?.contentWindow?.postMessage({ type: "MEETING_PLATFORM_REMOTE_EVENT", eventType: event.type, payload: event.payload }, "*");
        });
        window.addEventListener("message", onProjectMessage);
      } catch {
        // A sala continua utilizavel mesmo que a colaboracao ainda nao conecte.
      }
    }
    void connect();

    return () => {
      active = false;
      window.removeEventListener("message", onProjectMessage);
      unsubscribe?.();
      client.disconnect();
      setCursors({});
    };
  }, [iframeRef, self, slug]);

  return { cursors };
}
