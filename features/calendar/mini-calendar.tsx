"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authenticatedRequest } from "@/lib/api.client";
import { dateKey, type CalendarNote } from "./calendar-utils";

export function MiniCalendar() {
  const [today] = useState(() => dateKey(new Date()));
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const from = dateKey(month);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const to = dateKey(new Date(month.getFullYear(), month.getMonth(), lastDay));
  const monthLabel = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const counts = new Map<string, number>();
  for (const note of notes) counts.set(note.date, (counts.get(note.date) ?? 0) + 1);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true); setError(false);
      try {
        const items = await authenticatedRequest<CalendarNote[]>(`/api/calendar?from=${from}&to=${to}`);
        if (!cancelled) setNotes(items);
      } catch { if (!cancelled) { setError(true); setNotes([]); } }
      finally { if (!cancelled) setLoading(false); }
    }
    void load();
    return () => { cancelled = true; };
  }, [from, to, revision]);

  function move(offset: number) {
    setNotes([]);
    setMonth(current => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }
  const control = "grid h-8 w-8 place-items-center rounded-lg text-[#66635d] hover:bg-[#f3f1ec] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202126]";

  return <section aria-label="Mini calendário" className="min-w-0 rounded-3xl border border-[#efede8] bg-white p-5">
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-base font-semibold tracking-tight">Calendário</h2>
      <Link href="/dashboard/calendar" className="text-xs font-semibold text-[#5f5c56] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2">Abrir agenda</Link>
    </div>
    <div className="mb-3 mt-4 flex items-center justify-between gap-2">
      <h3 className="text-sm font-medium first-letter:uppercase" aria-live="polite">{monthLabel}</h3>
      <div className="flex gap-1">
        <button type="button" aria-label="Mês anterior do mini calendário" className={control} onClick={() => move(-1)}><Arrow previous /></button>
        <button type="button" aria-label="Próximo mês do mini calendário" className={control} onClick={() => move(1)}><Arrow /></button>
      </div>
    </div>
    <div className="grid grid-cols-7 text-center">
      {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index} aria-hidden="true" className="pb-2 text-[11px] font-semibold text-[#66635d]">{day}</span>)}
      {Array.from({ length: Math.ceil((month.getDay() + lastDay) / 7) * 7 }, (_, index) => {
        const day = index - month.getDay() + 1;
        if (day < 1 || day > lastDay) return <span key={index} aria-hidden="true" />;
        const key = dateKey(new Date(month.getFullYear(), month.getMonth(), day));
        const count = counts.get(key) ?? 0;
        return <Link key={key} href={`/dashboard/calendar?date=${key}`} aria-current={key === today ? "date" : undefined}
          aria-label={`${day} de ${monthLabel}${key === today ? ", hoje" : ""}${loading || error ? "" : `, ${count} ${count === 1 ? "anotação" : "anotações"}`}`}
          className={`relative mx-auto grid h-9 w-full max-w-9 place-items-center rounded-xl text-xs tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#202126] ${key === today ? "bg-[#202126] font-semibold text-white hover:bg-[#3d3e44]" : "text-[#45423c] hover:bg-[#efeee9]"}`}>
          {day}{count > 0 && <span aria-hidden="true" className={`absolute bottom-1 h-1 w-1 rounded-full ${key === today ? "bg-white" : "bg-[#68624d]"}`} />}
        </Link>;
      })}
    </div>
    <div className="mt-3 border-t border-[#efede8] pt-3 text-xs leading-5 text-[#66635d]" role="status">
      {loading ? "Carregando anotações…" : error ? <span>Não foi possível carregar. <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></span> : notes.length ? `${notes.length} ${notes.length === 1 ? "anotação neste mês" : "anotações neste mês"}. Os dias marcados têm anotações.` : "Clique em um dia para fazer uma anotação."}
    </div>
  </section>;
}

function Arrow({ previous = false }: { previous?: boolean }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={previous ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
