"use client";

import { useState, type FormEvent } from "react";

import type { ContractStatus, Project, ProjectStatus, ProjectType } from "@/features/portfolio/portfolio.types";
import { authenticatedBlob, authenticatedRequest } from "@/lib/api.client";
import { CustomSelect } from "@/features/rooms/components/custom-select";
import { BrazilianDateField } from "@/features/rooms/components/brazilian-date-field";

const projectTypes: Record<ProjectType, string> = { LANDING_PAGE: "Landing page", INSTITUTIONAL_WEBSITE: "Site institucional", ECOMMERCE: "E-commerce", WEB_SYSTEM: "Sistema web", MAINTENANCE: "Manutenção", OTHER: "Outro" };
const projectStatuses: Record<ProjectStatus, string> = { LEAD: "Proposta", PLANNING: "Planejamento", DESIGN: "Design", DEVELOPMENT: "Desenvolvimento", REVIEW: "Revisão", DELIVERED: "Entregue", MAINTENANCE: "Manutenção", CANCELLED: "Cancelado" };
const contractStatuses: Record<ContractStatus, string> = { NOT_STARTED: "Não iniciado", DRAFT: "Rascunho", SENT: "Enviado", SIGNED: "Assinado" };

type Props = { project: Project; onClose: () => void; onUpdated: (project: Project) => void };

export function ProjectEditModalV3({ project, onClose, onUpdated }: Props) {
  const [name, setName] = useState(project.name);
  const [projectType, setProjectType] = useState<ProjectType>(project.projectType);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [scope, setScope] = useState(project.scope ?? "");
  const [totalValue, setTotalValue] = useState(project.totalValue?.toString() ?? "");
  const [contractStatus, setContractStatus] = useState<ContractStatus>(project.contractStatus);
  const [contractUrl, setContractUrl] = useState(project.contractUrl?.startsWith("/api/") ? "" : project.contractUrl ?? "");
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [maintenanceActive, setMaintenanceActive] = useState(project.maintenanceActive);
  const [maintenanceValue, setMaintenanceValue] = useState(project.maintenanceMonthlyValue?.toString() ?? "");
  const [startDate, setStartDate] = useState(project.startDate ?? project.createdAt.slice(0, 10));
  const [deliveryDate, setDeliveryDate] = useState(project.deliveryDate ?? "");
  const [saving, setSaving] = useState(false);
  const [openingContract, setOpeningContract] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function previewContract() {
    if (!project.contractUrl) return;
    const previewTab = window.open("", "_blank");
    setOpeningContract(true);
    setError(null);
    try {
      if (project.contractUrl.startsWith("/api/")) {
        const blob = await authenticatedBlob(project.contractUrl);
        const objectUrl = URL.createObjectURL(blob);
        if (previewTab) previewTab.location.href = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else if (previewTab) {
        previewTab.location.href = project.contractUrl;
      }
    } catch (cause) {
      previewTab?.close();
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o contrato.");
    } finally {
      setOpeningContract(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let updated = await authenticatedRequest<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name, projectType, status, scope: scope || null, totalValue: totalValue ? Number(totalValue) : null, contractStatus, contractUrl: contractUrl || null, maintenanceActive, maintenanceMonthlyValue: maintenanceActive && maintenanceValue ? Number(maintenanceValue) : null, startDate, deliveryDate: deliveryDate || null }) });
      if (contractFile) {
        const formData = new FormData();
        formData.append("file", contractFile);
        updated = await authenticatedRequest<Project>(`/api/projects/${project.id}/contract`, { method: "POST", body: formData });
      }
      onUpdated(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o projeto.");
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#161719]/45 p-5" onClick={onClose} role="dialog" aria-modal="true"><div className="modal-scrollbar max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">Editar projeto</p><p className="mt-1 text-sm text-[#88837b]">Cliente: {project.clientName}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={onClose} type="button">×</button></div>{error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}<form className="mt-6 space-y-4" onSubmit={save}><input className={field} onChange={(event) => setName(event.target.value)} required value={name} /><div className="grid gap-3 sm:grid-cols-2"><CustomSelect onChange={(value) => setProjectType(value as ProjectType)} value={projectType}>{Object.entries(projectTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect><CustomSelect onChange={(value) => setStatus(value as ProjectStatus)} value={status}>{Object.entries(projectStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</CustomSelect></div><textarea className={`${field} min-h-24`} onChange={(event) => setScope(event.target.value)} placeholder="Escopo do projeto" value={scope} /><div className="grid gap-3 sm:grid-cols-2"><input className={field} min="0" onChange={(event) => setTotalValue(event.target.value)} placeholder="Valor (R$)" step="0.01" type="number" value={totalValue} /><CustomSelect onChange={(value) => setContractStatus(value as ContractStatus)} value={contractStatus}>{Object.entries(contractStatuses).map(([value, label]) => <option key={value} value={value}>Contrato: {label}</option>)}</CustomSelect></div><div className="grid gap-3 sm:grid-cols-2"><BrazilianDateField label="Data de início" onChange={setStartDate} value={startDate} /><BrazilianDateField label="Previsão de entrega" onChange={setDeliveryDate} value={deliveryDate} /></div><section className="rounded-2xl border border-dashed border-[#cfcac0] bg-[#faf9f6] p-4 text-sm text-[#4e4d52]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">Contrato em PDF</p><p className="mt-1 text-xs text-[#878179]">Anexe uma nova versão ou abra o documento já vinculado.</p></div>{project.contractUrl ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#353640] disabled:opacity-60" disabled={openingContract} onClick={() => void previewContract()} type="button">{openingContract ? "Abrindo..." : "Visualizar contrato"}</button> : null}</div><input accept="application/pdf,.pdf" className="mt-4 block w-full text-xs text-[#6f6b64] file:mr-3 file:rounded-lg file:border-0 file:bg-[#20212a] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" onChange={(event) => setContractFile(event.target.files?.[0] ?? null)} type="file" />{contractFile ? <p className="mt-2 text-xs font-medium text-[#26783a]">Novo arquivo selecionado: {contractFile.name}</p> : project.contractUrl ? <p className="mt-2 text-xs font-medium text-[#26783a]">PDF anexado e disponível para visualização.</p> : null}</section><input className={field} onChange={(event) => setContractUrl(event.target.value)} placeholder="Link externo do contrato (opcional)" type="url" value={contractUrl} /><label className="flex items-center gap-2 text-sm text-[#73747e]"><input checked={maintenanceActive} onChange={(event) => setMaintenanceActive(event.target.checked)} type="checkbox" />Possui manutenção mensal</label>{maintenanceActive ? <input className={field} min="0" onChange={(event) => setMaintenanceValue(event.target.value)} placeholder="Mensalidade (R$)" step="0.01" type="number" value={maintenanceValue} /> : null}<button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={saving} type="submit">{saving ? "Salvando..." : contractFile ? "Salvar e anexar PDF" : "Salvar alterações"}</button></form></div></div>;
}
