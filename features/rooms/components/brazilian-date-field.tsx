"use client";

import { useEffect, useRef, useState } from "react";

type BrazilianDateFieldProps = {
  label: string;
  name?: string;
  initialValue?: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
};

const weekdayLabels = ["D", "S", "T", "Q", "Q", "S", "S"];
const monthNamesShort = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(2024, index, 1)).replace(".", ""));

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function toIsoDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

// A custom day-grid popover instead of the native <input type="date"> picker, whose calendar
// is rendered by the browser shell in the browser's UI language, ignoring our lang="pt-BR".
export function BrazilianDateField({ label, name, initialValue = "", required = false, value: controlledValue, onChange }: BrazilianDateFieldProps) {
  const [internalValue, setInternalValue] = useState(initialValue);
  const value = controlledValue ?? internalValue;
  const [textValue, setTextValue] = useState(() => displayDate(value));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const [viewYear, setViewYear] = useState(() => (value ? Number(value.split("-")[0]) : today.getFullYear()));
  const [viewMonth, setViewMonth] = useState(() => (value ? Number(value.split("-")[1]) - 1 : today.getMonth()));

  function setDate(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
    setTextValue(displayDate(nextValue));
  }

  function handleTextChange(nextText: string) {
    setTextValue(nextText);
    const isoDate = toIsoDate(nextText);
    if (isoDate) setDate(isoDate);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openCalendar() {
    const [currentYear, currentMonth] = value ? value.split("-").map(Number) : [today.getFullYear(), today.getMonth() + 1];
    setViewYear(currentYear);
    setViewMonth(currentMonth - 1);
    setOpen(true);
  }

  function changeMonth(offset: number) {
    const date = new Date(viewYear, viewMonth + offset, 1);
    setViewYear(date.getFullYear());
    setViewMonth(date.getMonth());
  }

  function selectDay(dayOfMonth: number) {
    setDate(`${viewYear}-${pad(viewMonth + 1)}-${pad(dayOfMonth)}`);
    setOpen(false);
  }

  function selectToday() {
    setDate(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`);
    setOpen(false);
  }

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const isSelected = (dayOfMonth: number) => value === `${viewYear}-${pad(viewMonth + 1)}-${pad(dayOfMonth)}`;
  const isToday = (dayOfMonth: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === dayOfMonth;

  return (
    <label className="block text-xs font-semibold text-[#666770]">
      {label}
      <div className="relative mt-1.5" ref={containerRef}>
        <input aria-label={label} className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 pr-10 text-sm font-semibold text-[#20212a] outline-none placeholder:text-[#8e919b] focus:border-[#6d6e79]" inputMode="numeric" maxLength={10} onChange={(event) => handleTextChange(event.target.value)} placeholder="dd/mm/aaaa" required={required} value={textValue} />
        <button aria-label={`Abrir agenda de ${label}`} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-base text-[#20212a] transition hover:text-[#6d6e79]" onClick={openCalendar} type="button">▣</button>
        {name ? <input name={name} type="hidden" value={value} /> : null}
        {open ? (
          <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-72 rounded-2xl border border-[#efede8] bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between">
              <button aria-label="Mês anterior" className="grid h-7 w-7 place-items-center rounded-full text-sm text-[#726e66] transition hover:bg-[#f1f0ed]" onClick={() => changeMonth(-1)} type="button">‹</button>
              <span className="text-sm font-semibold capitalize text-[#242630]">{monthNamesShort[viewMonth]} {viewYear}</span>
              <button aria-label="Próximo mês" className="grid h-7 w-7 place-items-center rounded-full text-sm text-[#726e66] transition hover:bg-[#f1f0ed]" onClick={() => changeMonth(1)} type="button">›</button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-[#a19d95]">
              {weekdayLabels.map((weekday, index) => <span key={index}>{weekday}</span>)}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-y-1">
              {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} />)}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((dayOfMonth) => (
                <button
                  className={`mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-medium transition ${isSelected(dayOfMonth) ? "bg-[#202126] text-white" : isToday(dayOfMonth) ? "border border-[#202126] text-[#202126]" : "text-[#4c4a46] hover:bg-[#f1f0ed]"}`}
                  key={dayOfMonth}
                  onClick={() => selectDay(dayOfMonth)}
                  type="button"
                >
                  {dayOfMonth}
                </button>
              ))}
            </div>
            <button className="mt-3 w-full rounded-xl bg-[#f4f3ef] py-2 text-xs font-semibold text-[#5f5c56] transition hover:bg-[#ecebe6]" onClick={selectToday} type="button">Hoje</button>
          </div>
        ) : null}
      </div>
    </label>
  );
}
