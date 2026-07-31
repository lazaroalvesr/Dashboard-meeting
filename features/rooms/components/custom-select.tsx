"use client";

import { Children, isValidElement, useEffect, useRef, useState, type ReactNode } from "react";

type Option = { value: string; label: string };

function optionLabel(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(optionLabel).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return optionLabel(node.props.children);
  return "";
}

// Replaces the native <select>, whose popup is rendered by the OS/browser shell and ignores
// our lang="pt-BR" — it shows up in the browser's UI language instead of Portuguese.
export function CustomSelect({ value, onChange, required, children }: { value: string; onChange: (value: string) => void; required?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const options: Option[] = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string; children?: ReactNode }>(child)) return [];
    return [{ value: typeof child.props.value === "string" ? child.props.value : "", label: optionLabel(child.props.children) }];
  });

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const selected = options.find((option) => option.value === value);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-left text-sm text-[#20212a] outline-none transition focus:border-[#6d6e79]"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="truncate">{selected?.label ?? ""}</span>
        <span className={`shrink-0 text-[10px] text-[#9b9ba6] transition-transform duration-150 ${open ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {open ? (
        <div className="modal-scrollbar absolute left-0 top-[calc(100%+6px)] z-30 max-h-60 w-full overflow-y-auto rounded-xl border border-[#e6e6ee] bg-white p-1.5 shadow-xl" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${option.value === value ? "bg-[#202126] text-white" : "text-[#20212a] hover:bg-[#f4f4f2]"}`}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {required ? <input aria-hidden className="sr-only" onChange={() => {}} required tabIndex={-1} value={value} /> : null}
    </div>
  );
}
