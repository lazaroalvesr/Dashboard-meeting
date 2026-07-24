"use client";

import type { FormEvent } from "react";

import type { Payment, PaymentStatus, PaymentType, Project } from "@/features/portfolio/portfolio.types";
import { BrazilianDateField } from "@/features/rooms/components/brazilian-date-field";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const paymentStatuses: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Em atraso", CANCELLED: "Cancelado" };

type FinancePageProps = {
  projects: Project[];
  payments: Payment[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onMarkPaid: (id: string) => void;
  paymentProjectId: string;
  setPaymentProjectId: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  amount: string;
  setAmount: (value: string) => void;
  dueDate: string;
  setDueDate: (value: string) => void;
  status: PaymentStatus;
  setStatus: (value: PaymentStatus) => void;
  type: PaymentType;
  setType: (value: PaymentType) => void;
  saving: boolean;
};

export function FinancePageV3(props: FinancePageProps) {
  return <section className="mt-7 grid gap-6 xl:grid-cols-[360px_1fr]">
    <section className="rounded-3xl bg-white p-5 shadow-[0_12px_35px_rgba(34,35,47,0.04)] sm:p-6">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Pagamento do projeto</p>
      <p className="mt-2 text-sm text-[#85817a]">Registre entrada, saldo final ou qualquer outra cobrança.</p>
      <form className="mt-5 space-y-3" onSubmit={props.onSubmit}>
        <select className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" onChange={(event) => props.setPaymentProjectId(event.target.value)} required value={props.paymentProjectId}><option value="">Projeto *</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.clientName}</option>)}</select>
        <input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" onChange={(event) => props.setDescription(event.target.value)} placeholder="Descrição (ex.: Entrada 50%) *" required value={props.description} />
        <div className="grid grid-cols-2 gap-3"><select className="rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" onChange={(event) => props.setType(event.target.value as PaymentType)} value={props.type}><option value="PROJECT">Projeto</option><option value="MONTHLY_MAINTENANCE">Manutenção</option><option value="OTHER">Outro</option></select><select className="rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" onChange={(event) => props.setStatus(event.target.value as PaymentStatus)} value={props.status}>{Object.entries(paymentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" min="0" onChange={(event) => props.setAmount(event.target.value)} placeholder="Valor (R$) *" required step="0.01" type="number" value={props.amount} />
        <BrazilianDateField label="Data de vencimento" onChange={props.setDueDate} required value={props.dueDate} />
        <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={!props.projects.length || props.saving} type="submit">{props.saving ? "Salvando..." : "Adicionar pagamento"}</button>
      </form>
    </section>

    <section className="rounded-3xl bg-white p-5 shadow-[0_12px_35px_rgba(34,35,47,0.04)] sm:p-6">
      <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Pagamentos cadastrados</p><span className="rounded-full bg-[#f0efeb] px-3 py-1 text-xs text-[#6d6962]">{props.payments.length} total</span></div>
      <div className="mt-5 space-y-3">
        {props.payments.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dcdde6] px-4 py-8 text-center text-sm text-[#9a9ba6]">Nenhum pagamento cadastrado.</div> : props.payments.map((payment) => <article className="grid gap-4 rounded-2xl border border-[#eceaf0] bg-[#fafafd] px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center" key={payment.id}><div className="min-w-0"><p className="truncate font-semibold">{payment.description}</p><p className="mt-1 truncate text-sm text-[#999aa5]">{payment.projectName} · {payment.clientName} · vence {formatDate(payment.dueDate)}</p></div><div className="md:text-right"><p className="font-bold">{money.format(payment.amount)}</p><p className={payment.status === "PAID" ? "mt-1 text-xs text-emerald-600" : "mt-1 text-xs text-amber-600"}>{paymentStatuses[payment.status]}</p></div><div className="flex flex-wrap gap-2 md:justify-end">{!["PAID", "CANCELLED"].includes(payment.status) ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#353640]" onClick={() => props.onMarkPaid(payment.id)} type="button">Marcar pago</button> : <span className="rounded-xl bg-[#edf7ef] px-3 py-2 text-xs font-medium text-emerald-700">Confirmado</span>}</div></article>)}
      </div>
    </section>
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
