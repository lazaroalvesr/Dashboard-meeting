"use client";

import { useRef, useState } from "react";

type BrazilianDateFieldProps = {
  label: string;
  name?: string;
  initialValue?: string;
  required?: boolean;
  value?: string;
  onChange?: (value: string) => void;
};

function displayDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

function toIsoDate(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

export function BrazilianDateField({ label, name, initialValue = "", required = false, value: controlledValue, onChange }: BrazilianDateFieldProps) {
  const datePickerRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState(initialValue);
  const value = controlledValue ?? internalValue;
  const [textValue, setTextValue] = useState(() => displayDate(value));

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

  function openCalendar() {
    try {
      datePickerRef.current?.showPicker();
    } catch {
      datePickerRef.current?.focus();
    }
  }

  return <label className="block text-xs font-semibold text-[#666770]">{label}<div className="relative mt-1.5"><input aria-label={label} className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 pr-10 text-sm font-semibold text-[#20212a] outline-none placeholder:text-[#8e919b] focus:border-[#6d6e79]" inputMode="numeric" maxLength={10} onChange={(event) => handleTextChange(event.target.value)} placeholder="dd/mm/aaaa" required={required} value={textValue} /><button aria-label={`Abrir agenda de ${label}`} className="absolute inset-y-0 right-0 grid w-10 place-items-center text-base text-[#20212a] transition hover:text-[#6d6e79]" onClick={openCalendar} type="button">▣</button><input className="absolute h-px w-px opacity-0" name={name} onChange={(event) => setDate(event.target.value)} ref={datePickerRef} tabIndex={-1} type="date" value={value} /></div></label>;
}
