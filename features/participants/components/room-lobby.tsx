"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

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
      try {
        const publicRoom = await publicRequest<PublicRoom>(`/api/rooms/${slug}`);
        setRoom(publicRoom);

        if (isHostRequested) {
          const hostParticipant = await authenticatedRequest<Participant>(
            `/api/rooms/${slug}/participants/host`,
            { method: "POST" },
          );

          setParticipant(hostParticipant);
          return;
        }

        const savedParticipant = sessionStorage.getItem(
          `meeting-platform.guest-participant.${slug}`,
        );

        if (savedParticipant) {
          setParticipant(JSON.parse(savedParticipant) as Participant);
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

  if (isLoading) return <main className="p-8 text-slate-400">Abrindo sala...</main>;
  if (!room) return <main className="p-8 text-slate-400">{error}</main>;

  if (room.status === "CLOSED") {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/85 p-8 text-center shadow-2xl shadow-black/30">
          <p className="text-sm font-semibold text-slate-500">MEETING PLATFORM</p>
          <h1 className="mt-4 text-2xl font-semibold text-white">Sala encerrada</h1>
          <p className="mt-2 text-slate-400">{room.title}</p>
        </section>
      </main>
    );
  }

  if (isHostRequested && !participant) {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <section className="w-full max-w-md rounded-3xl border border-red-500/20 bg-slate-950/85 p-8 text-center shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-white">Acesso ao apresentador negado</h1>
          <p className="mt-3 text-slate-400">{error}</p>
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

      return (
        <main className="fixed inset-0 z-50 flex min-h-screen flex-col overflow-hidden bg-[#121212] text-slate-100">
          <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
            <div className="flex min-w-0 items-center gap-3"><span className="text-sm font-medium text-slate-200">{new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span><span className="h-5 w-px bg-slate-600" /><p className="truncate text-sm font-medium text-white">{room.slug}</p><span className="hidden rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-200 sm:inline-flex">Ao vivo</span></div>
            <div className="flex items-center gap-2">{room.projectUrl ? <a className="rounded-xl border border-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#242424]" href={room.projectUrl} rel="noreferrer" target="_blank">Abrir em outra aba</a> : null}<button aria-label="Ver participantes" className="grid h-9 min-w-9 place-items-center rounded-full bg-[#2a2a2a] px-2 text-xs text-white transition hover:bg-[#3a3a3a]" onClick={() => setIsParticipantListOpen(true)} type="button">{roomParticipants.length}</button></div>
          </header>

          <div className="grid min-h-0 flex-1 grid-cols-1 content-center gap-5 overflow-hidden px-4 pb-24 sm:px-8 lg:grid-cols-[160px_minmax(0,1000px)_160px] lg:justify-center lg:px-6">
            <aside className={`h-full w-full flex-col justify-center gap-5 ${isPresentationActive ? "hidden lg:flex" : "hidden"}`}>
              {roomParticipants.slice(0, 3).map((currentParticipant) => <ParticipantTile currentParticipant={currentParticipant} isLocal={currentParticipant.participantId === participant.participantId} isCameraOn={isCameraOn} localVideoRef={localVideoRef} remoteStream={remoteStreams[currentParticipant.participantId]} key={currentParticipant.participantId} />)}
            </aside>

            {isPresentationActive ? <section className="relative aspect-video w-full max-w-[1050px] self-center overflow-hidden bg-black shadow-2xl shadow-black/40 lg:translate-y-5">
              {room.projectUrl ? <div className="absolute inset-0 overflow-hidden"><iframe className="origin-top-left border-0 bg-white" ref={projectFrameRef} src={room.projectUrl} style={{ height: "122%", transform: "scale(0.82)", width: "122%" }} title={`Projeto: ${room.title}`} /></div> : <div className="grid h-full place-items-center px-6 text-center text-slate-400">Nenhum endereço de projeto foi configurado para esta sala.</div>}
              {room.projectUrl && room.scrollLocked && !isHost ? <div className="absolute inset-0 z-10 grid cursor-not-allowed place-items-center bg-transparent"><span className="rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white/80">Navegação bloqueada pelo apresentador</span></div> : null}
              {Object.entries(cursors).map(([participantId, cursor]) => <RemoteCursor cursor={cursor} displayName={roomParticipants.find((currentParticipant) => currentParticipant.participantId === participantId)?.displayName ?? "Participante"} key={participantId} />)}
              <div className="absolute bottom-4 left-4 rounded-lg bg-black/65 px-3 py-1.5 text-xs font-medium text-white">{room.title}</div>
            </section> : <CameraStage isCameraOn={isCameraOn} localVideoRef={localVideoRef} participant={participant} participants={roomParticipants} remoteStreams={remoteStreams} />}

            <aside className={`h-full w-full flex-col justify-center gap-5 ${isPresentationActive ? "hidden lg:flex" : "hidden"}`}>
              {roomParticipants.slice(3, 6).map((currentParticipant) => <ParticipantTile currentParticipant={currentParticipant} isLocal={currentParticipant.participantId === participant.participantId} isCameraOn={isCameraOn} localVideoRef={localVideoRef} remoteStream={remoteStreams[currentParticipant.participantId]} key={currentParticipant.participantId} />)}
              {roomParticipants.length < 4 ? <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-[#3a3a3a] px-3 text-center text-xs leading-5 text-slate-500">Aguardando cliente</div> : null}
            </aside>
          </div>

          <footer className={`absolute bottom-5 left-1/2 ${isControlsCollapsed ? "hidden" : "flex"} -translate-x-1/2 items-center justify-center gap-3 rounded-[24px] border border-[#363636] bg-[#282828] px-3 py-3 shadow-2xl shadow-black/40 sm:gap-4`}>
            <ControlButton active={!isMicMuted} label={isMicMuted ? "Ativar microfone" : "Mutar"} onClick={() => void handleMicrophoneToggle()} symbol={isMicMuted ? "⌁" : "●"} />
            <ControlButton active={isCameraOn} label={isCameraOn ? "Desligar câmera" : "Ligar câmera"} onClick={() => void handleCameraToggle()} symbol="▣" />
            {isHost ? <div className="relative"><button aria-label="Ocultar controles" className="absolute -top-7 left-1/2 grid h-6 w-8 -translate-x-1/2 place-items-center rounded-t-lg border border-[#3c3c3c] bg-[#282828] text-sm text-slate-200 transition hover:bg-[#3a3a3a] hover:text-white" onClick={() => setIsControlsCollapsed(true)} type="button">⌄</button><ControlButton active={!room.scrollLocked} label={room.scrollLocked ? "Liberar navegação" : "Bloquear navegação"} onClick={() => void handleScrollLockToggle()} symbol="↕" /></div> : null}
            <div className="hidden rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 sm:block">{isHost ? "Você está apresentando" : "Você está assistindo"}</div>
            {isHost ? <button className="rounded-2xl bg-red-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60" disabled={isClosing} onClick={() => setIsCloseConfirmationOpen(true)} type="button">{isClosing ? "Encerrando..." : "Encerrar"}</button> : null}
            {isHost ? <button className="rounded-2xl border border-slate-600 px-3 py-2.5 text-xs font-semibold text-slate-100 transition hover:bg-white/10" onClick={() => void handlePresentationToggle()} type="button">{isPresentationActive ? "Parar transmissão" : "Retomar transmissão"}</button> : null}
          </footer>
          {isControlsCollapsed ? <button className="absolute bottom-5 left-1/2 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full border border-[#3c3c3c] bg-[#282828] text-lg text-white shadow-xl shadow-black/40 transition hover:bg-[#3a3a3a]" aria-label="Mostrar controles" onClick={() => setIsControlsCollapsed(false)} type="button">⌃</button> : null}
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
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950/85 p-8 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold tracking-wide text-indigo-300">VOCÊ FOI CONVIDADO</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">{room.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Informe seu nome para entrar na sala.</p>
        {room.projectUrl ? (
          <a className="mt-4 inline-flex text-sm font-medium text-indigo-300 transition hover:text-indigo-200" href={room.projectUrl} rel="noreferrer" target="_blank">
            Abrir o projeto apresentado →
          </a>
        ) : null}

        <form className="mt-8 space-y-5" onSubmit={handleJoin}>
          <label className="block text-sm font-medium text-slate-300">
            Seu nome
            <input
              className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              autoComplete="name"
              required
              autoFocus
            />
          </label>

          {error ? <p className="rounded-xl bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</p> : null}

          <button className="w-full rounded-xl bg-indigo-500 px-4 py-2.5 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={isJoining}>
            {isJoining ? "Entrando..." : "Entrar na sala"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ParticipantListModal({ participants, onClose }: { participants: Participant[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-5 backdrop-blur-sm" onClick={onClose} role="dialog" aria-modal="true" aria-label="Participantes da reunião">
      <section className="modal-scrollbar w-full max-w-sm overflow-y-auto rounded-[26px] border border-[#3b3b3b] bg-[#202020] p-5 text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Participantes</h2><p className="mt-1 text-xs text-slate-400">{participants.length} na reunião</p></div><button aria-label="Fechar lista de participantes" className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg text-slate-200 transition hover:bg-white/20" onClick={onClose} type="button">×</button></div>
        <ul className="mt-5 space-y-2">
          {participants.map((currentParticipant) => <li className="flex items-center gap-3 rounded-2xl bg-white/5 px-3 py-3" key={currentParticipant.participantId}><span className="grid h-9 w-9 place-items-center rounded-full bg-[#30336b] text-sm font-semibold text-white">{currentParticipant.displayName.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{currentParticipant.displayName}</span><span className="text-xs text-slate-400">{currentParticipant.role === "HOST" ? "Apresentador" : "Cliente"}</span></li>)}
        </ul>
      </section>
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
    <section className="grid aspect-video w-full max-w-[1050px] self-center gap-4 sm:grid-cols-2 lg:col-span-3 lg:justify-self-center">
      {visibleParticipants.map((currentParticipant) => <ParticipantTile large currentParticipant={currentParticipant} isCameraOn={isCameraOn} isLocal={currentParticipant.participantId === participant.participantId} key={currentParticipant.participantId} localVideoRef={localVideoRef} remoteStream={remoteStreams[currentParticipant.participantId]} />)}
      {visibleParticipants.length < 2 ? <div className="grid place-items-center rounded-[28px] border border-dashed border-[#3a3a3a] bg-[#181818] px-6 text-center text-sm text-slate-500">Aguardando o outro participante ligar a câmera.</div> : null}
    </section>
  );
}

function ParticipantTile({
  currentParticipant,
  isLocal,
  isCameraOn,
  large = false,
  localVideoRef,
  remoteStream,
}: {
  currentParticipant: Participant;
  isLocal: boolean;
  isCameraOn: boolean;
  large?: boolean;
  localVideoRef: { current: HTMLVideoElement | null };
  remoteStream?: MediaStream;
}) {
  return (
    <article className={`relative grid w-full place-items-center overflow-hidden border border-slate-800 bg-[#151b28] ${large ? "aspect-video min-h-0 rounded-[28px]" : "min-h-40 rounded-2xl"}`}>
      {isLocal && isCameraOn ? (
        <video autoPlay className="h-full w-full object-cover" muted playsInline ref={localVideoRef} />
      ) : remoteStream ? (
        <RemoteVideo stream={remoteStream} />
      ) : (
        <span className="grid h-12 w-12 place-items-center rounded-full bg-indigo-500/20 text-lg font-semibold text-indigo-200">
          {currentParticipant.displayName.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-md bg-black/60 px-2 py-1 text-[11px] text-white">
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
  return <div className="pointer-events-none absolute z-20 -translate-x-1 -translate-y-1" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}><span className="text-xl text-indigo-600">↖</span><span className="absolute left-3 top-4 whitespace-nowrap rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-medium text-white">{displayName}</span>{cursor.clickedAt && Date.now() - cursor.clickedAt < 700 ? <span className="absolute -left-1 -top-1 h-5 w-5 animate-ping rounded-full border-2 border-indigo-500" /> : null}</div>;
}

function ControlButton({
  active,
  label,
  onClick,
  symbol,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  symbol: string;
}) {
  return (
    <button
      aria-label={label}
      className={`flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-medium transition sm:min-w-0 ${active ? "bg-[#252b3a] text-white hover:bg-[#30384b]" : "bg-red-500/15 text-red-200 hover:bg-red-500/25"}`}
      onClick={onClick}
      type="button"
    >
      <span className="text-base leading-none">{symbol}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
