"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";

import { useRoomPresence } from "@/features/realtime/use-room-presence";
import { useRoomWebRtc } from "@/features/realtime/use-room-webrtc";
import { useProjectCollaboration } from "@/features/realtime/use-project-collaboration";
import { authenticatedRequest, publicRequest } from "@/lib/api.client";
import { ConfirmationModal } from "@/features/rooms/components/confirmation-modal";

import type { Participant, JoinRoomRequest } from "../participant.types";
import type { PublicRoom } from "@/features/rooms/room.types";

type RoomLobbyProps = {
  slug: string;
  isHostRequested: boolean;
};

export function RoomLobby({ slug, isHostRequested }: RoomLobbyProps) {
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [name, setName] = useState("");
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isCloseConfirmationOpen, setIsCloseConfirmationOpen] = useState(false);
  const [isControlsCollapsed, setIsControlsCollapsed] = useState(false);
  const [isParticipantRailOpen, setIsParticipantRailOpen] = useState(true);
  const [isParticipantListOpen, setIsParticipantListOpen] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const projectFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const { participants, status } = useRoomPresence(slug, participant);
  const { remoteStreams } = useRoomWebRtc(slug, participant, participants, localStream);
  const { cursors } = useProjectCollaboration(slug, participant, projectFrameRef);

  useEffect(() => {
    async function loadRoom() {
      // Restored before the network call resolves, so a slow or briefly failing request on
      // refresh never wipes an identity the guest already had — it just retries the room fetch
      // around it, instead of dropping them back to the "type your name" form.
      if (!isHostRequested) {
        const savedParticipant = sessionStorage.getItem(
          `meeting-platform.guest-participant.${slug}`,
        );

        if (savedParticipant) {
          setParticipant(JSON.parse(savedParticipant) as Participant);
        }
      }

      try {
        const publicRoom = await publicRequest<PublicRoom>(`/api/rooms/${slug}`);
        setRoom(publicRoom);

        if (isHostRequested) {
          const hostParticipant = await authenticatedRequest<Participant>(
            `/api/rooms/${slug}/participants/host`,
            { method: "POST" },
          );

          setParticipant(hostParticipant);
        }
      } catch (error) {
        setError(
          isHostRequested
            ? "Você não tem permissão para apresentar esta sala."
            : error instanceof Error
              ? error.message
              : "Não encontramos esta sala. Verifique o link recebido.",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadRoom();
  }, [isHostRequested, slug]);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [isCameraOn]);

  useEffect(() => {
    if (!participant || isHostRequested) {
      return;
    }

    async function refreshRoomStatus() {
      try {
        const updatedRoom = await publicRequest<PublicRoom>(`/api/rooms/${slug}`);
        setRoom(updatedRoom);
      } catch {
        // A mensagem principal continua sendo tratada no carregamento inicial.
      }
    }

    const intervalId = window.setInterval(() => void refreshRoomStatus(), 3_000);
    return () => window.clearInterval(intervalId);
  }, [isHostRequested, participant, room?.status, slug]);

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsJoining(true);

    try {
      const joinedParticipant = await publicRequest<Participant>(
        `/api/rooms/${slug}/participants`,
        {
          method: "POST",
          body: JSON.stringify({ displayName: name } satisfies JoinRoomRequest),
        },
      );

      sessionStorage.setItem(
        `meeting-platform.guest-participant.${slug}`,
        JSON.stringify(joinedParticipant),
      );
      setParticipant(joinedParticipant);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível entrar na sala.");
    } finally {
      setIsJoining(false);
    }
  }

  async function handleCopyGuestLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${slug}`);
    setIsLinkCopied(true);
    window.setTimeout(() => setIsLinkCopied(false), 1_500);
  }

  async function handleStartPresentation() {
    setError(null);
    setIsStarting(true);

    try {
      const startedRoom = await authenticatedRequest<PublicRoom>(
        `/api/rooms/${slug}/start`,
        { method: "PATCH" },
      );
      setRoom(startedRoom);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível iniciar a apresentação.");
    } finally {
      setIsStarting(false);
    }
  }

  async function ensureLocalMedia() {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    stream.getVideoTracks().forEach((track) => { track.enabled = isCameraOn; });
    stream.getAudioTracks().forEach((track) => { track.enabled = !isMicMuted; });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }

  async function handleCameraToggle() {
    try {
      const stream = await ensureLocalMedia();
      const nextState = !isCameraOn;
      stream.getVideoTracks().forEach((track) => { track.enabled = nextState; });
      setIsCameraOn(nextState);
    } catch {
      setError("Não foi possível acessar sua câmera. Verifique a permissão do navegador.");
    }
  }

  async function handleMicrophoneToggle() {
    try {
      const stream = await ensureLocalMedia();
      const nextMutedState = !isMicMuted;
      stream.getAudioTracks().forEach((track) => { track.enabled = !nextMutedState; });
      setIsMicMuted(nextMutedState);
    } catch {
      setError("Não foi possível acessar seu microfone. Verifique a permissão do navegador.");
    }
  }

  async function handleScrollLockToggle() {
    if (!room) return;

    setError(null);

    try {
      const updatedRoom = await authenticatedRequest<PublicRoom>(
        `/api/rooms/${slug}/presentation-settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ scrollLocked: !room.scrollLocked, presentationActive: room.presentationActive !== false }),
        },
      );
      setRoom(updatedRoom);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível alterar a navegação do projeto.");
    }
  }

  async function handlePresentationToggle() {
    if (!room) return;

    setError(null);
    try {
      const updatedRoom = await authenticatedRequest<PublicRoom>(
        `/api/rooms/${slug}/presentation-settings`,
        {
          method: "PATCH",
          body: JSON.stringify({ scrollLocked: room.scrollLocked, presentationActive: room.presentationActive === false }),
        },
      );
      setRoom(updatedRoom);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível alterar o modo da apresentação.");
    }
  }

  async function handleCloseRoom() {
    setError(null);
    setIsClosing(true);

    try {
      await authenticatedRequest<PublicRoom>(`/api/rooms/${slug}/close`, {
        method: "PATCH",
      });
      window.location.assign("/dashboard/rooms");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível encerrar a sala.");
      setIsClosing(false);
    }
  }

  if (isLoading) return <main className="grid min-h-screen place-items-center bg-[#f8f8f6] text-[#77736c]">Abrindo sala...</main>;
  if (!room) return <main className="grid min-h-screen place-items-center bg-[#f8f8f6] px-6 text-center text-[#77736c]">{error}</main>;

  if (room.status === "CLOSED") {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[#f8f8f6] px-6">
        <section className="w-full max-w-md rounded-[30px] border border-[#e7e5df] bg-white p-8 text-center shadow-[0_22px_55px_rgba(63,55,44,0.10)]">
          <p className="text-xs font-semibold tracking-[0.18em] text-[#80796f]">ALVESR · REUNIÃO</p>
          <h1 className="mt-4 text-2xl font-semibold text-[#20212a]">Sala encerrada</h1>
          <p className="mt-2 text-[#77736c]">{room.title}</p>
        </section>
      </main>
    );
  }

  if (isHostRequested && !participant) {
    return (
      <main className="flex min-h-screen flex-1 items-center justify-center bg-[#f8f8f6] px-6">
        <section className="w-full max-w-md rounded-[30px] border border-red-200 bg-white p-8 text-center shadow-[0_22px_55px_rgba(63,55,44,0.10)]">
          <h1 className="text-2xl font-semibold text-[#20212a]">Acesso ao apresentador negado</h1>
          <p className="mt-3 text-[#77736c]">{error}</p>
        </section>
      </main>
    );
  }

  if (participant) {
    const isHost = participant.role === "HOST";
    const presenceText = {
      connecting: "Conectando à sala...",
      connected: "Você está conectado à sala.",
      error: "A sala foi aberta, mas a atualização em tempo real está indisponível.",
      idle: "",
    }[status];

    if (room.status === "ACTIVE") {
      const roomParticipants = [participant, ...participants.filter((currentParticipant) => currentParticipant.participantId !== participant.participantId)]
        .sort((firstParticipant, secondParticipant) => {
          if (firstParticipant.role === secondParticipant.role) return 0;
          return firstParticipant.role === "HOST" ? -1 : 1;
        });
      const isPresentationActive = room.presentationActive !== false;
      const visibleThumbnails = roomParticipants.slice(0, 4);

      return (
        <main className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-hidden bg-[#121212] text-slate-100">
          <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-sm font-medium text-slate-200">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              <span className="h-5 w-px bg-slate-600" />
              <p className="truncate text-sm font-medium text-white">{room.slug}</p>
              <button aria-label="Copiar link da sala" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-white/10 hover:text-white" onClick={() => void handleCopyGuestLink()} title="Copiar link da sala" type="button">
                {isLinkCopied ? <CheckIcon /> : <CopyIcon />}
              </button>
              <span className="hidden items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 sm:inline-flex">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span>
                Ao vivo
              </span>
            </div>
            <div className="flex items-center gap-2">
              {room.projectUrl ? <a className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-[#242424]" href={room.projectUrl} rel="noreferrer" target="_blank"><ExternalLinkIcon />Abrir em outra aba</a> : null}
              <button aria-label="Ver participantes" className="flex h-9 items-center gap-1.5 rounded-full bg-[#2a2a2a] px-3 text-xs font-medium text-white transition hover:bg-[#3a3a3a]" onClick={() => setIsParticipantListOpen(true)} type="button"><UsersIcon />{roomParticipants.length}</button>
            </div>
          </header>

          <div className="flex min-h-0 flex-1 gap-2 overflow-hidden px-3 py-3 sm:px-6 sm:py-4">
            {isPresentationActive ? (
              <section className="relative h-full min-w-0 flex-1 overflow-hidden rounded-2xl bg-black shadow-2xl shadow-black/40">
                {room.projectUrl ? <ProjectFrame frameRef={projectFrameRef} title={`Projeto: ${room.title}`} url={room.projectUrl} /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500"><ProjectPlaceholderIcon /><p>Nenhum endereço de projeto foi configurado para esta sala.</p></div>}
                {room.projectUrl && room.scrollLocked && !isHost ? <div className="group absolute inset-0 z-10 grid cursor-not-allowed place-items-center bg-transparent"><span className="rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white/80 opacity-0 transition-opacity duration-150 group-hover:opacity-100">Navegação bloqueada pelo apresentador</span></div> : null}
                {Object.entries(cursors).map(([participantId, cursor]) => <RemoteCursor cursor={cursor} displayName={roomParticipants.find((currentParticipant) => currentParticipant.participantId === participantId)?.displayName ?? "Participante"} key={participantId} />)}
                <div className="absolute bottom-4 left-4 rounded-lg bg-black/65 px-3 py-1.5 text-xs font-medium text-white" title={`Apresentando: ${room.title}`}>{room.title}</div>
              </section>
            ) : <CameraStage isCameraOn={isCameraOn} localVideoRef={localVideoRef} participant={participant} participants={roomParticipants} remoteStreams={remoteStreams} />}

            {isPresentationActive ? (
              <div className="hidden shrink-0 gap-2 sm:flex">
                <button aria-label={isParticipantRailOpen ? "Ocultar participantes" : "Mostrar participantes"} className="grid h-full w-6 shrink-0 place-items-center rounded-xl bg-[#1c1c1c] text-slate-400 transition hover:bg-[#242424] hover:text-white" onClick={() => setIsParticipantRailOpen((current) => !current)} type="button">
                  <ChevronIcon direction={isParticipantRailOpen ? "right" : "left"} />
                </button>
                <div className={`h-full overflow-hidden transition-[width] duration-200 ${isParticipantRailOpen ? "w-36" : "w-0"}`}>
                  <div className="flex h-full w-36 flex-col gap-2 overflow-y-auto">
                    {visibleThumbnails.map((currentParticipant) => <ParticipantTile currentParticipant={currentParticipant} isLocal={currentParticipant.participantId === participant.participantId} isCameraOn={isCameraOn} key={currentParticipant.participantId} localVideoRef={localVideoRef} remoteStream={remoteStreams[currentParticipant.participantId]} size="compact" />)}
                    {roomParticipants.length < 2 ? <div className="grid h-24 w-full shrink-0 place-items-center rounded-xl border border-dashed border-white/20 px-2 text-center text-[10px] leading-4 text-slate-400">Aguardando cliente</div> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {!isControlsCollapsed ? (
            <footer className="flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-[#2c2c2c] bg-[#1c1c1c] px-4 py-3 sm:gap-4">
              <ControlButton active={!isMicMuted} ariaLabel={isMicMuted ? "Ativar microfone" : "Mutar microfone"} icon={<MicIcon muted={isMicMuted} />} onClick={() => void handleMicrophoneToggle()} visibleLabel="Microfone" />
              <ControlButton active={isCameraOn} ariaLabel={isCameraOn ? "Desligar câmera" : "Ligar câmera"} icon={<CameraIcon off={!isCameraOn} />} onClick={() => void handleCameraToggle()} visibleLabel="Câmera" />
              {isHost ? <ControlButton active={!room.scrollLocked} ariaLabel={room.scrollLocked ? "Liberar navegação" : "Bloquear navegação"} icon={<LockIcon locked={room.scrollLocked} />} onClick={() => void handleScrollLockToggle()} visibleLabel="Navegação" /> : null}
              <div className="hidden items-center gap-2 rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 sm:flex"><span className={`h-1.5 w-1.5 rounded-full ${isHost ? "bg-[#ffd84f]" : "bg-emerald-400"}`} />{isHost ? "Você está apresentando" : "Você está assistindo"}</div>
              {isHost ? <button className="rounded-2xl bg-red-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={isClosing} onClick={() => setIsCloseConfirmationOpen(true)} type="button">{isClosing ? "Encerrando..." : "Encerrar"}</button> : null}
              {isHost ? <button className="rounded-2xl border border-slate-600 px-3 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10" onClick={() => void handlePresentationToggle()} type="button">{isPresentationActive ? "Parar transmissão" : "Retomar transmissão"}</button> : null}
              <button aria-label="Ocultar controles" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white" onClick={() => setIsControlsCollapsed(true)} type="button"><ChevronIcon direction="down" /></button>
            </footer>
          ) : (
            <div className="flex shrink-0 justify-center border-t border-[#2c2c2c] bg-[#1c1c1c] py-1.5">
              <button aria-label="Mostrar controles" className="grid h-7 w-12 place-items-center rounded-full text-slate-400 transition hover:bg-white/10 hover:text-white" onClick={() => setIsControlsCollapsed(false)} type="button"><ChevronIcon direction="up" /></button>
            </div>
          )}
          {isParticipantListOpen ? <ParticipantListModal onClose={() => setIsParticipantListOpen(false)} participants={roomParticipants} /> : null}
          {isCloseConfirmationOpen ? <ConfirmationModal
            confirmLabel="Encerrar sala"
            description="O cliente não poderá mais acompanhar esta apresentação e o link deixará de funcionar."
            isConfirming={isClosing}
            onClose={() => setIsCloseConfirmationOpen(false)}
            onConfirm={() => void handleCloseRoom()}
            title="Encerrar esta sala?"
          /> : null}
        </main>
      );
    }

    return (
      <main className="mx-auto flex min-h-screen w-full max-w-none flex-1 items-center bg-[#f8f8f6] px-6 py-10">
        <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-[30px] border border-[#e7e5df] bg-white shadow-[0_22px_55px_rgba(63,55,44,0.10)]">
          <header className="flex flex-col gap-4 border-b border-[#eeece7] bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#80796f]">ALVESR · REUNIÃO</p>
              <h1 className="mt-2 text-xl font-semibold text-[#20212a]">{room.title}</h1>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#eef5ef] px-3 py-1.5 text-sm font-medium text-[#26783a]">
              <span className="h-2 w-2 rounded-full bg-[#49a45c]" />
              Sala pronta
            </span>
          </header>

          <div className="grid gap-8 p-6 lg:grid-cols-[1.4fr_0.8fr] lg:p-8">
            <div>
              <p className="text-sm font-semibold tracking-wide text-[#6f6b64]">
                {isHost ? "MODO APRESENTADOR" : "VOCÊ ESTÁ NA SALA"}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[#20212a]">
                {isHost ? "Tudo pronto para apresentar." : `Bem-vindo, ${participant.displayName}.`}
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[#77736c]">
                {isHost
                  ? "Compartilhe o link com seu cliente. Quando ele entrar, a presença aparecerá aqui em tempo real."
                  : "O apresentador foi avisado da sua entrada. Aguarde o início da apresentação."}
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                {isHost ? (
                  <button
                    className="rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#393a43] disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => void handleStartPresentation()}
                    type="button"
                    disabled={isStarting}
                  >
                    {isStarting ? "Iniciando..." : "Iniciar apresentação"}
                  </button>
                ) : null}
                {room.projectUrl ? (
                  <a
                    className="rounded-xl border border-[#dedbd4] bg-white px-4 py-2.5 text-sm font-semibold text-[#424149] transition hover:bg-[#f5f4f1]"
                    href={room.projectUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir projeto
                  </a>
                ) : null}
                {isHost ? (
                  <button
                    className="rounded-xl border border-[#dedbd4] bg-white px-4 py-2.5 text-sm font-semibold text-[#424149] transition hover:bg-[#f5f4f1]"
                    onClick={() => void handleCopyGuestLink()}
                    type="button"
                  >
                    {isLinkCopied ? "Link copiado" : "Copiar link do cliente"}
                  </button>
                ) : null}
              </div>

              <p className="mt-6 text-sm text-[#6f6b64]">{presenceText}</p>
            </div>

            <aside className="rounded-[22px] border border-[#e9e6df] bg-[#f7f7f5] p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#24252c]">Participantes</p>
                  <p className="mt-1 text-xs text-slate-500">Entradas nesta sessão</p>
                </div>
                <span className="rounded-full bg-[#e7e4dc] px-2.5 py-1 text-xs font-medium text-[#5f5b54]">
                  {participants.length}
                </span>
              </div>

              {participants.length > 0 ? (
                <ul className="mt-5 space-y-3">
                  {participants.map((currentParticipant) => (
                    <li className="flex items-center justify-between gap-3" key={currentParticipant.participantId}>
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#20212a] text-sm font-semibold text-white">
                          {currentParticipant.displayName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="truncate text-sm font-medium text-[#33343b]">{currentParticipant.displayName}</span>
                      </div>
                      <span className="shrink-0 text-xs text-[#89857e]">
                        {currentParticipant.role === "GUEST" ? "Cliente" : "Apresentador"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 rounded-xl border border-dashed border-[#d8d5ce] px-4 py-5 text-center text-sm leading-6 text-[#89857e]">
                  {isHost ? "Aguardando a entrada do primeiro cliente." : "Conectando a presença da sala."}
                </p>
              )}
            </aside>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[#f8f8f6] px-6 py-12">
      <section className="w-full max-w-md rounded-[30px] border border-[#e7e5df] bg-white p-8 shadow-[0_22px_55px_rgba(63,55,44,0.10)]">
        <p className="text-xs font-semibold tracking-[0.18em] text-[#80796f]">VOCÊ FOI CONVIDADO</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#20212a]">{room.title}</h1>
        <p className="mt-2 text-sm leading-6 text-[#77736c]">Informe seu nome para entrar na sala.</p>
        {room.projectUrl ? (
          <a className="mt-4 inline-flex text-sm font-medium text-[#40507b] transition hover:text-[#2d3a5c]" href={room.projectUrl} rel="noreferrer" target="_blank">
            Abrir o projeto apresentado →
          </a>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={handleJoin}>
          <label className="block text-sm font-semibold text-[#4c4a46]">
            Seu nome
            <input
              className="mt-2 w-full rounded-xl border border-[#e4e3df] bg-[#fafaf9] px-3 py-2.5 text-[#20212a] outline-none transition placeholder:text-[#aaa69f] focus:border-[#202126] focus:bg-white focus:ring-4 focus:ring-[#202126]/5"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="name"
              required
              autoFocus
            />
          </label>

          {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

          <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 font-semibold text-white transition hover:bg-[#353640] disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isJoining}>
            {isJoining ? "Entrando..." : "Entrar na sala"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ParticipantListModal({ participants, onClose }: { participants: Participant[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-70 grid place-items-center bg-black/55 p-5 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Participantes da reunião">
      <section className="modal-scrollbar w-full max-w-sm overflow-y-auto rounded-[26px] border border-[#3b3b3b] bg-[#202020] p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Participantes</h2><p className="mt-1 text-xs text-slate-400">{participants.length} na reunião</p></div><button aria-label="Fechar lista de participantes" className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg text-slate-200 transition hover:bg-white/20" onClick={onClose} type="button">×</button></div>
        <ul className="mt-5 space-y-2">
          {participants.map((currentParticipant) => <li className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3" key={currentParticipant.participantId}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ffd84f]/15 text-sm font-semibold text-[#ffd84f]">{currentParticipant.displayName.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{currentParticipant.displayName}</span><span className="text-xs text-slate-400">{currentParticipant.role === "HOST" ? "Apresentador" : "Cliente"}</span></li>)}
        </ul>
      </section>
    </div>
  );
}

// Renders the presented site at a fixed "desktop" width (well above any common mobile
// breakpoint) and scales it down to fit whatever box is actually available, so the site always
// shows its real desktop layout — like sharing a real browser window in a Meet call — instead
// of the iframe's cramped true width tricking the site into its own mobile nav. The internal
// height tracks the container's actual aspect ratio (not a fixed 16:9) so it fills the stage
// exactly, however tall or wide that ends up being, without letterboxing.
const PROJECT_FRAME_BASE_WIDTH = 1440;

function ProjectFrame({ url, title, frameRef }: { url: string; title: string; frameRef: RefObject<HTMLIFrameElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState({ scale: 1, height: PROJECT_FRAME_BASE_WIDTH * (9 / 16) });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function updateFrame() {
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      setFrame({ scale: width / PROJECT_FRAME_BASE_WIDTH, height: (height / width) * PROJECT_FRAME_BASE_WIDTH });
    }

    updateFrame();
    const observer = new ResizeObserver(updateFrame);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden" ref={containerRef}>
      <iframe
        className="origin-top-left border-0 bg-white"
        ref={frameRef}
        src={url}
        style={{ height: frame.height, transform: `scale(${frame.scale})`, width: PROJECT_FRAME_BASE_WIDTH }}
        title={title}
      />
    </div>
  );
}

function CameraStage({
  participant,
  participants,
  isCameraOn,
  localVideoRef,
  remoteStreams,
}: {
  participant: Participant;
  participants: Participant[];
  isCameraOn: boolean;
  localVideoRef: { current: HTMLVideoElement | null };
  remoteStreams: Record<string, MediaStream>;
}) {
  const visibleParticipants = participants.slice(0, 2);

  return (
    <section className="mx-auto grid h-full w-full max-w-350 place-content-center gap-4 sm:grid-cols-2">
      {visibleParticipants.map((currentParticipant) => <ParticipantTile currentParticipant={currentParticipant} isCameraOn={isCameraOn} isLocal={currentParticipant.participantId === participant.participantId} key={currentParticipant.participantId} localVideoRef={localVideoRef} remoteStream={remoteStreams[currentParticipant.participantId]} size="large" />)}
      {visibleParticipants.length < 2 ? <div className="grid place-items-center rounded-[28px] border border-dashed border-[#3a3a3a] bg-[#181818] px-6 text-center text-sm text-slate-500">Aguardando o outro participante ligar a câmera.</div> : null}
    </section>
  );
}

function ParticipantTile({
  currentParticipant,
  isLocal,
  isCameraOn,
  size = "default",
  localVideoRef,
  remoteStream,
}: {
  currentParticipant: Participant;
  isLocal: boolean;
  isCameraOn: boolean;
  size?: "default" | "large" | "compact";
  localVideoRef: { current: HTMLVideoElement | null };
  remoteStream?: MediaStream;
}) {
  const shapeClass = size === "large" ? "w-full aspect-video min-h-0 rounded-[28px]" : size === "compact" ? "h-24 w-full shrink-0 rounded-xl" : "w-full min-h-40 rounded-2xl";
  const avatarClass = size === "compact" ? "h-8 w-8 text-sm" : "h-12 w-12 text-lg";
  const labelClass = size === "compact" ? "inset-x-1.5 bottom-1.5 px-1.5 py-0.5 text-[10px]" : "inset-x-2 bottom-2 px-2 py-1 text-[11px]";

  return (
    <article className={`relative grid place-items-center overflow-hidden border border-slate-800 bg-[#151b28] ${shapeClass}`}>
      {isLocal && isCameraOn ? (
        <video autoPlay className="h-full w-full object-cover" muted playsInline ref={localVideoRef} />
      ) : remoteStream ? (
        <RemoteVideo stream={remoteStream} />
      ) : (
        <span className={`grid place-items-center rounded-full bg-[#ffd84f]/15 font-semibold text-[#ffd84f] ${avatarClass}`}>
          {currentParticipant.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={`absolute truncate rounded-md bg-black/60 text-white ${labelClass}`}>
        {isLocal ? `${currentParticipant.displayName} (você)` : currentParticipant.displayName}
      </span>
    </article>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return <video autoPlay className="h-full w-full object-cover" playsInline ref={videoRef} />;
}

function RemoteCursor({
  cursor,
  displayName,
}: {
  cursor: { x: number; y: number; clickedAt?: number };
  displayName: string;
}) {
  // Keyed by clickedAt so the CSS animation restarts on every click, with no JS timer needed
  // to hide it again afterwards (the animation simply plays once and settles on opacity: 0).
  return <div className="pointer-events-none absolute z-20 -translate-x-1 -translate-y-1" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}><span className="text-xl text-[#6c5ce7]">↖</span><span className="absolute left-3 top-4 whitespace-nowrap rounded bg-[#6c5ce7] px-1.5 py-0.5 text-[10px] font-medium text-white">{displayName}</span>{cursor.clickedAt ? <span className="animate-ping-once absolute -left-1 -top-1 h-5 w-5 rounded-full border-2 border-[#6c5ce7] opacity-0" key={cursor.clickedAt} /> : null}</div>;
}

function ControlButton({
  active,
  ariaLabel,
  visibleLabel,
  onClick,
  icon,
}: {
  active: boolean;
  ariaLabel: string;
  visibleLabel: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button
      aria-label={ariaLabel}
      className="flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl bg-[#26262b] px-3 text-xs font-medium text-white/85 transition hover:bg-[#323238] sm:min-w-23"
      onClick={onClick}
      type="button"
    >
      <span className={active ? "text-white" : "text-red-400"}>{icon}</span>
      <span className="hidden sm:inline">{visibleLabel}</span>
    </button>
  );
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      {muted ? <line x1="2" x2="22" y1="2" y2="22" /> : null}
      <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" x2="12" y1="19" y2="23" />
      <line x1="8" x2="16" y1="23" y2="23" />
    </svg>
  );
}

function CameraIcon({ off }: { off: boolean }) {
  return (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      {off ? <line x1="2" x2="22" y1="2" y2="22" /> : null}
      <rect height="14" rx="2.5" width="15" x="1" y="5" />
      <path d="M23 7 16 12l7 5V7Z" />
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <rect height="10" rx="2" width="16" x="4" y="11" />
      {locked ? <path d="M7 11V7a5 5 0 0 1 10 0v4" /> : <path d="M7 11V7a5 5 0 0 1 9.5-2" />}
    </svg>
  );
}

const chevronPoints = { down: "6 9 12 15 18 9", up: "18 15 12 9 6 15", left: "15 18 9 12 15 6", right: "9 18 15 12 9 6" };

function ChevronIcon({ direction }: { direction: "up" | "down" | "left" | "right" }) {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <polyline points={chevronPoints[direction]} />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <rect height="13" rx="2" ry="2" width="13" x="9" y="9" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function UsersIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="14">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" x2="21" y1="14" y2="3" />
    </svg>
  );
}

function ProjectPlaceholderIcon() {
  return (
    <svg fill="none" height="28" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="28">
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
