"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { ApiError, authenticatedRequest } from "@/lib/api.client";

const fieldClass = "w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]";

function ModalShell({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#161719]/45 p-5" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-xl font-bold">{title}</p><p className="mt-1 text-sm text-[#88837b]">{description}</p></div>
          <button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={onClose} type="button">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Frontend-only for now: fetching/saving depend on GET/PATCH /api/account and
// POST /api/account/change-password existing on the Spring backend, which the app doesn't
// call anywhere else today. Errors surface inline instead of pretending the request worked.
export function EditProfileModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const account = await authenticatedRequest<{ name: string; email: string }>("/api/account");
        if (!cancelled) { setName(account.name); setEmail(account.email); }
      } catch (cause) {
        if (!cancelled) setLoadError(cause instanceof ApiError ? cause.message : "Não foi possível carregar seus dados atuais.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const wantsPasswordChange = newPassword.length > 0 || confirmPassword.length > 0 || currentPassword.length > 0;
    if (wantsPasswordChange) {
      if (!currentPassword) { setSaveError("Informe sua senha atual para trocá-la."); return; }
      if (newPassword.length < 8) { setSaveError("A nova senha precisa ter pelo menos 8 caracteres."); return; }
      if (newPassword !== confirmPassword) { setSaveError("A confirmação não bate com a nova senha."); return; }
    }

    setSaving(true);
    try {
      await authenticatedRequest("/api/account", { method: "PATCH", body: JSON.stringify({ name, email }) });
      if (wantsPasswordChange) {
        await authenticatedRequest("/api/account/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      }
      onClose();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : "Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell description="Atualize seu nome, e-mail e, se quiser, sua senha." onClose={onClose} title="Editar perfil">
      {loading ? <p className="mt-6 text-sm text-[#88837b]">Carregando seus dados...</p> : (
        <form className="mt-6 space-y-3" onSubmit={handleSubmit}>
          {loadError ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">{loadError}</p> : null}
          <label className="block text-xs font-semibold text-[#666770]">Nome<input className={`${fieldClass} mt-1.5`} onChange={(event) => setName(event.target.value)} required value={name} /></label>
          <label className="block text-xs font-semibold text-[#666770]">E-mail<input className={`${fieldClass} mt-1.5`} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>

          <div className="border-t border-[#f0eeea] pt-3">
            <p className="text-xs font-semibold text-[#666770]">Trocar senha</p>
            <p className="mt-0.5 text-[11px] text-[#a19d95]">Deixe em branco para manter a senha atual.</p>
            <div className="mt-2 space-y-2">
              <input autoComplete="current-password" className={fieldClass} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Senha atual" type="password" value={currentPassword} />
              <input autoComplete="new-password" className={fieldClass} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nova senha" type="password" value={newPassword} />
              <input autoComplete="new-password" className={fieldClass} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" type="password" value={confirmPassword} />
            </div>
          </div>

          {saveError ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{saveError}</p> : null}
          <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={saving} type="submit">{saving ? "Salvando..." : "Salvar alterações"}</button>
        </form>
      )}
    </ModalShell>
  );
}
