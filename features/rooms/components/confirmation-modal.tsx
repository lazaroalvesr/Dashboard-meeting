"use client";

type ConfirmationModalProps = {
  title: string;
  description: string;
  confirmLabel?: string;
  isConfirming?: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmationModal({
  title,
  description,
  confirmLabel = "Confirmar",
  isConfirming = false,
  onClose,
  onConfirm,
}: ConfirmationModalProps) {
  return (
    <div
      className="fixed inset-0 z-80 grid place-items-center bg-[#15161b]/50 p-5 backdrop-blur-sm"
      onClick={isConfirming ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-title"
    >
      <section
        className="confirmation-modal w-full max-w-md rounded-[28px] border border-white/70 bg-white p-6 shadow-[0_24px_90px_rgba(25,25,31,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fff0f0] text-lg text-[#dd3737]">!</div>
        <h2 id="confirmation-title" className="mt-5 text-xl font-bold tracking-tight text-[#20212a]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#74716c]">{description}</p>
        <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            className="rounded-xl border border-[#e5e2dc] bg-white px-4 py-2.5 text-sm font-semibold text-[#525058] transition hover:bg-[#f6f5f2] disabled:opacity-50"
            disabled={isConfirming}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className="rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a3b44] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isConfirming}
            onClick={onConfirm}
            type="button"
          >
            {isConfirming ? "Confirmando..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
