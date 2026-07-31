"use client";

import { useEffect, useState } from "react";

import type { Participant, ParticipantRole } from "@/features/participants/participant.types";
import { publicRequest } from "@/lib/api.client";

import { StompClient } from "./stomp.client";

type PresenceStatus = "idle" | "connecting" | "connected" | "error";

type ParticipantPresenceEvent = {
  type: "PARTICIPANT_JOINED";
  participantId: string;
  displayName: string;
  role: ParticipantRole;
};

export function useRoomPresence(slug: string, participant: Participant | null) {
  const [status, setStatus] = useState<PresenceStatus>("idle");
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    const participantId = participant?.participantId;

    if (!participantId) {
      return;
    }

    const client = new StompClient();
    let unsubscribe: (() => void) | undefined;
    let presenceRefreshInterval: number | undefined;
    let isActive = true;

    async function refreshActiveParticipants() {
      const activeParticipants = await publicRequest<Participant[]>(
        `/api/rooms/${slug}/participants`,
      );

      if (isActive) {
        setParticipants(activeParticipants);
      }
    }

    async function connect() {
      setStatus("connecting");

      try {
        await client.connect();

        if (!isActive) {
          client.disconnect();
          return;
        }

        await refreshActiveParticipants();
        presenceRefreshInterval = window.setInterval(
          () => void refreshActiveParticipants(),
          5_000,
        );

        unsubscribe = client.subscribe(
          `/topic/rooms/${slug}/presence`,
          (frame) => {
            const event = JSON.parse(frame.body) as ParticipantPresenceEvent;

            if (event.type !== "PARTICIPANT_JOINED") {
              return;
            }

            setParticipants((currentParticipants) => {
              const nextParticipant: Participant = {
                participantId: event.participantId,
                displayName: event.displayName,
                role: event.role,
              };

              const alreadyPresent = currentParticipants.some(
                (currentParticipant) =>
                  currentParticipant.participantId === nextParticipant.participantId,
              );

              return alreadyPresent
                ? currentParticipants
                : [...currentParticipants, nextParticipant];
            });
          },
        );

        client.send(`/app/rooms/${slug}/presence/join`, {
          participantId,
        });
        setStatus("connected");
      } catch {
        if (isActive) {
          setStatus("error");
        }
      }
    }

    void connect();

    return () => {
      isActive = false;
      window.clearInterval(presenceRefreshInterval);
      unsubscribe?.();
      client.disconnect();
    };
  }, [participant, slug]);

  return { participants, status };
}
