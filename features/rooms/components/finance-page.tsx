"use client";

import type { FormEvent } from "react";

import type { Payment, PaymentStatus, PaymentType, Project } from "@/features/portfolio/portfolio.types";
import { BrazilianDateField } from "@/features/rooms/components/brazilian-date-field";
import { CustomSelect } from "@/features/rooms/components/custom-select";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const paymentStatuses: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Em atraso", CANCELLED: "Cancelado" };
const statusStyles: Record<PaymentStatus, string> = { PENDING: "bg-[#fdf3df] text-[#92660c]", PAID: "bg-[#e7f7ec] text-[#1f9d55]", OVERDUE: "bg-[#fdeaea] text-[#c33a3a]", CANCELLED: "bg-[#f1f0ed] text-[#726e66]" };

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
  const received = props.payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pending = props.payments.filter((payment) => payment.status !== "PAID" && payment.status !== "CANCELLED").reduce((sum, payment) => sum + Number(payment.amount), 0);

  return <section className="mt-7 grid gap-6 xl:grid-cols-[360px_1fr]">
    <section className="rounded-3xl border border-[#efede8] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4f4f2] text-sm text-[#6e6b65]">▤</span><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Pagamento do projeto</p><p className="mt-0.5 text-xs text-[#a19d95]">Entrada, saldo final ou outra cobrança</p></div></div>
      <form className="mt-5 space-y-3" onSubmit={props.onSubmit}>
        <CustomSelect onChange={props.setPaymentProjectId} required value={props.paymentProjectId}><option value="">Projeto *</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.clientName}</option>)}</CustomSelect>
        <input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" onChange={(event) => props.setDescription(event.target.value)} placeholder="Descrição (ex.: Entrada 50%) *" required value={props.description} />
        <div className="grid grid-cols-2 gap-3"><CustomSelect onChange={(value) => props.setType(value as PaymentType)} value={props.type}><option value="PROJECT">Projeto</option><option value="MONTHLY_MAINTENANCE">Manutenção</option><option value="OTHER">Outro</option></CustomSelect><CustomSelect onChange={(value) => props.setStatus(value as PaymentStatus)} value={props.status}>{Object.entries(paymentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></div>
        <div className="grid grid-cols-2 gap-3"><input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" min="0" onChange={(event) => props.setAmount(event.target.value)} placeholder="Valor (R$) *" required step="0.01" type="number" value={props.amount} /><BrazilianDateField label="Vencimento" onChange={props.setDueDate} required value={props.dueDate} /></div>
        <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={!props.projects.length || props.saving} type="submit">{props.saving ? "Salvando..." : "Adicionar pagamento"}</button>
      </form>
    </section>

    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#efede8] bg-white p-4"><p className="text-xs text-[#918d85]">Recebido</p><p className="mt-1 text-xl font-bold text-[#1f9d55]">{money.format(received)}</p></div>
        <div className="rounded-2xl border border-[#efede8] bg-white p-4"><p className="text-xs text-[#918d85]">Em aberto</p><p className="mt-1 text-xl font-bold text-[#92660c]">{money.format(pending)}</p></div>
      </div>

      <section className="rounded-3xl border border-[#efede8] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">Pagamentos cadastrados</p><span className="rounded-full bg-[#f0efeb] px-3 py-1 text-xs text-[#6d6962]">{props.payments.length} total</span></div>
        <div className="mt-5 space-y-2.5">
          {props.payments.length === 0 ? <div className="rounded-2xl border border-dashed border-[#dcdde6] px-4 py-8 text-center text-sm text-[#9a9ba6]">Nenhum pagamento cadastrado.</div> : props.payments.map((payment) => (
            <article className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-[#eceaf0] bg-[#fafafd] p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-4" key={payment.id}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold text-[#5e594f] shadow-sm">{payment.clientName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate font-semibold text-[#242630]">{payment.description}</p><p className="mt-1 truncate text-xs text-[#918d85]">{payment.projectName} · {payment.clientName} · vence {formatDate(payment.dueDate)}</p></div>
              <div className="col-span-2 flex items-center justify-between gap-3 sm:col-span-1 sm:flex-col sm:items-end sm:justify-center sm:gap-1.5">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles[payment.status]}`}>{paymentStatuses[payment.status]}</span>
                <p className="text-sm font-bold text-[#282930]">{money.format(payment.amount)}</p>
              </div>
              <div className="col-span-2 flex justify-end sm:col-span-1">
                {!["PAID", "CANCELLED"].includes(payment.status) ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#353640]" onClick={() => props.onMarkPaid(payment.id)} type="button">Marcar pago</button> : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  </section>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
