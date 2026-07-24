"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { login } from "@/features/auth/auth.client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      router.replace("/dashboard");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f6f4] px-5 py-5 text-[#202126] sm:p-8">
      <div className="mx-auto grid min-h-[calc(100vh-40px)] max-w-6xl overflow-hidden rounded-[32px] bg-white shadow-[0_25px_70px_rgba(30,31,35,0.10)] lg:grid-cols-[1.05fr_.95fr]">
        <section className="flex flex-col justify-between bg-[#202126] p-8 text-white sm:p-12">
          <div>
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#ffd84f] text-sm font-extrabold text-[#202126]">AR</span><span className="text-base font-bold tracking-tight">AlvesR Studio</span></div>
            <div className="mt-16 max-w-md sm:mt-24"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">Seu espaço de trabalho</p><h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-[-0.055em] sm:text-5xl">Projetos, clientes e apresentações em um só lugar.</h1><p className="mt-6 max-w-sm text-sm leading-6 text-white/60">Organize sua carteira, acompanhe pagamentos e abra salas para apresentar seus projetos com mais clareza.</p></div>
          </div>
          <div className="mt-14 flex items-center gap-3 text-xs text-white/50"><span className="h-2 w-2 rounded-full bg-[#5ae04f]" />Painel privado e seguro</div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-sm">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#f1f1f0] text-lg text-[#202126]">↗</span>
            <p className="mt-8 text-sm font-medium text-[#807c75]">Bem-vindo de volta</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em] text-[#202126]">Entrar no painel</h2>
            <p className="mt-3 text-sm leading-6 text-[#858179]">Use suas credenciais de administrador para continuar.</p>

            <form className="mt-9 space-y-5" onSubmit={handleSubmit}>
              <label className="block text-sm font-semibold text-[#4c4a46]">E-mail<input autoComplete="email" className="mt-2 w-full rounded-2xl border border-[#e4e3df] bg-[#fafaf9] px-4 py-3 text-[#202126] outline-none transition placeholder:text-[#aaa69f] focus:border-[#202126] focus:bg-white focus:ring-4 focus:ring-[#202126]/5" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
              <label className="block text-sm font-semibold text-[#4c4a46]">Senha<input autoComplete="current-password" className="mt-2 w-full rounded-2xl border border-[#e4e3df] bg-[#fafaf9] px-4 py-3 text-[#202126] outline-none transition placeholder:text-[#aaa69f] focus:border-[#202126] focus:bg-white focus:ring-4 focus:ring-[#202126]/5" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
              {error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
              <button className="w-full rounded-2xl bg-[#202126] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#383940] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">{isSubmitting ? "Entrando..." : "Entrar no painel"}</button>
            </form>
            <p className="mt-8 text-center text-xs leading-5 text-[#a19d95]">Acesso exclusivo do administrador AlvesR Studio.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
