"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, authenticatedRequest } from "@/lib/api.client";
import { ConfirmationModal } from "@/features/rooms/components/confirmation-modal";
import { dateKey, validCalendarDate, type CalendarNote as Note } from "./calendar-utils";

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const field = "w-full rounded-xl border border-[#deddd8] bg-white px-3 py-2.5 text-sm text-[#202126] outline-none focus:border-[#202126] focus:ring-2 focus:ring-[#202126]/15 disabled:bg-[#f8f8f6]";
const button = "rounded-xl border border-[#deddd8] px-3 py-2 text-sm font-medium hover:bg-[#f3f1ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202126] disabled:cursor-wait disabled:opacity-50";
function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function CalendarPage({ initialDate }: { initialDate?: string }) {
  const [selected, setSelected] = useState(() => validCalendarDate(initialDate) ?? dateKey(new Date()));
  const [month, setMonth] = useState(() => { const date = new Date(`${selected}T12:00:00`); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Note | null>(null);
  const [content, setContent] = useState("");
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [revision, setRevision] = useState(0);
  const from = dateKey(month);
  const to = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const items = await authenticatedRequest<Note[]>(`/api/calendar?from=${from}&to=${to}`);
        if (!cancelled) setNotes(items);
      } catch (cause) {
        if (!cancelled) setError(errorMessage(cause, "Não foi possível conectar ao calendário. Confira sua conexão e tente novamente."));
      } finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [from, to, revision]);

  const byDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const note of notes) map.set(note.date, [...(map.get(note.date) ?? []), note]);
    return map;
  }, [notes]);
  const selectedNotes = byDate.get(selected) ?? [];
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Math.ceil((month.getDay() + dayCount) / 7) * 7;
  const today = dateKey(new Date());

  function reset() { setEditing(null); setContent(""); }
  function selectDay(key: string) { setSelected(key); reset(); setNotice(""); }
  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next); selectDay(dateKey(next)); setNotes([]);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!content.trim()) return;
    setSaving(true); setError(null); setNotice("");
    try {
      const note = await authenticatedRequest<Note>(editing ? `/api/calendar/${editing.id}` : "/api/calendar", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify({ date: selected, content: content.trim() }),
      });
      setNotes(current => [...current.filter(item => item.id !== note.id), note]);
      reset(); setNotice("Anotação salva.");
    } catch (cause) { setError(errorMessage(cause, "Não foi possível salvar. Confira sua conexão e tente novamente.")); }
    finally { setSaving(false); }
  }
  async function remove() {
    if (!deleting) return;
    setSaving(true); setError(null);
    try {
      await authenticatedRequest(`/api/calendar/${deleting.id}`, { method: "DELETE" });
      setNotes(current => current.filter(item => item.id !== deleting.id));
      if (editing?.id === deleting.id) reset();
      setDeleting(null); setNotice("Anotação excluída.");
    } catch (cause) { setError(errorMessage(cause, "Não foi possível excluir. Confira sua conexão e tente novamente.")); }
    finally { setSaving(false); }
  }

  return <section className="mt-6 text-[#202126]">
    <p className="mb-5 text-sm text-[#66635d]">Escolha um dia para anotar compromissos, ideias e tarefas. Suas anotações ficam salvas no sistema.</p>
    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button className={button} onClick={() => setRevision(value => value + 1)} type="button">Tentar novamente</button></div>}
    <p role="status" className="sr-only">{loading ? "Carregando calendário" : notice}</p>
    {notice && <p className="mb-4 rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-hidden rounded-3xl border border-[#efede8] bg-white" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <h2 className="text-lg font-semibold capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h2>
          <div className="flex gap-2">
            <button aria-label="Mês anterior" className={button} disabled={saving} onClick={() => moveMonth(-1)} type="button"><Chevron previous /></button>
            <button className={button} disabled={saving} onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); selectDay(dateKey(now)); }} type="button">Hoje</button>
            <button aria-label="Próximo mês" className={button} disabled={saving} onClick={() => moveMonth(1)} type="button"><Chevron /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-y border-[#efede8] bg-[#f8f8f6]">{weekdays.map(day => <div className="py-3 text-center text-xs font-semibold text-[#66635d]" key={day}>{day}</div>)}</div>
        <div className="grid grid-cols-7">
          {Array.from({ length: cells }, (_, index) => {
            const day = index - month.getDay() + 1;
            if (day < 1 || day > dayCount) return <div aria-hidden="true" className="min-h-20 border-b border-r border-[#efede8] bg-[#fafaf9] sm:min-h-28" key={index} />;
            const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
            const items = byDate.get(key) ?? [];
            return <button key={key} type="button" disabled={saving} aria-pressed={selected === key} aria-current={key === today ? "date" : undefined}
              aria-label={`${day} de ${month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}, ${items.length} anotações`}
              onClick={() => selectDay(key)} className={`flex min-h-20 min-w-0 flex-col items-start border-b border-r border-[#efede8] p-2 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-[#202126] sm:min-h-28 sm:p-3 ${selected === key ? "bg-[#eeece5]" : "hover:bg-[#f8f8f6]"}`}>
              <span className={`mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${key === today ? "bg-[#202126] font-semibold text-white" : "font-medium"}`}>{day}</span>
              {items.length > 0 && <><span className="block h-1.5 w-1.5 rounded-full bg-[#68624d] sm:hidden" /><span className="hidden max-w-full truncate text-xs text-[#55514a] sm:block">{items[0].content}</span>{items.length > 1 && <span className="mt-1 hidden text-xs text-[#66635d] sm:block">+{items.length - 1} {items.length === 2 ? "anotação" : "anotações"}</span>}</>}
            </button>;
          })}
        </div>
      </div>
      <aside className="min-w-0">
        <h2 className="text-lg font-semibold first-letter:uppercase">{new Date(`${selected}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h2>
        <p className="mt-1 text-sm text-[#66635d]">{loading ? "Carregando anotações…" : selectedNotes.length ? `${selectedNotes.length} ${selectedNotes.length === 1 ? "anotação neste dia" : "anotações neste dia"}` : "Nenhuma anotação neste dia. Escreva a primeira abaixo."}</p>
        <div className="mt-4 divide-y divide-[#efede8]">
          {!loading && selectedNotes.map(note => <article className="py-4 first:pt-0" key={note.id}>
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{note.content}</p>
            <div className="mt-3 flex gap-2"><button className={button} disabled={saving} onClick={() => { setEditing(note); setContent(note.content); setNotice(""); }} type="button">Editar</button><button className={`${button} text-red-700`} disabled={saving} onClick={() => setDeleting(note)} type="button">Excluir</button></div>
          </article>)}
        </div>
        <form className="mt-5 border-t border-[#efede8] pt-5" onSubmit={save}>
          <label className="mb-2 block text-sm font-semibold" htmlFor="calendar-content">{editing ? "Editar anotação" : "Nova anotação"}</label>
          <textarea id="calendar-content" className={`${field} min-h-32 resize-y`} maxLength={5000} placeholder="O que você quer anotar para este dia?" required disabled={saving || loading} value={content} onChange={event => setContent(event.target.value)} />
          <div className="mt-5 flex flex-wrap gap-2"><button type="submit" disabled={saving || loading || !content.trim()} className="rounded-xl bg-[#202126] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#3d3e44] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202126] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Salvando…" : editing ? "Salvar alterações" : "Salvar anotação"}</button>{editing && <button type="button" className={button} disabled={saving} onClick={reset}>Cancelar edição</button>}</div>
        </form>
      </aside>
    </div>
    {deleting && <ConfirmationModal title="Excluir anotação?" description="A anotação será excluída do sistema." confirmLabel="Excluir anotação" isConfirming={saving} onClose={() => { if (!saving) setDeleting(null); }} onConfirm={() => void remove()} />}
  </section>;
}

function Chevron({ previous = false }: { previous?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={previous ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
