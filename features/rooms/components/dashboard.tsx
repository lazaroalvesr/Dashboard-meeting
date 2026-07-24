"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getAccessToken, logout, refreshAccessToken } from "@/features/auth/auth.client";
import type { Client, ContractStatus, Payment, PaymentStatus, PaymentType, Project, ProjectStatus, ProjectType } from "@/features/portfolio/portfolio.types";
import { ApiError, authenticatedRequest } from "@/lib/api.client";
import { FinancePageV3 } from "@/features/rooms/components/finance-page";
import { BrazilianDateField } from "@/features/rooms/components/brazilian-date-field";
import { ProjectEditModalV3 } from "@/features/rooms/components/project-edit-modal";
import { ConfirmationModal } from "@/features/rooms/components/confirmation-modal";

import type { CreateRoomRequest, Room } from "../room.types";

type Section = "overview" | "clients" | "projects" | "finance" | "rooms";

type DashboardSnapshot = {
  clients: Client[];
  projects: Project[];
  payments: Payment[];
  rooms: Room[];
};

type DashboardSearchResult = {
  id: string;
  title: string;
  subtitle: string;
  category: "Cliente" | "Projeto" | "Cobrança" | "Sala";
  href: string;
};

type ConfirmationRequest = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

// O layout do App Router troca a página de cada seção. Mantemos o último
// resultado em memória para a próxima seção aparecer pronta, sem tela vazia.
let dashboardSnapshot: DashboardSnapshot | null = null;

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const projectTypes: Record<ProjectType, string> = { LANDING_PAGE: "Landing page", INSTITUTIONAL_WEBSITE: "Site institucional", ECOMMERCE: "E-commerce", WEB_SYSTEM: "Sistema web", MAINTENANCE: "Manutencao", OTHER: "Outro" };
const projectStatuses: Record<ProjectStatus, string> = { LEAD: "Proposta", PLANNING: "Planejamento", DESIGN: "Design", DEVELOPMENT: "Desenvolvimento", REVIEW: "Revisao", DELIVERED: "Entregue", MAINTENANCE: "Manutencao", CANCELLED: "Cancelado" };
const contractStatuses: Record<ContractStatus, string> = { NOT_STARTED: "Nao iniciado", DRAFT: "Rascunho", SENT: "Enviado", SIGNED: "Assinado" };
const paymentStatuses: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Em atraso", CANCELLED: "Cancelado" };

