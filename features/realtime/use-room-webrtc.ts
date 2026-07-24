"use client";

import { useEffect, useRef, useState } from "react";

import type { Participant } from "@/features/participants/participant.types";

import { StompClient } from "./stomp.client";

type SignalMessage = {
  fromParticipantId: string;
  toParticipantId: string;
  type: "offer" | "answer" | "ice-candidate";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

const rtcConfiguration: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export function useRoomWebRtc(
  slug: string,
  self: Participant | null,
  participants: Participant[],
  localStream: MediaStream | null,
) {
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const clientRef = useRef<StompClient | null>(null);
  const peersRef = useRef(new Map<string, RTCPeerConnection>());
  const isConnectedRef = useRef(false);
  const localStreamRef = useRef<MediaStream | null>(localStream);
  const selfRef = useRef<Participant | null>(self);

  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);
  useEffect(() => { selfRef.current = self; }, [self]);

  function sendSignal(toParticipantId: string, type: SignalMessage["type"], payload: SignalMessage["payload"]) {
    const currentSelf = selfRef.current;
    if (!currentSelf || !clientRef.current) return;
    clientRef.current.send(`/app/rooms/${slug}/signal`, {
      fromParticipantId: currentSelf.participantId,
      toParticipantId,
      type,
      payload,
    });
  }

  function getPeer(remoteParticipantId: string) {
    const existing = peersRef.current.get(remoteParticipantId);
    if (existing) return existing;

    const peer = new RTCPeerConnection(rtcConfiguration);
    const stream = localStreamRef.current;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));

    peer.onicecandidate = (event) => {
      if (event.candidate) sendSignal(remoteParticipantId, "ice-candidate", event.candidate.toJSON());
    };
    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) setRemoteStreams((current) => ({ ...current, [remoteParticipantId]: remoteStream }));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        setRemoteStreams((current) => {
          const next = { ...current };
          delete next[remoteParticipantId];
          return next;
        });
      }
    };

    peersRef.current.set(remoteParticipantId, peer);
    return peer;
  }

  async function createOffer(remoteParticipantId: string) {
    const peer = getPeer(remoteParticipantId);
    if (peer.signalingState !== "stable") return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    sendSignal(remoteParticipantId, "offer", offer);
  }

  useEffect(() => {
    if (!self) return;
    const currentSelf = self;
    const client = new StompClient();
    clientRef.current = client;
    let unsubscribe: (() => void) | undefined;
    let active = true;

    async function connect() {
      try {
        await client.connect();
        if (!active) return client.disconnect();
        isConnectedRef.current = true;
        unsubscribe = client.subscribe(`/topic/rooms/${slug}/signal`, async (frame) => {
          const signal = JSON.parse(frame.body) as SignalMessage;
          if (signal.toParticipantId !== currentSelf.participantId || signal.fromParticipantId === currentSelf.participantId) return;
          const peer = getPeer(signal.fromParticipantId);
          if (signal.type === "offer") {
            await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);
            sendSignal(signal.fromParticipantId, "answer", answer);
          }
          if (signal.type === "answer") await peer.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
          if (signal.type === "ice-candidate") await peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
        });
      } catch {
        isConnectedRef.current = false;
      }
    }
    void connect();

    return () => {
      active = false;
      isConnectedRef.current = false;
      unsubscribe?.();
      client.disconnect();
      peersRef.current.forEach((peer) => peer.close());
      peersRef.current.clear();
      setRemoteStreams({});
    };
  }, [self, slug]);

  useEffect(() => {
    if (!self || !localStream || !isConnectedRef.current) return;
    const others = participants.filter((participant) => participant.participantId !== self.participantId);
    for (const other of others) {
      const peer = getPeer(other.participantId);
      const sentTrackIds = peer.getSenders().map((sender) => sender.track?.id);
      localStream.getTracks().forEach((track) => {
        if (!sentTrackIds.includes(track.id)) peer.addTrack(track, localStream);
      });
      if (self.role === "HOST" || peer.signalingState === "stable") void createOffer(other.participantId);
    }
  }, [localStream, participants, self]);

  return { remoteStreams };
}