export function Dashboard({ section = "overview" }: { section?: Section }) {
  const router = useRouter();
  useEffect(() => {
    document.body.classList.add("dashboard-page");
    return () => document.body.classList.remove("dashboard-page");
  }, []);
  const [clients, setClients] = useState<Client[]>(() => dashboardSnapshot?.clients ?? []);
  const [projects, setProjects] = useState<Project[]>(() => dashboardSnapshot?.projects ?? []);
  const [payments, setPayments] = useState<Payment[]>(() => dashboardSnapshot?.payments ?? []);
  const [rooms, setRooms] = useState<Room[]>(() => dashboardSnapshot?.rooms ?? []);
  const [loading, setLoading] = useState(() => dashboardSnapshot === null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("INSTITUTIONAL_WEBSITE");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("PLANNING");
  const [contractStatus, setContractStatus] = useState<ContractStatus>("NOT_STARTED");
  const [projectValue, setProjectValue] = useState("");
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceValue, setMaintenanceValue] = useState("");
  const [paymentProjectId, setPaymentProjectId] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PENDING");
  const [paymentType, setPaymentType] = useState<PaymentType>("PROJECT");
  const [roomTitle, setRoomTitle] = useState("");
  const [roomUrl, setRoomUrl] = useState("");
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);

  useEffect(() => {
    async function load() {
      if (dashboardSnapshot) {
        setClients(dashboardSnapshot.clients);
        setProjects(dashboardSnapshot.projects);
        setPayments(dashboardSnapshot.payments);
        setRooms(dashboardSnapshot.rooms);
        setLoading(false);
      }

      const token = getAccessToken() ?? await refreshAccessToken();
      if (!token) return router.replace("/login");
      try {
        const [nextClients, nextProjects, nextPayments, nextRooms] = await Promise.all([
          authenticatedRequest<Client[]>("/api/clients"), authenticatedRequest<Project[]>("/api/projects"),
          authenticatedRequest<Payment[]>("/api/payments"), authenticatedRequest<Room[]>("/api/rooms"),
        ]);
        dashboardSnapshot = { clients: nextClients, projects: nextProjects, payments: nextPayments, rooms: nextRooms };
        setClients(nextClients); setProjects(nextProjects); setPayments(nextPayments); setRooms(nextRooms);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) return router.replace("/login");
        setError("Nao foi possivel carregar os dados. Confira se o Spring esta rodando.");
      } finally { setLoading(false); }
    }
    void load();
  }, [router]);

  const metrics = useMemo(() => ({
    openProjects: projects.filter((project) => !["DELIVERED", "CANCELLED"].includes(project.status)).length,
    pending: payments.filter((payment) => ["PENDING", "OVERDUE"].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount), 0),
    monthly: projects.filter((project) => project.maintenanceActive).reduce((sum, project) => sum + Number(project.maintenanceMonthlyValue ?? 0), 0),
  }), [payments, projects]);

  async function createClient(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving("client"); setError(null); try { const client = await authenticatedRequest<Client>("/api/clients", { method: "POST", body: JSON.stringify({ name: clientName, companyName: clientCompany || null, email: clientEmail || null }) }); setClients((current) => [client, ...current]); setSelectedClientId(client.id); setClientName(""); setClientCompany(""); setClientEmail(""); return true; } catch (cause) { setError(message(cause, "Nao foi possivel cadastrar o cliente.")); return false; } finally { setSaving(null); } }
  async function updateClient(clientId: string) { setSaving("client"); setError(null); try { const client = await authenticatedRequest<Client>(`/api/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ name: clientName, companyName: clientCompany || null, email: clientEmail || null }) }); setClients((current) => current.map((item) => item.id === client.id ? client : item)); setClientName(""); setClientCompany(""); setClientEmail(""); return true; } catch (cause) { setError(message(cause, "Nao foi possivel atualizar o cliente.")); return false; } finally { setSaving(null); } }
  function deleteClient(client: Client) {
    setConfirmation({
      title: "Apagar cliente?",
      description: `Você vai apagar ${client.name}, todos os projetos e todas as cobranças vinculadas. Esta ação não pode ser desfeita.`,
      confirmLabel: "Apagar cliente",
      onConfirm: async () => {
        const clientProjectIds = new Set(projects.filter((project) => project.clientId === client.id).map((project) => project.id));
        setDeletingClientId(client.id); setError(null);
        try {
          await authenticatedRequest<void>(`/api/clients/${client.id}`, { method: "DELETE" });
          setClients((current) => current.filter((item) => item.id !== client.id));
          setProjects((current) => current.filter((project) => project.clientId !== client.id));
          setPayments((current) => current.filter((payment) => !clientProjectIds.has(payment.projectId)));
          if (selectedClientId === client.id) setSelectedClientId("");
        } catch (cause) { setError(message(cause, "Não foi possível apagar o cliente.")); }
        finally { setDeletingClientId(null); }
      },
    });
  }
  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving("project");
    setError(null);
    try {
      const formData = new FormData(event.currentTarget);
      const project = await authenticatedRequest<Project>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          clientId: selectedClientId,
          name: projectName,
          projectType,
          status: projectStatus,
          totalValue: projectValue ? Number(projectValue) : null,
          contractStatus,
          maintenanceActive,
          maintenanceMonthlyValue: maintenanceActive && maintenanceValue ? Number(maintenanceValue) : null,
          installmentCount: Number(formData.get("installmentCount") ?? 1),
          startDate: toIsoDate(String(formData.get("startDate") || "")) || new Date().toISOString().slice(0, 10),
          deliveryDate: toIsoDate(String(formData.get("deliveryDate") || "")) || null,
        }),
      });
      setProjects((current) => [project, ...current]);
      const nextPayments = await authenticatedRequest<Payment[]>("/api/payments");
      setPayments(nextPayments);
      setPaymentProjectId(project.id);
      setProjectName("");
      setProjectValue("");
      setMaintenanceValue("");
      setMaintenanceActive(false);
    } catch (cause) {
      setError(message(cause, "Nao foi possivel criar o projeto."));
    } finally {
      setSaving(null);
    }
  }
  function replaceProject(updatedProject: Project) { setProjects((current) => current.map((project) => project.id === updatedProject.id ? updatedProject : project)); }
  async function deleteProject(project: Project) {
    setConfirmation({
      title: "Apagar projeto?",
      description: `Você vai apagar ${project.name} e todas as cobranças vinculadas. Esta ação não pode ser desfeita.`,
      confirmLabel: "Apagar projeto",
      onConfirm: async () => {
        setDeletingProjectId(project.id); setError(null);
        try {
          await authenticatedRequest<void>(`/api/projects/${project.id}`, { method: "DELETE" });
          setProjects((current) => current.filter((item) => item.id !== project.id));
          setPayments((current) => current.filter((item) => item.projectId !== project.id));
          if (paymentProjectId === project.id) setPaymentProjectId("");
        } catch (cause) { setError(message(cause, "Não foi possível apagar o projeto.")); }
        finally { setDeletingProjectId(null); }
      },
    });
    return;
    setDeletingProjectId(project.id);
    setError(null);
    try {
      await authenticatedRequest<void>(`/api/projects/${project.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setPayments((current) => current.filter((item) => item.projectId !== project.id));
      if (paymentProjectId === project.id) setPaymentProjectId("");
    } catch (cause) {
      setError(message(cause, "Não foi possível apagar o projeto."));
    } finally {
      setDeletingProjectId(null);
    }
  }
  async function createPayment(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving("payment"); setError(null); try { const payment = await authenticatedRequest<Payment>("/api/payments", { method: "POST", body: JSON.stringify({ projectId: paymentProjectId, description: paymentDescription, paymentType, status: paymentStatus, amount: Number(paymentAmount), dueDate: paymentDueDate }) }); setPayments((current) => [...current, payment].sort((a, b) => a.dueDate.localeCompare(b.dueDate))); setPaymentDescription(""); setPaymentAmount(""); setPaymentDueDate(""); } catch (cause) { setError(message(cause, "Nao foi possivel criar a cobranca.")); } finally { setSaving(null); } }
  async function createRoom(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving("room"); setError(null); try { const room = await authenticatedRequest<Room>("/api/rooms", { method: "POST", body: JSON.stringify({ title: roomTitle, projectUrl: roomUrl } satisfies CreateRoomRequest) }); setRooms((current) => [room, ...current]); setRoomTitle(""); setRoomUrl(""); } catch (cause) { setError(message(cause, "Nao foi possivel criar a sala.")); } finally { setSaving(null); } }
  async function markPaid(id: string) { try { const payment = await authenticatedRequest<Payment>(`/api/payments/${id}/mark-paid`, { method: "PATCH" }); setPayments((current) => current.map((item) => item.id === id ? payment : item)); } catch (cause) { setError(message(cause, "Nao foi possivel atualizar o pagamento.")); } }
  function deleteRoom(room: Room) {
    setConfirmation({
      title: "Apagar sala?",
      description: `Você vai apagar a sala ${room.title}. O link deixará de funcionar para todos os participantes.`,
      confirmLabel: "Apagar sala",
      onConfirm: async () => {
        setDeletingSlug(room.slug); setError(null);
        try { await authenticatedRequest<void>(`/api/rooms/${room.slug}`, { method: "DELETE" }); setRooms((current) => current.filter((item) => item.id !== room.id)); }
        catch (cause) { setError(message(cause, "Não foi possível apagar a sala.")); }
        finally { setDeletingSlug(null); }
      },
    });
  }
  async function copyRoom(room: Room) { await navigator.clipboard.writeText(`${window.location.origin}/room/${room.slug}`); setCopiedSlug(room.slug); window.setTimeout(() => setCopiedSlug(null), 1500); }

  if (loading) return <main className="grid min-h-screen place-items-center bg-white text-[#77736c]">Carregando seu painel...</main>;

  const pageTitle: Record<Section, string> = { overview: "Dashboard", clients: "Clientes", projects: "Projetos", finance: "Financeiro", rooms: "Salas de reuniao" };
  return (
    <main className="min-h-screen bg-white text-[#20212a]">
      <Sidebar active={section} onLogout={() => void logout().then(() => router.replace("/login"))} />
      <div className="min-h-screen px-5 py-8 sm:px-8 lg:ml-52 lg:px-8 xl:px-10">
        {section !== "overview" ? <header className="flex items-start justify-between gap-5">
          <div><h1 className="text-2xl font-bold tracking-tight">{pageTitle[section]}</h1><p className="mt-1 text-sm text-[#817d75]">Gerencie seu estudio em um so lugar</p></div>
          <div className="flex items-center gap-3"><div className="hidden w-64 rounded-full bg-white px-4 py-2.5 text-sm text-[#9b968e] shadow-sm md:block">⌕&nbsp;&nbsp; Buscar</div><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-sm font-bold text-[#62462d] shadow-sm">AR</span></div>
        </header> : null}
        {error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {section === "overview" && <SalesOverview clients={clients} projects={projects} payments={payments} rooms={rooms} metrics={metrics} />}
        {section === "clients" && <ClientsPage clients={clients} projects={projects} onSubmit={createClient} onUpdate={updateClient} onDelete={deleteClient} deletingId={deletingClientId} name={clientName} company={clientCompany} email={clientEmail} setName={setClientName} setCompany={setClientCompany} setEmail={setClientEmail} saving={saving === "client"} />}
        {section === "projects" && <ProjectsPageV2 clients={clients} projects={projects} onSubmit={createProject} onUpdated={replaceProject} onDelete={deleteProject} deletingId={deletingProjectId} selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId} projectName={projectName} setProjectName={setProjectName} projectType={projectType} setProjectType={setProjectType} projectStatus={projectStatus} setProjectStatus={setProjectStatus} contractStatus={contractStatus} setContractStatus={setContractStatus} projectValue={projectValue} setProjectValue={setProjectValue} maintenanceActive={maintenanceActive} setMaintenanceActive={setMaintenanceActive} maintenanceValue={maintenanceValue} setMaintenanceValue={setMaintenanceValue} saving={saving === "project"} />}
        {section === "finance" && <FinancePageV3 projects={projects} payments={payments} onSubmit={createPayment} onMarkPaid={markPaid} paymentProjectId={paymentProjectId} setPaymentProjectId={setPaymentProjectId} description={paymentDescription} setDescription={setPaymentDescription} amount={paymentAmount} setAmount={setPaymentAmount} dueDate={paymentDueDate} setDueDate={setPaymentDueDate} status={paymentStatus} setStatus={setPaymentStatus} type={paymentType} setType={setPaymentType} saving={saving === "payment"} />}
        {section === "rooms" && <RoomsPage rooms={rooms} onSubmit={createRoom} title={roomTitle} setTitle={setRoomTitle} url={roomUrl} setUrl={setRoomUrl} saving={saving === "room"} deletingSlug={deletingSlug} copiedSlug={copiedSlug} onDelete={deleteRoom} onCopy={copyRoom} />}
      </div>
      {confirmation ? <ConfirmationModal
        confirmLabel={confirmation.confirmLabel}
        description={confirmation.description}
        isConfirming={confirmingAction}
        onClose={() => setConfirmation(null)}
        onConfirm={() => {
          setConfirmingAction(true);
          void confirmation.onConfirm().finally(() => {
            setConfirmingAction(false);
            setConfirmation(null);
          });
        }}
        title={confirmation.title}
      /> : null}
    </main>
  );
}

function Sidebar({ active, onLogout }: { active: Section; onLogout: () => void }) {
  const items: Array<[Section, string, string, string]> = [
    ["overview", "Início", "/dashboard", "⌂"],
    ["clients", "Clientes", "/dashboard/clients", "♙"],
    ["projects", "Projetos", "/dashboard/projects", "□"],
    ["finance", "Financeiro", "/dashboard/finance", "▤"],
    ["rooms", "Reuniões", "/dashboard/rooms", "◉"],
  ];

  return (
    <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-48 flex-col rounded-[38px] bg-[#f1f2f3] p-4 shadow-[0_18px_42px_rgba(78,69,52,0.08)] lg:flex">
      <div className="flex items-center gap-2.5 px-2 pb-6 pt-1">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#22242d] text-xs font-extrabold tracking-tight text-white">AR</span>
        <span className="text-sm font-bold tracking-tight text-[#292a31]">AlvesR</span>
      </div>
      <nav className="space-y-1">
        {items.map(([key, label, href, icon]) => (
          <Link aria-label={label} className={`flex h-10 items-center gap-3 rounded-[18px] px-3 text-[13px] font-medium transition-all duration-200 ${active === key ? "bg-[#202126] text-white shadow-[0_8px_18px_rgba(31,32,38,0.2)]" : "text-[#58585d] hover:bg-[#efede9] hover:text-[#202126]"}`} href={href} key={key}>
            <span className="grid h-5 w-5 place-items-center text-base leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-7 rounded-[22px] bg-white p-3 shadow-[0_8px_20px_rgba(77,70,59,0.07)]">
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#efeee9] text-xs text-[#22242d]">●</span><div><p className="text-xs font-bold text-[#2a2b31]">Seu estúdio</p><p className="text-[10px] text-[#98958f]">Tudo em um só lugar</p></div></div>
        <p className="mt-3 rounded-xl bg-[#f3f1ec] px-2.5 py-2 text-[10px] leading-4 text-[#76736d]">Clientes, projetos e reuniões organizados para você.</p>
      </div>
      <button aria-label="Sair" className="mt-auto flex h-10 items-center gap-3 rounded-[18px] px-3 text-[13px] font-medium text-[#58585d] transition hover:bg-[#ffe9e9] hover:text-red-500" onClick={onLogout} type="button"><span className="grid h-5 w-5 place-items-center text-base">↪</span><span>Sair</span></button>
    </aside>
  );
}

function LegacySidebar({ active, onLogout }: { active: Section; onLogout: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const items: Array<[Section, string, string, string]> = [["overview", "Dashboard", "/dashboard", "⌂"], ["clients", "Clientes", "/dashboard/clients", "♙"], ["projects", "Projetos", "/dashboard/projects", "▣"], ["finance", "Financeiro", "/dashboard/finance", "▤"], ["rooms", "Salas", "/dashboard/rooms", "◉"]];

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 hidden flex-col py-7 transition-[width] duration-300 ease-out lg:flex ${expanded ? "w-60 px-4" : "w-20 items-center"}`}>
      <div className="absolute left-5 top-6 flex items-center gap-2 whitespace-nowrap">
        <button aria-label="Expandir menu" className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#242630] text-sm font-bold text-white shadow-sm" onClick={() => setExpanded((current) => !current)} type="button">AR</button>
      </div>
      <nav className={`mt-16 flex flex-col gap-2 rounded-[28px] bg-white py-3 shadow-[0_10px_24px_rgba(74,65,51,0.06)] transition-[width] duration-300 ${expanded ? "w-full px-2" : "w-14 px-2"}`}>
        {items.map(([key, label, href, icon]) => <Link aria-label={label} className={`flex h-11 items-center rounded-xl text-sm transition ${expanded ? "gap-3 px-3" : "w-10 justify-center self-center"} ${active === key ? "bg-[#22242d] text-white shadow-lg shadow-[#22242d]/15" : "text-[#8c8b91] hover:bg-[#f2eee8] hover:text-[#20212a]"}`} href={href} key={key} title={label}><span className="grid h-6 w-6 place-items-center text-base">{icon}</span>{expanded ? <span className="whitespace-nowrap font-medium">{label}</span> : null}</Link>)}
      </nav>
      <button aria-label="Sair" className={`mt-auto flex h-11 items-center rounded-[18px] bg-white text-sm text-[#8c8b91] shadow-[0_10px_24px_rgba(74,65,51,0.06)] transition hover:bg-[#ffe9e9] hover:text-red-500 ${expanded ? "w-full gap-3 px-4" : "mb-2 w-14 justify-center self-center"}`} onClick={onLogout} type="button"><span className="text-base">↪</span>{expanded ? <span>Sair</span> : null}</button>
    </aside>
  );
}

function LegacyOverview({ clients, projects, payments, rooms, metrics }: { clients: Client[]; projects: Project[]; payments: Payment[]; rooms: Room[]; metrics: { openProjects: number; pending: number; monthly: number } }) { const bars = payments.slice(0, 10).map((payment) => Math.max(18, Math.min(100, Number(payment.amount) / Math.max(metrics.pending || 1, 1) * 170))); return <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_290px]"><div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><MetricCard icon="♙" label="Clientes" value={String(clients.length)} detail="Carteira ativa" /><MetricCard icon="↔" label="Projetos" value={String(metrics.openProjects)} detail="Em andamento" /><MetricCard icon="▤" label="A receber" value={money.format(metrics.pending)} detail="Cobrancas abertas" /><MetricCard icon="◉" label="Salas" value={String(rooms.length)} detail="Apresentacoes" /></div><Surface className="mt-6"><div className="flex items-end justify-between"><div><p className="text-xs text-[#9697a1]">Saldo estimado</p><h2 className="mt-1 text-3xl font-bold">{money.format(metrics.pending + metrics.monthly)}</h2></div><span className="text-[10px] font-medium text-[#a1a2ad]">ULTIMOS REGISTROS</span></div><div className="mt-8 flex h-44 items-end justify-between gap-2 border-b border-[#e8e8ef] px-1">{(bars.length ? bars : [24, 40, 62, 48, 78, 56, 92, 65, 46, 72]).map((height, index) => <div className="flex flex-1 flex-col items-center gap-2" key={index}><div className="w-full max-w-8 rounded-t-md bg-[#20212a] transition-all" style={{ height: `${height}%` }} /><span className="text-[9px] text-[#a6a7b0]">{String(index + 1).padStart(2, "0")}</span></div>)}</div></Surface><Surface className="mt-6"><h2 className="text-xl font-bold">Historico</h2><p className="mt-1 text-xs text-[#9a9ba6]">Transacoes e atividades recentes</p><div className="mt-5 space-y-1">{payments.length === 0 ? <Empty text="Suas cobrancas aparecerao aqui." /> : payments.slice(0, 5).map((payment) => <div className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-xl px-3 py-3 hover:bg-[#f7f7fb]" key={payment.id}><span className="grid h-8 w-8 place-items-center rounded-full bg-[#efeefa] text-xs">$</span><div><p className="text-sm font-medium">{payment.description}</p><p className="text-xs text-[#a0a1aa]">{payment.clientName} · {formatDate(payment.dueDate)}</p></div><p className="text-sm font-semibold">{money.format(payment.amount)}</p></div>)}</div></Surface></div><aside className="space-y-6"><section className="rounded-3xl bg-[#24242b] p-6 text-white shadow-xl shadow-[#24242b]/15"><p className="text-xs text-white/55">RECEITA RECORRENTE</p><p className="mt-8 text-2xl font-semibold">{money.format(metrics.monthly)}</p><p className="mt-2 text-xs text-white/55">Manutencoes mensais ativas</p><div className="mt-8 flex items-center justify-between border-t border-white/10 pt-4 text-xs text-white/65"><span>Kevo Studio</span><span>•••• 2026</span></div></section><section><h2 className="text-lg font-bold">Atividades recentes</h2><div className="mt-4 space-y-4">{projects.slice(0, 4).map((project, index) => <div className="flex items-center justify-between" key={project.id}><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-xs shadow-sm">{["◌", "▤", "↗", "◇"][index % 4]}</span><div><p className="text-xs font-semibold">{project.name}</p><p className="text-[11px] text-[#9b9ca6]">{project.clientName}</p></div></div><span className="text-xs font-semibold">{project.totalValue ? money.format(project.totalValue) : "-"}</span></div>)}{projects.length === 0 ? <Empty text="Sem atividades ainda." /> : null}</div></section><section><h2 className="text-lg font-bold">Proximos pagamentos</h2><div className="mt-4 space-y-3">{payments.filter((payment) => payment.status !== "PAID").slice(0, 3).map((payment) => <div className="flex justify-between rounded-2xl bg-white px-4 py-3 shadow-sm" key={payment.id}><div><p className="text-xs font-semibold">{payment.description}</p><p className="mt-1 text-[11px] text-[#a1a2ab]">{formatDate(payment.dueDate)}</p></div><b className="text-sm">{money.format(payment.amount)}</b></div>)}</div></section></aside></section>; }

function SalesOverview({ clients, projects, payments, rooms, metrics }: { clients: Client[]; projects: Project[]; payments: Payment[]; rooms: Room[]; metrics: { openProjects: number; pending: number; monthly: number } }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const belongsToSelectedMonth = (date: string | null | undefined) => Boolean(date && date.slice(0, 7) === selectedMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${selectedMonth}-01T12:00:00`));
  const recordedReceived = payments.filter((payment) => payment.status === "PAID" && belongsToSelectedMonth(payment.dueDate)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const projectsWithPayments = new Set(payments.map((payment) => payment.projectId));
  const deliveredWithoutPaymentRecord = projects
    .filter((project) => project.status === "DELIVERED" && !projectsWithPayments.has(project.id) && belongsToSelectedMonth(project.deliveryDate ?? project.startDate ?? project.createdAt))
    .reduce((sum, project) => sum + Number(project.totalValue ?? 0), 0);
  const received = recordedReceived + deliveredWithoutPaymentRecord;
  const pendingForSelectedMonth = payments.filter((payment) => payment.status !== "PAID" && payment.status !== "CANCELLED" && belongsToSelectedMonth(payment.dueDate)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const roomsInSelectedMonth = rooms.filter((room) => belongsToSelectedMonth(room.createdAt));
  const soldProjects = projects.filter((project) => !["LEAD", "CANCELLED"].includes(project.status));
  const totalSold = soldProjects.reduce((sum, project) => sum + Number(project.totalValue ?? 0), 0);
  metrics = { ...metrics, pending: pendingForSelectedMonth };
  const projectStages = [
    { label: "Proposta", statuses: ["LEAD"] as ProjectStatus[] },
    { label: "Planejamento", statuses: ["PLANNING"] as ProjectStatus[] },
    { label: "Design", statuses: ["DESIGN"] as ProjectStatus[] },
    { label: "Desenvolvimento", statuses: ["DEVELOPMENT"] as ProjectStatus[] },
    { label: "Revisão", statuses: ["REVIEW"] as ProjectStatus[] },
    { label: "Entregue", statuses: ["DELIVERED"] as ProjectStatus[] },
  ];
  const stageCounts = projectStages.map((stage) => projects.filter((project) => stage.statuses.includes(project.status)).length);
  const maxStage = Math.max(...stageCounts, 1);
  const recentPayments = [...payments].filter((payment) => belongsToSelectedMonth(payment.dueDate)).sort((first, second) => second.dueDate.localeCompare(first.dueDate)).slice(0, 5);
  const chartMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${selectedMonth}-01T12:00:00`);
    date.setMonth(date.getMonth() - (5 - index));
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const monthKey = `${year}-${month}`;
    return {
      key: monthKey,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
      value: payments.filter((payment) => payment.dueDate.startsWith(monthKey)).reduce((sum, payment) => sum + Number(payment.amount), 0),
    };
  });
  const maxBar = Math.max(...chartMonths.map((month) => month.value), 1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchResults = useMemo<DashboardSearchResult[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
    if (!query) return [];
    const matches = (value: string | null | undefined) => value?.toLocaleLowerCase("pt-BR").includes(query);
    return [
      ...clients.filter((client) => matches(client.name) || matches(client.companyName) || matches(client.email)).map((client) => ({ id: `client-${client.id}`, title: client.name, subtitle: client.companyName || client.email || "Cliente", category: "Cliente" as const, href: "/dashboard/clients" })),
      ...projects.filter((project) => matches(project.name) || matches(project.clientName) || matches(project.status)).map((project) => ({ id: `project-${project.id}`, title: project.name, subtitle: project.clientName, category: "Projeto" as const, href: "/dashboard/projects" })),
      ...payments.filter((payment) => matches(payment.description) || matches(payment.clientName) || matches(payment.projectName)).map((payment) => ({ id: `payment-${payment.id}`, title: payment.description, subtitle: `${payment.clientName} · ${money.format(payment.amount)}`, category: "Cobrança" as const, href: "/dashboard/finance" })),
      ...rooms.filter((room) => matches(room.title) || matches(room.slug)).map((room) => ({ id: `room-${room.id}`, title: room.title, subtitle: `Sala ${room.slug}`, category: "Sala" as const, href: "/dashboard/rooms" })),
    ].slice(0, 8);
  }, [clients, payments, projects, rooms, searchQuery]);

  return (
    <section className="mt-0 rounded-[30px] bg-white p-4 shadow-[0_22px_55px_rgba(63,55,44,0.08)] sm:p-6">
      <header className="relative mb-7 border-b border-[#efefed] bg-white px-1 pb-5">
        <div className="flex items-center justify-between gap-4">
          <button className="flex items-center gap-2 rounded-full bg-[#f4f4f2] px-3 py-2 text-[10px] text-[#8b8882] transition hover:bg-[#ecece8]" onClick={() => setSearchOpen(true)} type="button"><span className="text-base leading-none">⌕</span><span>Buscar análises e clientes</span></button>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#ffd84f] text-xs font-bold text-[#25262c]">AR</span>
        </div>
        <div className="hidden flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 rounded-full bg-[#f4f4f2] px-3 py-2 text-[10px] text-[#8b8882]"><span className="text-base leading-none">⌕</span><span>Buscar análises e clientes</span></div>
          <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f4f2] text-sm text-[#53515b]">♧</span><span className="hidden text-[11px] text-[#88857e] sm:block">Notificações</span><span className="grid h-9 w-9 place-items-center rounded-full bg-[#ffd84f] text-xs font-bold text-[#25262c]">AR</span></div>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-semibold leading-[1.04] tracking-[-0.05em] text-[#202126] sm:text-4xl">Análise<br />financeira</h1></div>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#f1f1f0] px-4 py-2.5 text-xs font-medium text-[#62605b]">▣&nbsp; Últimos 30 dias&nbsp;⌄</span><span className="rounded-full bg-[#f1f1f0] px-4 py-2.5 text-xs font-medium text-[#62605b]">◌&nbsp; Projetos&nbsp;⌄</span><span className="rounded-full bg-[#191a1e] px-4 py-2.5 text-xs font-semibold text-white">Resumo atual ↗</span></div>
        </div>
        <div className="absolute right-0 top-[78px]"><DashboardMonthFilter value={selectedMonth} onChange={setSelectedMonth} /></div>
      </header>
      {searchOpen ? <DashboardSearchModal query={searchQuery} results={searchResults} onChange={setSearchQuery} onClose={() => { setSearchOpen(false); setSearchQuery(""); }} /> : null}
      <div className="hidden mb-5 flex flex-wrap items-center justify-between gap-3 px-1">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8f8b83]">Visão financeira</p><p className="mt-1 text-sm text-[#77736c]">Resumo do seu estúdio neste momento.</p></div>
        <span className="rounded-full bg-[#f0efeb] px-3 py-2 text-xs font-medium text-[#5f5d58]">Dados atualizados</span>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <MetricTile dark label="Disponível para receber" value={money.format(metrics.pending)} detail="Cobranças abertas" />
        <MetricTile label="Receita recebida" value={money.format(received)} detail={deliveredWithoutPaymentRecord > 0 ? "Inclui projetos entregues" : "Pagamentos registrados"} />
        <MetricTile label="Reuniões criadas" value={String(roomsInSelectedMonth.length)} detail={`Apresentações criadas em ${monthLabel}`} />
        <MetricTile label="Total vendido" value={money.format(totalSold)} detail={`${soldProjects.length} projeto(s) contratado(s)`} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.08fr_1fr]">
        <section className="rounded-[24px] bg-[#f1f1f0] p-5">
          <div className="flex items-start justify-between"><div><h2 className="text-base font-semibold tracking-tight">Fluxo financeiro</h2><p className="mt-1 text-xs text-[#77746e]">Valores previstos por mês</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#6d6962]">Semestral</span></div>
          <div className="mt-7 flex h-48 items-end justify-between gap-3 px-1">
            {chartMonths.map((month, index) => <div className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2" key={month.key}><div className="pointer-events-none absolute bottom-[calc(100%+8px)] z-10 whitespace-nowrap rounded-lg bg-[#202126] px-2.5 py-1.5 text-[10px] font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">{month.label} · {money.format(month.value)}</div><div className={`w-full max-w-12 cursor-default rounded-t-[14px] transition-all duration-200 group-hover:brightness-95 ${index === chartMonths.length - 1 ? "bg-[#5ae04f]" : "bg-[#dcdcdc]"}`} style={{ height: `${Math.max(16, Math.round(month.value / maxBar * 100))}%` }} /><span className={`text-[10px] capitalize ${index === chartMonths.length - 1 ? "font-bold text-[#54bd4b]" : "text-[#8a8781]"}`}>{month.label}</span></div>)}
          </div>
        </section>

        <section className="rounded-[24px] bg-[#f1f1f0] p-5">
          <div className="flex items-start justify-between"><div><h2 className="text-base font-semibold tracking-tight">Etapas dos projetos</h2><p className="mt-1 text-xs text-[#77746e]">Distribuição da sua carteira</p></div><span className="rounded-full bg-white px-3 py-1.5 text-[10px] font-semibold text-[#6d6962]">{projects.length} projetos</span></div>
          <div className="mt-5 space-y-2.5">
            {projectStages.map((stage, index) => <div className="grid grid-cols-[120px_1fr_28px] items-center gap-3" key={stage.label}><span className="text-xs text-[#5d5a55]">{stage.label}</span><div className="h-7 rounded-xl bg-[#dbdbdb] p-1"><div className={`h-full rounded-[9px] ${index === 3 ? "bg-[#5ae04f]" : index === 5 ? "bg-[#202126]" : "bg-[#b9b9b9]"}`} style={{ width: `${Math.max(stageCounts[index] ? 24 : 0, Math.round(stageCounts[index] / maxStage * 100))}%` }} /></div><span className="text-right text-xs font-semibold text-[#46443f]">{stageCounts[index]}</span></div>)}
          </div>
        </section>
      </div>

      <section className="mt-3 overflow-hidden rounded-[24px] border border-[#efede8] bg-white">
        <div className="flex items-center justify-between px-5 py-4"><div><h2 className="text-base font-semibold tracking-tight">Cobranças recentes</h2><p className="mt-1 text-xs text-[#85817a]">{recentPayments.length} registro(s) financeiro(s) em {monthLabel}</p></div><span className="rounded-full bg-[#f4f3ef] px-3 py-1.5 text-[10px] font-semibold text-[#68645e]">Período</span></div>
        <div className="border-t border-[#f0eeea]">
          {recentPayments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[#98948d]">As cobranças aparecerão aqui quando você cadastrá-las.</p> : recentPayments.map((payment) => <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#f1efeb] px-5 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1fr)_150px_120px]" key={payment.id}><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#282930]">{payment.description}</p><p className="mt-1 truncate text-xs text-[#8c8881]">{payment.clientName} · vencimento {formatDate(payment.dueDate)}</p></div><span className="hidden text-xs text-[#89857e] sm:block">{paymentStatuses[payment.status]}</span><b className="text-right text-sm text-[#292a30]">{money.format(payment.amount)}</b></div>)}
        </div>
      </section>
    </section>
  );
}

function DashboardMonthFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  return <div className="flex items-center gap-2 rounded-full bg-[#f1f1f0] px-3 py-2 text-xs text-[#625f59]"><span className="hidden sm:inline">Período</span><input aria-label="Filtrar por mês" className="min-w-0 bg-transparent text-xs font-medium outline-none" onChange={(event) => onChange(event.target.value)} type="month" value={value} /><button className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold transition hover:bg-[#e4e4e1]" onClick={() => onChange(currentMonth)} type="button">Mês atual</button></div>;
}

function DashboardSearchModal({ query, results, onChange, onClose }: { query: string; results: DashboardSearchResult[]; onChange: (value: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-[#17181b]/35 p-5 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Buscar no sistema">
      <div className="dashboard-search-modal w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_rgba(20,20,24,0.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-[#efeeeb] px-5 py-4"><span className="text-xl text-[#6b6862]">⌕</span><input autoFocus className="min-w-0 flex-1 bg-transparent text-base text-[#24252b] outline-none placeholder:text-[#aaa69f]" onChange={(event) => onChange(event.target.value)} placeholder="Buscar clientes, projetos, cobranças ou salas..." value={query} /><button aria-label="Fechar busca" className="grid h-8 w-8 place-items-center rounded-full bg-[#f3f2ef] text-lg text-[#6f6c65] transition hover:bg-[#e7e5df]" onClick={onClose} type="button">×</button></div>
        <div className="modal-scrollbar max-h-[60vh] overflow-y-auto p-3">
          {!query ? <p className="px-3 py-10 text-center text-sm text-[#98948d]">Digite para buscar em todo o seu estúdio.</p> : null}
          {query && results.length === 0 ? <p className="px-3 py-10 text-center text-sm text-[#98948d]">Nenhum resultado encontrado para “{query}”.</p> : null}
          {results.map((result, index) => <Link className="dashboard-search-result flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-[#f5f4f1]" href={result.href} key={result.id} onClick={onClose} style={{ animationDelay: `${index * 35}ms` }}><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#efeee9] text-xs font-bold text-[#44434a]">{result.category.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#25262c]">{result.title}</p><p className="mt-0.5 truncate text-xs text-[#8b877f]">{result.subtitle}</p></div><span className="rounded-full bg-[#f1f0ed] px-2.5 py-1 text-[10px] font-medium text-[#6f6b64]">{result.category}</span></Link>)}
        </div>
      </div>
    </div>
  );
}

function MetricTile({ dark = false, label, value, detail }: { dark?: boolean; label: string; value: string; detail: string }) {
  return <section className={`rounded-[24px] p-5 ${dark ? "bg-[#111214] text-white" : "bg-[#f1f1f0] text-[#202126]"}`}><div className="flex items-start justify-between"><p className={`text-xs ${dark ? "text-white/65" : "text-[#76736d]"}`}>{label}</p><span className={`grid h-7 w-7 place-items-center rounded-full text-sm ${dark ? "bg-white text-black" : "bg-white text-[#6e6b65]"}`}>↗</span></div><p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p><p className={`mt-1 text-[11px] ${dark ? "text-white/55" : "text-[#85817b]"}`}>{detail}</p></section>;
}

function Overview({ clients, projects, payments, rooms, metrics }: { clients: Client[]; projects: Project[]; payments: Payment[]; rooms: Room[]; metrics: { openProjects: number; pending: number; monthly: number } }) {
  const calendarDays = Array.from({ length: 30 }, (_, index) => index + 1);
  const scheduledDays = new Set(payments.filter((payment) => ["PENDING", "OVERDUE"].includes(payment.status)).map((payment) => new Date(`${payment.dueDate}T12:00:00Z`).getUTCDate()));
  const completed = projects.filter((project) => project.status === "DELIVERED").length;
  const completion = projects.length ? Math.round(completed / projects.length * 100) : 0;

  return <section className="dashboard-panel-enter mt-7 rounded-[30px] bg-[#f8f5f0] p-5 shadow-[0_22px_60px_rgba(63,55,44,0.1)] sm:p-7"><div className="grid gap-5 xl:grid-cols-[1.55fr_.9fr]"><div className="space-y-5"><section className="relative min-h-[230px] overflow-hidden rounded-[26px] bg-[#d6cfbd] p-6"><div className="relative z-10"><p className="text-sm font-bold leading-5">Seu painel<br />de hoje</p><div className="mt-16 space-y-2 text-xs text-[#5b5a55]"><p><span className="mr-2 inline-block h-2 w-8 rounded-full bg-[#ffca26]" />A receber</p><p><span className="mr-2 inline-block h-2 w-8 rounded-full bg-[#ff7168]" />Projetos ativos</p><p><span className="mr-2 inline-block h-2 w-8 rounded-full bg-[#2b2d35]" />Salas criadas</p></div></div><div className="absolute left-[37%] top-12 grid h-24 w-24 place-items-center rounded-full bg-[#2b2d35] text-center text-xs text-white shadow-xl"><b className="block text-lg">{metrics.openProjects}</b>projetos</div><div className="absolute right-[17%] top-8 grid h-40 w-40 place-items-center rounded-full bg-[#ffd84f] text-center text-xs shadow-[0_0_35px_rgba(255,216,79,.45)]"><div><b className="block text-lg">{money.format(metrics.pending)}</b>a receber</div></div><div className="absolute bottom-5 left-[39%] grid h-24 w-24 place-items-center rounded-full bg-[#ff746e] text-center text-xs shadow-xl"><div><b className="block text-lg">{clients.length}</b>clientes</div></div></section><div className="grid gap-5 sm:grid-cols-[.82fr_1.18fr]"><section className="rounded-[26px] bg-white p-5"><p className="text-sm font-bold">Meta de projetos</p><p className="mt-1 text-xs text-[#85837d]">Acompanhe suas entregas</p><div className="mt-4 flex items-center justify-between"><div><p className="text-xs text-[#8f8d88]">Concluidos</p><p className="mt-1 text-2xl font-bold">{completed}<span className="text-sm text-[#8f8d88]">/{projects.length}</span></p></div><div className="grid h-20 w-20 place-items-center rounded-full border-[7px] border-[#ff735f] border-r-[#ebe9e5] text-sm font-bold">{completion}%</div></div><p className="mt-3 text-xs font-medium">Ver projetos <span className="ml-1 inline-grid h-5 w-5 place-items-center rounded-full bg-[#292b34] text-white">→</span></p></section><section className="rounded-[26px] bg-white p-5"><div className="flex justify-between"><div><p className="text-sm font-bold">Carteira de clientes</p><p className="mt-1 text-xs text-[#85837d]">Relacoes em andamento</p></div><span className="text-xs font-semibold">Adicionar novo&nbsp; <b className="rounded-full bg-[#292b34] px-1.5 py-0.5 text-white">+</b></span></div><div className="mt-4 space-y-2">{clients.slice(0, 3).map((client, index) => <div className="flex items-center gap-3 rounded-xl bg-[#f0ece4] px-3 py-2" key={client.id}><span className="grid h-7 w-7 place-items-center rounded-full bg-[#d0c8b9] text-xs font-bold">{client.name.slice(0, 1)}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{client.name}</p><p className="truncate text-[10px] text-[#8b8984]">{client.companyName || "Cliente ativo"}</p></div><span className="text-[10px] text-[#7d7a74]">{projects.filter((project) => project.clientId === client.id).length} projeto(s)</span></div>)}{clients.length === 0 ? <p className="py-5 text-center text-xs text-[#99958e]">Cadastre clientes para preencher sua carteira.</p> : null}</div></section></div></div><aside className="rounded-[26px] bg-[#272931] p-6 text-white"><div className="flex items-center justify-between"><p className="text-sm font-bold">Agenda financeira</p><span className="text-xs text-white/55">Julho</span></div><div className="mt-6 grid grid-cols-7 gap-y-3 text-center text-[10px] text-white/50">{["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}{calendarDays.map((day) => <span className={`mx-auto grid h-7 w-7 place-items-center rounded-full ${scheduledDays.has(day) ? "bg-[#ffd327] text-[#1f2027]" : day === new Date().getDate() ? "border border-white/30 text-white" : "text-white/70"}`} key={day}>{day}</span>)}</div><div className="mt-7 flex flex-wrap gap-3 text-[10px] text-white/65"><span>● Hoje</span><span className="text-[#ffd327]">● Vencimento</span><span>● Pendente</span></div></aside></div><div className="mt-5 grid gap-5 xl:grid-cols-[.82fr_1.18fr]"><section className="rounded-[26px] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-bold">Receita recorrente</p><p className="mt-1 text-xs text-[#85837d]">Manutencoes mensais</p></div><b className="text-sm">{money.format(metrics.monthly)}</b></div><div className="mt-8 h-2 rounded-full bg-[#e4e0d9]"><div className="h-2 w-[68%] rounded-full bg-[#292b34]" /></div><div className="mt-2 flex justify-between text-[10px] text-[#8a8882]"><span>Projetos</span><span>Meta mensal</span></div></section><section className="rounded-[26px] bg-white p-5"><p className="text-sm font-bold">Atividades recentes</p><div className="mt-3 space-y-2">{payments.slice(0, 3).map((payment, index) => <div className="flex items-center gap-3 rounded-xl bg-[#f0ece4] px-3 py-2" key={payment.id}><span className="grid h-7 w-7 place-items-center rounded-full bg-[#d8d0c1] text-xs">{["$", "↗", "◉"][index]}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{payment.description}</p><p className="text-[10px] text-[#85837d]">{payment.clientName}</p></div><b className="text-xs">{money.format(payment.amount)}</b></div>)}{payments.length === 0 ? <p className="py-4 text-center text-xs text-[#99958e]">As atividades aparecerao aqui.</p> : null}</div></section></div></section>;
}

function ClientsPage({ clients, projects, onSubmit, onUpdate, onDelete, deletingId, name, company, email, setName, setCompany, setEmail, saving }: { clients: Client[]; projects: Project[]; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>; onUpdate: (clientId: string) => Promise<boolean>; onDelete: (client: Client) => void; deletingId: string | null; name: string; company: string; email: string; setName: (value: string) => void; setCompany: (value: string) => void; setEmail: (value: string) => void; saving: boolean }) {
  const [isModalMounted, setIsModalMounted] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const linkedProjects = viewingClient ? projects.filter((project) => project.clientId === viewingClient.id) : [];

  function openModal() { setIsModalMounted(true); window.requestAnimationFrame(() => setIsModalVisible(true)); }
  function openCreateModal() { setEditingClient(null); setName(""); setCompany(""); setEmail(""); openModal(); }
  function openEditModal(client: Client) { setEditingClient(client); setName(client.name); setCompany(client.companyName ?? ""); setEmail(client.email ?? ""); openModal(); }
  function closeModal() { setIsModalVisible(false); window.setTimeout(() => { setIsModalMounted(false); setEditingClient(null); }, 220); }

  async function submitClient(event: FormEvent<HTMLFormElement>) {
    if (editingClient) event.preventDefault();
    const completed = editingClient ? await onUpdate(editingClient.id) : await onSubmit(event);
    if (completed) closeModal();
  }

  return (
    <section className="mt-7">
      <Surface>
        <div className="flex items-center justify-between"><Label>Carteira de clientes</Label><div className="flex items-center gap-3"><span className="rounded-full bg-[#f0ece4] px-3 py-1 text-xs font-semibold text-[#6d685f]">{clients.length} {clients.length === 1 ? "cliente" : "clientes"}</span><button className="rounded-xl bg-[#242630] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#353742]" onClick={openCreateModal} type="button">Novo cliente</button></div></div>
        {clients.length === 0 ? <ClientOnboarding onCreate={openCreateModal} /> : <div className="mt-5 min-h-[410px] rounded-2xl border border-[#e8e5df] bg-[#faf9f6] p-3"><div className="grid grid-cols-[minmax(0,1fr)_150px_245px] px-4 pb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#989188]"><span>Cliente</span><span>Projetos</span><span className="text-right">Acoes</span></div><div className="space-y-2">{clients.map((client) => { const projectCount = projects.filter((project) => project.clientId === client.id).length; return <article className="grid grid-cols-[minmax(0,1fr)_150px_245px] items-center rounded-2xl bg-white px-4 py-4 shadow-[0_5px_18px_rgba(63,55,44,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(63,55,44,0.08)]" key={client.id}><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8e0d2] text-sm font-bold text-[#5e594f]">{client.name.slice(0, 1)}</span><div className="min-w-0"><p className="truncate font-semibold text-[#242630]">{client.name}</p><p className="mt-1 truncate text-sm text-[#938d84]">{client.companyName || client.email || "Sem dados complementares"}</p></div></div><button className="justify-self-start rounded-xl bg-[#f1f0fa] px-3 py-2 text-xs font-medium text-[#65616f] transition hover:bg-[#e7e5f2]" onClick={() => setViewingClient(client)} type="button">Ver {projectCount} {projectCount === 1 ? "projeto" : "projetos"}</button><div className="flex justify-end gap-2"><button className="rounded-xl bg-[#edf1fb] px-3 py-2 text-xs font-medium text-[#40507b] transition hover:bg-[#dfe6f7]" onClick={() => openEditModal(client)} type="button">Editar</button><button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50" disabled={deletingId === client.id} onClick={() => onDelete(client)} type="button">{deletingId === client.id ? "Apagando..." : "Apagar"}</button></div></article>; })}</div></div>}
      </Surface>

      {isModalMounted ? <div className={`fixed inset-0 z-50 grid place-items-center p-5 transition-opacity duration-200 ${isModalVisible ? "bg-[#161719]/45 opacity-100" : "bg-[#161719]/0 opacity-0"}`} onClick={closeModal} role="dialog" aria-modal="true"><div className={`w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl transition-all duration-200 ${isModalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"}`} onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">{editingClient ? "Editar cliente" : "Novo cliente"}</p><p className="mt-1 text-sm text-[#88837b]">{editingClient ? "Atualize os dados da sua carteira." : "Adicione os dados principais da sua carteira."}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={closeModal} type="button">×</button></div><form className="mt-6 space-y-3" onSubmit={submitClient}><Input autoFocus placeholder="Nome do cliente *" value={name} onChange={setName} required /><Input placeholder="Empresa" value={company} onChange={setCompany} /><Input placeholder="E-mail" type="email" value={email} onChange={setEmail} /><Button loading={saving}>{editingClient ? "Salvar alteracoes" : "Cadastrar cliente"}</Button></form></div></div> : null}

      {viewingClient ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#161719]/45 p-5" onClick={() => setViewingClient(null)} role="dialog" aria-modal="true"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">Projetos de {viewingClient.name}</p><p className="mt-1 text-sm text-[#88837b]">{linkedProjects.length} {linkedProjects.length === 1 ? "projeto vinculado" : "projetos vinculados"}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={() => setViewingClient(null)} type="button">×</button></div><div className="mt-6 space-y-3">{linkedProjects.length === 0 ? <Empty text="Este cliente ainda não possui projetos vinculados." /> : linkedProjects.map((project) => <article className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f2ec] px-5 py-4" key={project.id}><div><p className="font-semibold">{project.name}</p><p className="mt-1 text-sm text-[#817c73]">{projectTypes[project.projectType]} · {projectStatuses[project.status]}</p></div><b className="text-sm">{project.totalValue ? money.format(project.totalValue) : "Sem valor"}</b></article>)}</div></div></div> : null}
    </section>
  );
}

function ClientOnboarding({ onCreate }: { onCreate: () => void }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-[#d9d3c7] bg-[#fbfaf7] p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#242630] text-xl text-white">♙</span><div><p className="font-semibold text-[#292824]">Comece sua carteira de clientes</p><p className="mt-1 text-sm text-[#858077]">Cadastre o primeiro cliente para acompanhar projetos, contratos e pagamentos em um só lugar.</p><button className="mt-4 rounded-xl bg-[#242630] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#353742]" onClick={onCreate} type="button">Cadastrar primeiro cliente</button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><OnboardingStep number="1" title="Cliente" text="Cadastre os dados básicos." /><OnboardingStep number="2" title="Projeto" text="Defina escopo e etapas." /><OnboardingStep number="3" title="Cobrança" text="Registre valores e prazos." /></div></div>;
}

function OnboardingStep({ number, title, text }: { number: string; title: string; text: string }) { return <div className="rounded-xl bg-white p-4 shadow-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8e1d5] text-xs font-bold text-[#4d4942]">{number}</span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-[#8b877e]">{text}</p></div>; }

function ProjectsPageV2(props: { clients: Client[]; projects: Project[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUpdated: (project: Project) => void; onDelete: (project: Project) => void; deletingId: string | null; selectedClientId: string; setSelectedClientId: (value: string) => void; projectName: string; setProjectName: (value: string) => void; projectType: ProjectType; setProjectType: (value: ProjectType) => void; projectStatus: ProjectStatus; setProjectStatus: (value: ProjectStatus) => void; contractStatus: ContractStatus; setContractStatus: (value: ContractStatus) => void; projectValue: string; setProjectValue: (value: string) => void; maintenanceActive: boolean; setMaintenanceActive: (value: boolean) => void; maintenanceValue: string; setMaintenanceValue: (value: string) => void; saving: boolean }) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[380px_1fr]">
      <Surface>
        <Label>Novo projeto</Label>
        <form className="mt-5 space-y-3" onSubmit={props.onSubmit}>
          <Select required value={props.selectedClientId} onChange={props.setSelectedClientId}><option value="">Cliente *</option>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select>
          <Input placeholder="Nome do projeto *" required value={props.projectName} onChange={props.setProjectName} />
          <div className="grid grid-cols-2 gap-3"><Select value={props.projectType} onChange={(value) => props.setProjectType(value as ProjectType)}>{Object.entries(projectTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={props.projectStatus} onChange={(value) => props.setProjectStatus(value as ProjectStatus)}>{Object.entries(projectStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
          <Input min="0" onChange={props.setProjectValue} placeholder="Valor total (R$)" step="0.01" type="number" value={props.projectValue} />
          <div className="grid grid-cols-2 gap-3"><BrazilianDateField initialValue={new Date().toISOString().slice(0, 10)} label="Data de início" name="startDate" required /><BrazilianDateField label="Previsão de entrega" name="deliveryDate" required /></div>
          <label className="block text-xs font-semibold text-[#666770]">Forma de pagamento<select className="mt-1.5 w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" defaultValue="2" name="installmentCount"><option value="1">À vista — 100% em uma cobrança</option><option value="2">2 parcelas — 50% entrada + 50% final</option></select></label>
          <p className="rounded-xl bg-[#f4f1ea] px-3 py-2 text-xs leading-5 text-[#777168]">Ao salvar, as cobranças serão criadas automaticamente. Você poderá marcá-las como pagas em Financeiro.</p>
          <Select value={props.contractStatus} onChange={(value) => props.setContractStatus(value as ContractStatus)}>{Object.entries(contractStatuses).map(([value, label]) => <option key={value} value={value}>Contrato: {label}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm text-[#73747e]"><input checked={props.maintenanceActive} onChange={(event) => props.setMaintenanceActive(event.target.checked)} type="checkbox" />Possui manutenção mensal</label>
          {props.maintenanceActive ? <Input placeholder="Mensalidade (R$)" type="number" value={props.maintenanceValue} onChange={props.setMaintenanceValue} /> : null}
          <Button disabled={!props.clients.length} loading={props.saving}>Criar projeto e cobranças</Button>
        </form>
      </Surface>
      <Surface>
        <div className="flex items-center justify-between"><Label>Projetos</Label><span className="rounded-full bg-[#f0efeb] px-3 py-1 text-xs text-[#6d6962]">{props.projects.length} total</span></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {props.projects.length === 0 ? <Empty text="Nenhum projeto cadastrado." /> : props.projects.map((project) => <article className="rounded-2xl border border-[#eceaf0] bg-[#fafafd] p-5" key={project.id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{project.name}</p><p className="mt-1 text-sm text-[#999aa5]">{project.clientName}</p></div><span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#ece9e1] px-3 py-1.5 text-xs font-medium leading-none text-[#5f5a51]">{projectStatuses[project.status]}</span></div><div className="mt-5 flex items-center justify-between border-t border-[#e8e8ef] pt-4 text-xs text-[#8f909a]"><span>{projectTypes[project.projectType]}</span><b>{project.totalValue ? money.format(project.totalValue) : "Sem valor"}</b></div><div className="mt-4 grid grid-cols-2 gap-2"><button className="rounded-xl border border-[#dce0ea] bg-white px-3 py-2 text-sm font-semibold text-[#40507b] transition hover:bg-[#edf1fb]" onClick={() => setEditingProject(project)} type="button">Editar</button><button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={props.deletingId === project.id} onClick={() => props.onDelete(project)} type="button">{props.deletingId === project.id ? "Apagando..." : "Apagar"}</button></div></article>)}
        </div>
      </Surface>
      {editingProject ? <ProjectEditModalV3 project={editingProject} onClose={() => setEditingProject(null)} onUpdated={props.onUpdated} /> : null}
    </section>
  );
}

function ProjectsPage(props: { clients: Client[]; projects: Project[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUpdated: (project: Project) => void; selectedClientId: string; setSelectedClientId: (value: string) => void; projectName: string; setProjectName: (value: string) => void; projectType: ProjectType; setProjectType: (value: ProjectType) => void; projectStatus: ProjectStatus; setProjectStatus: (value: ProjectStatus) => void; contractStatus: ContractStatus; setContractStatus: (value: ContractStatus) => void; projectValue: string; setProjectValue: (value: string) => void; maintenanceActive: boolean; setMaintenanceActive: (value: boolean) => void; maintenanceValue: string; setMaintenanceValue: (value: string) => void; saving: boolean }) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  return <section className="mt-7 grid gap-6 xl:grid-cols-[360px_1fr]"><Surface><Label>Novo projeto</Label><form className="mt-5 space-y-3" onSubmit={props.onSubmit}><Select value={props.selectedClientId} onChange={props.setSelectedClientId} required><option value="">Cliente *</option>{props.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</Select><Input placeholder="Nome do projeto *" value={props.projectName} onChange={props.setProjectName} required /><div className="grid grid-cols-2 gap-3"><Select value={props.projectType} onChange={(value) => props.setProjectType(value as ProjectType)}>{Object.entries(projectTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={props.projectStatus} onChange={(value) => props.setProjectStatus(value as ProjectStatus)}>{Object.entries(projectStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><Input placeholder="Valor (R$)" type="number" min="0" step="0.01" value={props.projectValue} onChange={props.setProjectValue} /><Select value={props.contractStatus} onChange={(value) => props.setContractStatus(value as ContractStatus)}>{Object.entries(contractStatuses).map(([value, label]) => <option key={value} value={value}>Contrato: {label}</option>)}</Select><label className="flex items-center gap-2 text-sm text-[#73747e]"><input checked={props.maintenanceActive} onChange={(event) => props.setMaintenanceActive(event.target.checked)} type="checkbox" />Possui manutencao mensal</label>{props.maintenanceActive ? <Input placeholder="Mensalidade (R$)" type="number" value={props.maintenanceValue} onChange={props.setMaintenanceValue} /> : null}<Button disabled={!props.clients.length} loading={props.saving}>Criar projeto</Button></form></Surface><Surface><Label>Projetos</Label><div className="mt-5 grid gap-4 md:grid-cols-2">{props.projects.length === 0 ? <Empty text="Nenhum projeto cadastrado." /> : props.projects.map((project) => <article className="rounded-2xl bg-[#f7f7fb] p-5" key={project.id}><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{project.name}</p><p className="mt-1 text-sm text-[#999aa5]">{project.clientName}</p></div><span className="inline-flex shrink-0 whitespace-nowrap rounded-full bg-[#ece9e1] px-3 py-1.5 text-xs font-medium leading-none text-[#5f5a51]">{projectStatuses[project.status]}</span></div><div className="mt-5 flex items-center justify-between border-t border-[#e8e8ef] pt-4 text-xs text-[#8f909a]"><span>{projectTypes[project.projectType]}</span><b>{project.totalValue ? money.format(project.totalValue) : "Sem valor"}</b></div><button className="mt-4 w-full rounded-xl border border-[#dce0ea] bg-white px-3 py-2 text-sm font-semibold text-[#40507b] transition hover:bg-[#edf1fb]" onClick={() => setEditingProject(project)} type="button">Editar projeto</button></article>)}</div></Surface>{editingProject ? <ProjectEditModal project={editingProject} onClose={() => setEditingProject(null)} onUpdated={props.onUpdated} /> : null}</section>;
}

function ProjectEditModalV2({ project, onClose, onUpdated }: { project: Project; onClose: () => void; onUpdated: (project: Project) => void }) {
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
  const [error, setError] = useState<string | null>(null);

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
      setError(message(cause, "Não foi possível atualizar o projeto."));
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#161719]/45 p-5" onClick={onClose} role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">Editar projeto</p><p className="mt-1 text-sm text-[#88837b]">Cliente: {project.clientName}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={onClose} type="button">×</button></div>{error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}<form className="mt-6 space-y-4" onSubmit={save}><Input placeholder="Nome do projeto" value={name} onChange={setName} required /><div className="grid gap-3 sm:grid-cols-2"><Select value={projectType} onChange={(value) => setProjectType(value as ProjectType)}>{Object.entries(projectTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={status} onChange={(value) => setStatus(value as ProjectStatus)}>{Object.entries(projectStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><textarea className="min-h-24 w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" placeholder="Escopo do projeto" value={scope} onChange={(event) => setScope(event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Valor (R$)" type="number" min="0" step="0.01" value={totalValue} onChange={setTotalValue} /><Select value={contractStatus} onChange={(value) => setContractStatus(value as ContractStatus)}>{Object.entries(contractStatuses).map(([value, label]) => <option key={value} value={value}>Contrato: {label}</option>)}</Select></div><label className="block rounded-2xl border border-dashed border-[#cfcac0] bg-[#faf9f6] p-4 text-sm text-[#4e4d52]"><span className="font-semibold">Contrato em PDF</span><span className="mt-1 block text-xs text-[#878179]">Anexe o contrato assinado ou a minuta. Máximo de 10 MB.</span><input accept="application/pdf,.pdf" className="mt-3 block w-full text-xs text-[#6f6b64] file:mr-3 file:rounded-lg file:border-0 file:bg-[#20212a] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" onChange={(event) => setContractFile(event.target.files?.[0] ?? null)} type="file" />{contractFile ? <span className="mt-2 block text-xs font-medium text-[#26783a]">Selecionado: {contractFile.name}</span> : project.contractUrl?.includes("/contract") ? <span className="mt-2 block text-xs font-medium text-[#26783a]">Um PDF já está anexado a este projeto.</span> : null}</label><Input placeholder="Link externo do contrato (opcional)" type="url" value={contractUrl} onChange={setContractUrl} /><label className="flex items-center gap-2 text-sm text-[#73747e]"><input checked={maintenanceActive} onChange={(event) => setMaintenanceActive(event.target.checked)} type="checkbox" />Possui manutenção mensal</label>{maintenanceActive ? <Input placeholder="Mensalidade (R$)" type="number" min="0" step="0.01" value={maintenanceValue} onChange={setMaintenanceValue} /> : null}<Button loading={saving}>{contractFile ? "Salvar e anexar PDF" : "Salvar alterações"}</Button></form></div></div>;
}

function ProjectEditModal({ project, onClose, onUpdated }: { project: Project; onClose: () => void; onUpdated: (project: Project) => void }) {
  const [name, setName] = useState(project.name);
  const [projectType, setProjectType] = useState<ProjectType>(project.projectType);
  const [status, setStatus] = useState<ProjectStatus>(project.status);
  const [scope, setScope] = useState(project.scope ?? "");
  const [totalValue, setTotalValue] = useState(project.totalValue?.toString() ?? "");
  const [contractStatus, setContractStatus] = useState<ContractStatus>(project.contractStatus);
  const [contractUrl, setContractUrl] = useState(project.contractUrl ?? "");
  const [maintenanceActive, setMaintenanceActive] = useState(project.maintenanceActive);
  const [maintenanceValue, setMaintenanceValue] = useState(project.maintenanceMonthlyValue?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(null); try { const updated = await authenticatedRequest<Project>(`/api/projects/${project.id}`, { method: "PATCH", body: JSON.stringify({ name, projectType, status, scope: scope || null, totalValue: totalValue ? Number(totalValue) : null, contractStatus, contractUrl: contractUrl || null, maintenanceActive, maintenanceMonthlyValue: maintenanceActive && maintenanceValue ? Number(maintenanceValue) : null }) }); onUpdated(updated); onClose(); } catch (cause) { setError(message(cause, "Nao foi possivel atualizar o projeto.")); } finally { setSaving(false); } }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#161719]/45 p-5" onClick={onClose} role="dialog" aria-modal="true"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">Editar projeto</p><p className="mt-1 text-sm text-[#88837b]">Cliente: {project.clientName}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={onClose} type="button">×</button></div>{error ? <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}<form className="mt-6 space-y-4" onSubmit={save}><Input placeholder="Nome do projeto" value={name} onChange={setName} required /><div className="grid gap-3 sm:grid-cols-2"><Select value={projectType} onChange={(value) => setProjectType(value as ProjectType)}>{Object.entries(projectTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select value={status} onChange={(value) => setStatus(value as ProjectStatus)}>{Object.entries(projectStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><textarea className="min-h-24 w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" placeholder="Escopo do projeto" value={scope} onChange={(event) => setScope(event.target.value)} /><div className="grid gap-3 sm:grid-cols-2"><Input placeholder="Valor (R$)" type="number" min="0" step="0.01" value={totalValue} onChange={setTotalValue} /><Select value={contractStatus} onChange={(value) => setContractStatus(value as ContractStatus)}>{Object.entries(contractStatuses).map(([value, label]) => <option key={value} value={value}>Contrato: {label}</option>)}</Select></div><Input placeholder="Link do contrato" type="url" value={contractUrl} onChange={setContractUrl} /><label className="flex items-center gap-2 text-sm text-[#73747e]"><input checked={maintenanceActive} onChange={(event) => setMaintenanceActive(event.target.checked)} type="checkbox" />Possui manutencao mensal</label>{maintenanceActive ? <Input placeholder="Mensalidade (R$)" type="number" min="0" step="0.01" value={maintenanceValue} onChange={setMaintenanceValue} /> : null}<Button loading={saving}>Salvar alteracoes</Button></form></div></div>;
}

function FinancePageV2(props: { projects: Project[]; payments: Payment[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onMarkPaid: (id: string) => void; onDelete: (payment: Payment) => void; deletingId: string | null; paymentProjectId: string; setPaymentProjectId: (value: string) => void; description: string; setDescription: (value: string) => void; amount: string; setAmount: (value: string) => void; dueDate: string; setDueDate: (value: string) => void; status: PaymentStatus; setStatus: (value: PaymentStatus) => void; type: PaymentType; setType: (value: PaymentType) => void; saving: boolean }) {
  return <section className="mt-7 grid gap-6 xl:grid-cols-[360px_1fr]">
    <Surface>
      <Label>Pagamento do projeto</Label>
      <p className="mt-2 text-sm text-[#85817a]">Registre entrada, saldo final ou qualquer outra cobrança.</p>
      <form className="mt-5 space-y-3" onSubmit={props.onSubmit}>
        <Select required value={props.paymentProjectId} onChange={props.setPaymentProjectId}><option value="">Projeto *</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name} — {project.clientName}</option>)}</Select>
        <Input placeholder="Descrição (ex.: Entrada 50%) *" required value={props.description} onChange={props.setDescription} />
        <div className="grid grid-cols-2 gap-3"><Select value={props.type} onChange={(value) => props.setType(value as PaymentType)}><option value="PROJECT">Projeto</option><option value="MONTHLY_MAINTENANCE">Manutenção</option><option value="OTHER">Outro</option></Select><Select value={props.status} onChange={(value) => props.setStatus(value as PaymentStatus)}>{Object.entries(paymentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div>
        <Input min="0" onChange={props.setAmount} placeholder="Valor (R$) *" required step="0.01" type="number" value={props.amount} />
        <Input type="date" value={props.dueDate} onChange={props.setDueDate} required />
        <Button disabled={!props.projects.length} loading={props.saving}>Adicionar pagamento</Button>
      </form>
    </Surface>
    <Surface>
      <div className="flex items-center justify-between"><Label>Pagamentos cadastrados</Label><span className="rounded-full bg-[#f0efeb] px-3 py-1 text-xs text-[#6d6962]">{props.payments.length} total</span></div>
      <div className="mt-5 space-y-3">
        {props.payments.length === 0 ? <Empty text="Nenhum pagamento cadastrado." /> : props.payments.map((payment) => <article className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#eceaf0] bg-[#fafafd] px-5 py-4" key={payment.id}><div className="min-w-0"><p className="font-semibold">{payment.description}</p><p className="mt-1 truncate text-sm text-[#999aa5]">{payment.projectName} · {payment.clientName} · vence {formatDate(payment.dueDate)}</p></div><div className="flex items-center gap-3"><div className="text-right"><p className="font-bold">{money.format(payment.amount)}</p><p className={payment.status === "PAID" ? "mt-1 text-xs text-emerald-600" : "mt-1 text-xs text-amber-600"}>{paymentStatuses[payment.status]}</p></div>{!["PAID", "CANCELLED"].includes(payment.status) ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-medium text-white" onClick={() => props.onMarkPaid(payment.id)} type="button">Marcar pago</button> : null}<button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-[#ffdcdc]" disabled={props.deletingId === payment.id} onClick={() => props.onDelete(payment)} type="button">{props.deletingId === payment.id ? "Apagando..." : "Apagar"}</button></div></article>)}
      </div>
    </Surface>
  </section>;
}

function FinancePage(props: { projects: Project[]; payments: Payment[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onMarkPaid: (id: string) => void; paymentProjectId: string; setPaymentProjectId: (value: string) => void; description: string; setDescription: (value: string) => void; amount: string; setAmount: (value: string) => void; dueDate: string; setDueDate: (value: string) => void; status: PaymentStatus; setStatus: (value: PaymentStatus) => void; type: PaymentType; setType: (value: PaymentType) => void; saving: boolean }) { return <section className="mt-7 grid gap-6 xl:grid-cols-[340px_1fr]"><Surface><Label>Nova cobranca</Label><form className="mt-5 space-y-3" onSubmit={props.onSubmit}><Select value={props.paymentProjectId} onChange={props.setPaymentProjectId} required><option value="">Projeto *</option>{props.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Input placeholder="Descricao *" value={props.description} onChange={props.setDescription} required /><div className="grid grid-cols-2 gap-3"><Select value={props.type} onChange={(value) => props.setType(value as PaymentType)}><option value="PROJECT">Projeto</option><option value="MONTHLY_MAINTENANCE">Manutencao</option><option value="OTHER">Outro</option></Select><Select value={props.status} onChange={(value) => props.setStatus(value as PaymentStatus)}>{Object.entries(paymentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></div><Input placeholder="Valor (R$) *" type="number" value={props.amount} onChange={props.setAmount} required /><Input type="date" value={props.dueDate} onChange={props.setDueDate} required /><Button disabled={!props.projects.length} loading={props.saving}>Adicionar cobranca</Button></form></Surface><Surface><Label>Historico financeiro</Label><div className="mt-5 space-y-3">{props.payments.length === 0 ? <Empty text="Nenhuma cobranca cadastrada." /> : props.payments.map((payment) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7f7fb] px-5 py-4" key={payment.id}><div><p className="font-semibold">{payment.description}</p><p className="mt-1 text-sm text-[#999aa5]">{payment.clientName} · vence {formatDate(payment.dueDate)}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="font-bold">{money.format(payment.amount)}</p><p className={payment.status === "PAID" ? "mt-1 text-xs text-emerald-600" : "mt-1 text-xs text-amber-600"}>{paymentStatuses[payment.status]}</p></div>{!["PAID", "CANCELLED"].includes(payment.status) ? <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-medium text-white" onClick={() => props.onMarkPaid(payment.id)} type="button">Marcar pago</button> : null}</div></div>)}</div></Surface></section>; }

function RoomsPage(props: { rooms: Room[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; title: string; setTitle: (value: string) => void; url: string; setUrl: (value: string) => void; saving: boolean; deletingSlug: string | null; copiedSlug: string | null; onDelete: (room: Room) => void; onCopy: (room: Room) => void }) { return <section className="mt-7 grid gap-6 xl:grid-cols-[340px_1fr]"><Surface><Label>Nova apresentacao</Label><form className="mt-5 space-y-3" onSubmit={props.onSubmit}><Input placeholder="Titulo *" value={props.title} onChange={props.setTitle} required /><Input placeholder="https://preview-do-site.com *" type="url" value={props.url} onChange={props.setUrl} required /><Button loading={props.saving}>Criar sala</Button></form></Surface><Surface><Label>Salas criadas</Label><div className="mt-5 space-y-3">{props.rooms.length === 0 ? <Empty text="Nenhuma sala criada." /> : props.rooms.map((room) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f7f7fb] px-5 py-4" key={room.id}><div><p className="font-semibold">{room.title}</p><p className="mt-1 font-mono text-xs text-[#999aa5]">/room/{room.slug}</p></div><div className="flex gap-2"><a className="rounded-xl bg-white px-3 py-2 text-xs shadow-sm" href={`/room/${room.slug}?mode=host`} target="_blank">Abrir</a><button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs text-white" onClick={() => void props.onCopy(room)} type="button">{props.copiedSlug === room.slug ? "Copiado" : "Link"}</button><button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-xs text-red-600" disabled={props.deletingSlug === room.slug} onClick={() => props.onDelete(room)} type="button">{props.deletingSlug === room.slug ? "Apagando" : "Apagar"}</button></div></div>)}</div></Surface></section>; }

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`rounded-3xl bg-white p-5 shadow-[0_12px_35px_rgba(34,35,47,0.04)] sm:p-6 ${className}`}>{children}</section>; }
function MetricCard({ icon, label, value, detail }: { icon: string; label: string; value: string; detail: string }) { return <article className="rounded-3xl bg-white p-5 shadow-[0_12px_35px_rgba(34,35,47,0.04)]"><div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f2f1f8] text-[#4f505a]">{icon}</span><span className="text-[#b0b1ba]">⋮</span></div><p className="mt-5 text-xs text-[#a0a1aa]">{label}</p><p className="mt-1 text-xl font-bold">{value}</p><p className="mt-2 text-xs text-[#9a9ba5]">{detail}</p></article>; }
function Label({ children }: { children: ReactNode }) { return <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">{children}</p>; }
function Input({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" onChange={(event) => onChange(event.target.value)} {...props} />; }
function Select({ children, ...props }: { children: ReactNode; value: string; onChange: (value: string) => void; required?: boolean }) { return <select className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none focus:border-[#6d6e79]" onChange={(event) => props.onChange(event.target.value)} required={props.required} value={props.value}>{children}</select>; }
function Button({ children, loading, disabled }: { children: ReactNode; loading?: boolean; disabled?: boolean }) { return <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={disabled || loading} type="submit">{loading ? "Salvando..." : children}</button>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[#dcdde6] px-4 py-8 text-center text-sm text-[#9a9ba6]">{text}</div>; }
function message(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function toIsoDate(value: string) { const normalized = value.trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized; const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : ""; }
