"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type InputHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { getAccessToken, logout, refreshAccessToken } from "@/features/auth/auth.client";
import type { Client, ContractStatus, Payment, PaymentStatus, PaymentType, Project, ProjectStatus, ProjectType } from "@/features/portfolio/portfolio.types";
import { ApiError, authenticatedRequest } from "@/lib/api.client";
import { FinancePageV3 } from "@/features/rooms/components/finance-page";
import { BrazilianDateField } from "@/features/rooms/components/brazilian-date-field";
import { ProjectEditModalV3 } from "@/features/rooms/components/project-edit-modal";
import { ConfirmationModal } from "@/features/rooms/components/confirmation-modal";
import { CustomSelect } from "@/features/rooms/components/custom-select";
import { BrandMark } from "@/features/rooms/components/brand-mark";
import { EditProfileModal } from "@/features/rooms/components/account-settings-modals";

import type { CreateRoomRequest, Room, RoomStatus } from "../room.types";

type Section = "overview" | "clients" | "projects" | "finance" | "rooms";

type Account = { name: string; email: string };

type DashboardSnapshot = {
  clients: Client[];
  projects: Project[];
  payments: Payment[];
  rooms: Room[];
  account: Account | null;
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
const compactNumberFormatter = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const compactMoney = { format: (value: number) => `R$ ${compactNumberFormatter.format(value)}` };
const projectTypes: Record<ProjectType, string> = { LANDING_PAGE: "Landing page", INSTITUTIONAL_WEBSITE: "Site institucional", ECOMMERCE: "E-commerce", WEB_SYSTEM: "Sistema web", MAINTENANCE: "Manutencao", OTHER: "Outro" };
const projectStatuses: Record<ProjectStatus, string> = { LEAD: "Proposta", PLANNING: "Planejamento", DESIGN: "Design", DEVELOPMENT: "Desenvolvimento", REVIEW: "Revisao", DELIVERED: "Entregue", MAINTENANCE: "Manutencao", CANCELLED: "Cancelado" };
const contractStatuses: Record<ContractStatus, string> = { NOT_STARTED: "Nao iniciado", DRAFT: "Rascunho", SENT: "Enviado", SIGNED: "Assinado" };
const paymentStatuses: Record<PaymentStatus, string> = { PENDING: "Pendente", PAID: "Pago", OVERDUE: "Em atraso", CANCELLED: "Cancelado" };
const paymentStatusColors: Record<PaymentStatus, string> = { PENDING: "text-[#b98900]", PAID: "text-[#1f9d55]", OVERDUE: "text-[#d64545]", CANCELLED: "text-[#928e86]" };

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

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
  const [account, setAccount] = useState<Account | null>(() => dashboardSnapshot?.account ?? null);
  const [loading, setLoading] = useState(() => dashboardSnapshot === null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientDocument, setClientDocument] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("INSTITUTIONAL_WEBSITE");
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("PLANNING");
  const [contractStatus, setContractStatus] = useState<ContractStatus>("NOT_STARTED");
  const [projectValue, setProjectValue] = useState("");
  const [maintenanceActive, setMaintenanceActive] = useState(false);
  const [maintenanceValue, setMaintenanceValue] = useState("");
  const [maintenanceStartDate, setMaintenanceStartDate] = useState("");
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
        setAccount(dashboardSnapshot.account);
        setLoading(false);
      }

      const token = getAccessToken() ?? await refreshAccessToken();
      if (!token) return router.replace("/login");
      try {
        const [nextClients, nextProjects, nextPayments, nextRooms] = await Promise.all([
          authenticatedRequest<Client[]>("/api/clients"), authenticatedRequest<Project[]>("/api/projects"),
          authenticatedRequest<Payment[]>("/api/payments"), authenticatedRequest<Room[]>("/api/rooms"),
        ]);
        dashboardSnapshot = { clients: nextClients, projects: nextProjects, payments: nextPayments, rooms: nextRooms, account: dashboardSnapshot?.account ?? null };
        setClients(nextClients); setProjects(nextProjects); setPayments(nextPayments); setRooms(nextRooms);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) return router.replace("/login");
        setError("Nao foi possivel carregar os dados. Confira se o Spring esta rodando.");
      } finally { setLoading(false); setRefreshing(false); }
    }
    void load();
  }, [router, reloadToken]);

  function refreshDashboard() {
    setRefreshing(true);
    setError(null);
    setReloadToken((current) => current + 1);
  }

  // À parte da carga principal: se essa chamada falhar, o nome exibido cai para um genérico
  // em vez de travar o resto do painel (que não depende deste dado para funcionar).
  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      try {
        const nextAccount = await authenticatedRequest<Account>("/api/account");
        if (cancelled) return;
        setAccount(nextAccount);
        if (dashboardSnapshot) dashboardSnapshot.account = nextAccount;
      } catch {
        // Mantém o nome genérico; as demais seções do painel continuam funcionando normalmente.
      }
    }
    void loadAccount();
    return () => { cancelled = true; };
  }, []);

  const metrics = useMemo(() => ({
    openProjects: projects.filter((project) => !["DELIVERED", "CANCELLED"].includes(project.status)).length,
    pending: payments.filter((payment) => ["PENDING", "OVERDUE"].includes(payment.status)).reduce((sum, payment) => sum + Number(payment.amount), 0),
    monthly: projects.filter((project) => project.maintenanceActive).reduce((sum, project) => sum + Number(project.maintenanceMonthlyValue ?? 0), 0),
  }), [payments, projects]);

  async function createClient(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving("client"); setError(null); try { const client = await authenticatedRequest<Client>("/api/clients", { method: "POST", body: JSON.stringify({ name: clientName, companyName: clientCompany || null, email: clientEmail || null, phone: clientPhone || null, document: clientDocument || null }) }); setClients((current) => [client, ...current]); setSelectedClientId(client.id); setClientName(""); setClientCompany(""); setClientEmail(""); setClientPhone(""); setClientDocument(""); return true; } catch (cause) { setError(message(cause, "Nao foi possivel cadastrar o cliente.")); return false; } finally { setSaving(null); } }
  async function updateClient(clientId: string) { setSaving("client"); setError(null); try { const client = await authenticatedRequest<Client>(`/api/clients/${clientId}`, { method: "PATCH", body: JSON.stringify({ name: clientName, companyName: clientCompany || null, email: clientEmail || null, phone: clientPhone || null, document: clientDocument || null }) }); setClients((current) => current.map((item) => item.id === client.id ? client : item)); setClientName(""); setClientCompany(""); setClientEmail(""); setClientPhone(""); setClientDocument(""); return true; } catch (cause) { setError(message(cause, "Nao foi possivel atualizar o cliente.")); return false; } finally { setSaving(null); } }
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
          maintenanceStartDate: maintenanceActive ? toIsoDate(String(formData.get("maintenanceStartDate") || "")) : null,
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
      setMaintenanceStartDate("");
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

  const pageTitle: Record<Section, string> = { overview: "Dashboard", clients: "Clientes", projects: "Projetos", finance: "Financeiro", rooms: "Salas de reunião" };
  return (
    <main className="min-h-screen bg-white text-[#20212a]">
      <Sidebar account={account} active={section} onLogout={() => void logout().then(() => router.replace("/login"))} />
      <div className="min-h-screen px-5 py-6 sm:px-8 lg:ml-56 lg:px-8 xl:px-10">
        {section !== "overview" ? <header className="mb-2 border-b border-[#efefed] pb-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#202126]">{pageTitle[section]}</h1>
          <p className="mt-1 text-sm text-[#85817a]">Gerencie seu estúdio em um só lugar</p>
        </header> : null}
        {error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
        {section === "clients" && <ClientsPage clients={clients} projects={projects} onSubmit={createClient} onUpdate={updateClient} onDelete={deleteClient} deletingId={deletingClientId} name={clientName} company={clientCompany} email={clientEmail} phone={clientPhone} document={clientDocument} setName={setClientName} setCompany={setClientCompany} setEmail={setClientEmail} setPhone={setClientPhone} setDocument={setClientDocument} saving={saving === "client"} />}
        {section === "projects" && <ProjectsPageV2 clients={clients} projects={projects} onSubmit={createProject} onUpdated={replaceProject} onDelete={deleteProject} deletingId={deletingProjectId} selectedClientId={selectedClientId} setSelectedClientId={setSelectedClientId} projectName={projectName} setProjectName={setProjectName} projectType={projectType} setProjectType={setProjectType} projectStatus={projectStatus} setProjectStatus={setProjectStatus} contractStatus={contractStatus} setContractStatus={setContractStatus} projectValue={projectValue} setProjectValue={setProjectValue} maintenanceActive={maintenanceActive} setMaintenanceActive={setMaintenanceActive} maintenanceValue={maintenanceValue} setMaintenanceValue={setMaintenanceValue} maintenanceStartDate={maintenanceStartDate} setMaintenanceStartDate={setMaintenanceStartDate} saving={saving === "project"} />}
        {section === "overview" && <SalesOverview account={account} clients={clients} onRefresh={refreshDashboard} projects={projects} payments={payments} refreshing={refreshing} rooms={rooms} metrics={metrics} />}
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

function Sidebar({ account, active, onLogout }: { account: Account | null; active: Section; onLogout: () => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileVisible, setMobileVisible] = useState(false);

  function openMobileMenu() {
    setMobileOpen(true);
    window.requestAnimationFrame(() => setMobileVisible(true));
  }

  function closeMobileMenu() {
    setMobileVisible(false);
    window.setTimeout(() => setMobileOpen(false), 220);
  }

  const items: Array<[Section, string, string, string]> = [
    ["overview", "Início", "/dashboard", "⌂"],
    ["clients", "Clientes", "/dashboard/clients", "♙"],
    ["projects", "Projetos", "/dashboard/projects", "□"],
    ["finance", "Financeiro", "/dashboard/finance", "▤"],
    ["rooms", "Reuniões", "/dashboard/rooms", "◉"],
  ];

  const navContent = (
    <>
      <div className="hidden items-center gap-2.5 px-2 pb-6 pt-1 lg:flex">
        <BrandMark className="h-8 w-8" />
        <span className="truncate text-[13px] font-bold tracking-tight text-[#292a31]">AlvesR Workspace</span>
      </div>
      <nav className="space-y-1">
        {items.map(([key, label, href, icon]) => (
          <Link aria-label={label} className={`flex h-10 items-center gap-3 rounded-[18px] px-3 text-[13px] font-medium transition-colors duration-200 ${active === key ? "bg-[#202126] text-white" : "text-[#58585d] hover:bg-[#efede9] hover:text-[#202126]"}`} href={href} key={key} onClick={closeMobileMenu}>
            <span className="grid h-5 w-5 place-items-center text-base leading-none">{icon}</span>
            <span>{label}</span>
          </Link>
        ))}
      </nav>
      <div className="mt-7 rounded-[22px] border border-[#eeece7] bg-white p-3">
        <div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-[#efeee9] text-xs text-[#22242d]">●</span><div><p className="text-xs font-bold text-[#2a2b31]">Seu estúdio</p><p className="text-[10px] text-[#98958f]">Tudo em um só lugar</p></div></div>
        <p className="mt-3 rounded-xl bg-[#f3f1ec] px-2.5 py-2 text-[10px] leading-4 text-[#76736d]">Clientes, projetos e reuniões organizados para você.</p>
      </div>
      <div className="mt-auto"><AccountMenu account={account} onLogout={onLogout} /></div>
    </>
  );

  return (
    <>
      <div className="flex items-center justify-between border-b border-[#ebebe8] bg-[#f8f8f6] px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2"><BrandMark className="h-7 w-7" /><span className="truncate text-[13px] font-bold tracking-tight text-[#292a31]">AlvesR Workspace</span></div>
        <button aria-label="Abrir menu" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#292a31] shadow-sm" onClick={openMobileMenu} type="button"><MenuIcon /></button>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-[#ebebe8] bg-[#f8f8f6] p-4 lg:flex">
        {navContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end lg:hidden" role="dialog" aria-modal="true">
          <div className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${mobileVisible ? "opacity-100" : "opacity-0"}`} onClick={closeMobileMenu} />
          <aside className={`relative flex h-full w-64 max-w-[80vw] flex-col border-l border-[#ebebe8] bg-[#f8f8f6] p-4 pt-14 shadow-2xl transition-transform duration-200 ease-out ${mobileVisible ? "translate-x-0" : "translate-x-full"}`}>
            <button aria-label="Fechar menu" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white text-lg text-[#5f5a52]" onClick={closeMobileMenu} type="button">×</button>
            {navContent}
          </aside>
        </div>
      ) : null}
    </>
  );
}

function MenuIcon() {
  return (
    <svg fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
      <line x1="3" x2="21" y1="6" y2="6" />
      <line x1="3" x2="21" y1="12" y2="12" />
      <line x1="3" x2="21" y1="18" y2="18" />
    </svg>
  );
}

function AccountMenu({ account, onLogout }: { account: Account | null; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"profile" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const displayName = account?.name.trim() || "Minha conta";
  const initial = displayName.slice(0, 1).toUpperCase();

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button aria-expanded={open} aria-haspopup="menu" className="flex w-full items-center gap-2.5 rounded-[18px] bg-[#111214] px-3 py-2.5 text-left transition hover:bg-[#1c1d21]" onClick={() => setOpen((current) => !current)} type="button">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ffd84f] text-xs font-bold text-[#25262c]">{initial}</span>
        <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-xs font-semibold text-white">{displayName}</p><p className="truncate text-[10px] text-white/45">{account?.email ?? "Seu estúdio"}</p></div>
        <span className="shrink-0 text-white/45">⋮</span>
      </button>
      {open ? (
        <div className="absolute bottom-[calc(100%+6px)] left-0 z-20 w-full rounded-xl border border-[#eeece7] bg-white p-1.5 shadow-xl" role="menu">
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#3f3d3a] transition hover:bg-[#f4f4f2]" onClick={() => { setModal("profile"); setOpen(false); }} role="menuitem" type="button">
            <span className="grid h-5 w-5 place-items-center text-base">◑</span><span>Editar perfil</span>
          </button>
          <div className="my-1 border-t border-[#f0eeea]" />
          <button className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-[#58585d] transition hover:bg-[#ffe9e9] hover:text-red-500" onClick={onLogout} role="menuitem" type="button">
            <span className="grid h-5 w-5 place-items-center text-base">↪</span><span>Sair</span>
          </button>
        </div>
      ) : null}
      {modal === "profile" ? <EditProfileModal onClose={() => setModal(null)} /> : null}
    </div>
  );
}


export function SalesOverview({ account, clients, onRefresh, projects, payments, refreshing, rooms, metrics }: { account: Account | null; clients: Client[]; onRefresh: () => void; projects: Project[]; payments: Payment[]; refreshing: boolean; rooms: Room[]; metrics: { openProjects: number; pending: number; monthly: number } }) {
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const belongsToSelectedMonth = (date: string | null | undefined) => Boolean(date && date.slice(0, 7) === selectedMonth);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${selectedMonth}-01T12:00:00`));
  const monthKeyOffset = (offset: number) => {
    const date = new Date(`${selectedMonth}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  };
  const previousMonthKey = monthKeyOffset(-1);
  const receivedInMonth = (monthKey: string) => payments.filter((payment) => payment.status === "PAID" && payment.dueDate.startsWith(monthKey)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const billedInMonth = (monthKey: string) => payments.filter((payment) => payment.status !== "CANCELLED" && payment.dueDate.startsWith(monthKey)).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const pendingInMonth = (monthKey: string) => payments.filter((payment) => payment.status !== "PAID" && payment.status !== "CANCELLED" && payment.dueDate.startsWith(monthKey)).reduce((sum, payment) => sum + Number(payment.amount), 0);

  const projectsWithPayments = new Set(payments.map((payment) => payment.projectId));
  const deliveredWithoutPaymentRecord = projects
    .filter((project) => project.status === "DELIVERED" && !projectsWithPayments.has(project.id) && belongsToSelectedMonth(project.deliveryDate ?? project.startDate ?? project.createdAt))
    .reduce((sum, project) => sum + Number(project.totalValue ?? 0), 0);
  const received = receivedInMonth(selectedMonth) + deliveredWithoutPaymentRecord;
  const prevReceived = receivedInMonth(previousMonthKey);
  const pending = pendingInMonth(selectedMonth);
  const prevPending = pendingInMonth(previousMonthKey);
  const roomsInSelectedMonth = rooms.filter((room) => belongsToSelectedMonth(room.createdAt));
  const soldProjects = projects.filter((project) => !["LEAD", "CANCELLED"].includes(project.status));
  const totalSold = soldProjects.reduce((sum, project) => sum + Number(project.totalValue ?? 0), 0);
  const avgTicket = soldProjects.length ? totalSold / soldProjects.length : 0;
  const totalReceivedAllTime = payments.filter((payment) => payment.status === "PAID").reduce((sum, payment) => sum + Number(payment.amount), 0)
    + projects.filter((project) => project.status === "DELIVERED" && !projectsWithPayments.has(project.id)).reduce((sum, project) => sum + Number(project.totalValue ?? 0), 0);
  const activeMaintenanceCount = projects.filter((project) => project.maintenanceActive).length;

  const chartMonths = Array.from({ length: 6 }, (_, index) => {
    const key = monthKeyOffset(index - 5);
    return {
      key,
      label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${key}-01T12:00:00`)).replace(".", ""),
      received: receivedInMonth(key),
      billed: billedInMonth(key),
    };
  });

  const clientTotals = new Map<string, { name: string; total: number; projectCount: number; activeCount: number }>();
  for (const project of projects) {
    const entry = clientTotals.get(project.clientName) ?? { name: project.clientName, total: 0, projectCount: 0, activeCount: 0 };
    entry.total += Number(project.totalValue ?? 0);
    entry.projectCount += 1;
    if (!["DELIVERED", "CANCELLED"].includes(project.status)) entry.activeCount += 1;
    clientTotals.set(project.clientName, entry);
  }
  const topClients = [...clientTotals.values()].sort((a, b) => b.total - a.total).slice(0, 3);

  const recentPayments = [...payments].filter((payment) => belongsToSelectedMonth(payment.dueDate)).sort((first, second) => second.dueDate.localeCompare(first.dueDate)).slice(0, 5);
  const [searchMounted, setSearchMounted] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  function openSearch() {
    setSearchMounted(true);
    window.requestAnimationFrame(() => setSearchVisible(true));
  }

  function closeSearch() {
    setSearchVisible(false);
    window.setTimeout(() => { setSearchMounted(false); setSearchQuery(""); }, 180);
  }
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <section className="mt-0">
      <header className="mb-7 border-b border-[#efefed] pb-5">
        <div className="flex items-center justify-between gap-4">
          <button className="flex w-full max-w-xs items-center justify-between gap-2 rounded-full bg-[#f4f4f2] px-3 py-2 text-[10px] text-[#8b8882] transition hover:bg-[#ecece8]" onClick={openSearch} type="button">
            <span className="flex items-center gap-2"><span className="text-base leading-none">⌕</span><span>Buscar análises e clientes</span></span>
            <span className="rounded-md bg-white px-1.5 py-0.5 text-[9px] font-semibold text-[#9b978f]">Ctrl K</span>
          </button>
          <div className="flex items-center gap-3">
            <button aria-label="Atualizar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f4f4f2] text-sm text-[#53515b] transition hover:bg-[#ecece8] disabled:cursor-not-allowed disabled:opacity-60" disabled={refreshing} onClick={onRefresh} type="button"><span className={refreshing ? "inline-block animate-spin" : ""}>↻</span></button>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#ffd84f] text-xs font-bold text-[#25262c]">{(account?.name.trim() || "Minha conta").slice(0, 1).toUpperCase()}</span>
              <div className="hidden leading-tight sm:block"><p className="text-xs font-semibold text-[#25262c]">{account?.name.trim() || "Minha conta"}</p><p className="text-[10px] text-[#9b978f]">{account?.email ?? "Seu estúdio"}</p></div>
            </div>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold leading-[1.04] tracking-[-0.03em] text-[#202126] sm:text-4xl">Bem-vindo de volta!</h1>
            <p className="mt-2 text-sm text-[#85817a]">Resumo do seu estúdio em {monthLabel} · {metrics.openProjects} projeto(s) em andamento · {roomsInSelectedMonth.length} reunião(ões) criada(s)</p>
          </div>
          <DashboardMonthFilter value={selectedMonth} onChange={setSelectedMonth} />
        </div>
      </header>
      {searchMounted ? <DashboardSearchModal onChange={setSearchQuery} onClose={closeSearch} query={searchQuery} results={searchResults} visible={searchVisible} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard dark delta={pctDelta(received, prevReceived)} icon="◉" label="Recebido no período" value={money.format(received)} />
        <StatCard delta={pctDelta(pending, prevPending)} icon="▤" label="A receber" value={money.format(pending)} />
        <StatCard detail={`${soldProjects.length} projeto(s) contratado(s)`} icon="◆" label="Ticket médio" value={money.format(avgTicket)} />
        <StatCard detail="Desde o início" icon="◈" label="Total recebido" value={money.format(totalReceivedAllTime)} />
        <StatCard detail={`${activeMaintenanceCount} contrato(s) ativo(s)`} icon="↻" label="Manutenção mensal" value={money.format(metrics.monthly)} />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-3xl border border-[#efede8] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-base font-semibold tracking-tight">Faturamento ao longo do tempo</h2><p className="mt-1 text-xs text-[#85817a]">Recebido x cobrado por mês</p></div>
            <div className="flex items-center gap-3 text-[10px] font-medium text-[#6d6962]">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#6c5ce7]" />Recebido</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#37b6e9]" />Cobrado</span>
            </div>
          </div>
          <div className="mt-6">
            <TrendChart
              labels={chartMonths.map((month) => month.label)}
              series={[
                { area: true, color: "#6c5ce7", label: "Recebido", values: chartMonths.map((month) => month.received) },
                { color: "#37b6e9", label: "Cobrado", values: chartMonths.map((month) => month.billed) },
              ]}
            />
          </div>
        </section>

        <section className="rounded-3xl border border-[#efede8] bg-white p-5">
          <div className="flex items-start justify-between"><h2 className="text-base font-semibold tracking-tight">Clientes em destaque</h2><Link className="text-xs font-semibold text-[#5f5c56] hover:text-[#202126]" href="/dashboard/clients">Ver todos</Link></div>
          <div className="mt-4 space-y-2">
            {topClients.length === 0 ? <Empty text="Cadastre projetos para ver seus principais clientes." /> : topClients.map((client) => (
              <div className="flex items-center gap-3 rounded-2xl border border-[#f1efea] px-3 py-3" key={client.name}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#efeee9] text-sm font-bold text-[#44433d]">{client.name.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#242630]">{client.name}</p><p className="mt-0.5 text-xs text-[#918d85]">{client.projectCount} projeto(s)</p></div>
                <div className="shrink-0 text-right">
                  <span className={`inline-block rounded-full px-2.5 py-1 text-[10px] font-semibold ${client.activeCount > 0 ? "bg-[#e7f7ec] text-[#1f9d55]" : "bg-[#f1f0ed] text-[#726e66]"}`}>{client.activeCount > 0 ? "Em andamento" : "Concluído"}</span>
                  <p className="mt-1.5 text-xs font-semibold text-[#282930]">{money.format(client.total)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-3 overflow-hidden rounded-3xl border border-[#efede8] bg-white">
        <div className="flex items-center justify-between px-5 py-4">
          <div><h2 className="text-base font-semibold tracking-tight">Últimos pagamentos</h2><p className="mt-1 text-xs text-[#85817a]">{recentPayments.length} registro(s) em {monthLabel}</p></div>
          <Link className="rounded-full bg-[#f4f3ef] px-4 py-2 text-xs font-semibold text-[#68645e] transition hover:bg-[#ecebe6]" href="/dashboard/finance">Ver tudo →</Link>
        </div>
        <div className="border-t border-[#f0eeea]">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_110px_110px_90px_44px] gap-4 px-5 py-2 text-[10px] font-bold uppercase tracking-widest text-[#a19d95] sm:grid">
            <span>Cliente / descrição</span><span>Vencimento</span><span>Valor</span><span>Status</span><span className="text-right">Ação</span>
          </div>
          {recentPayments.length === 0 ? <p className="px-5 py-8 text-center text-sm text-[#98948d]">As cobranças aparecerão aqui quando você cadastrá-las.</p> : recentPayments.map((payment) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#f1efeb] px-5 py-3.5 last:border-0 sm:grid-cols-[minmax(0,1.4fr)_110px_110px_90px_44px]" key={payment.id}>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-[#282930]">{payment.description}</p><p className="mt-1 truncate text-xs text-[#8c8881]">{payment.clientName}</p></div>
              <span className="hidden text-xs text-[#89857e] sm:block">{formatDate(payment.dueDate)}</span>
              <b className="hidden text-sm text-[#292a30] sm:block">{money.format(payment.amount)}</b>
              <span className={`hidden text-xs font-semibold sm:block ${paymentStatusColors[payment.status]}`}>{paymentStatuses[payment.status]}</span>
              <Link className="hidden justify-self-end text-[#a19d95] transition hover:text-[#202126] sm:block" href="/dashboard/finance" title="Ver cobrança">•••</Link>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

const monthNamesShort = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(2024, index, 1)).replace(".", ""));

// A custom dropdown instead of <input type="month">, whose native calendar popup is rendered
// by the browser shell in the browser's UI language, ignoring our lang="pt-BR" entirely.
function DashboardMonthFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [year, month] = value.split("-").map(Number);
  const [viewYear, setViewYear] = useState(year);
  const containerRef = useRef<HTMLDivElement>(null);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${value}-01T12:00:00`));

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) setViewYear(year);
      return next;
    });
  }

  function selectMonth(monthIndex: number) {
    onChange(`${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={containerRef}>
      <button className="flex items-center gap-2 rounded-full bg-[#f1f1f0] px-3 py-2 text-xs text-[#625f59] transition hover:bg-[#e9e9e6]" onClick={toggleOpen} type="button">
        <span className="hidden sm:inline">Período</span>
        <span className="font-medium capitalize">{monthLabel}</span>
        <span className="text-[10px]">⌄</span>
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-64 rounded-2xl border border-[#efede8] bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <button aria-label="Ano anterior" className="grid h-7 w-7 place-items-center rounded-full text-sm text-[#726e66] transition hover:bg-[#f1f0ed]" onClick={() => setViewYear((current) => current - 1)} type="button">‹</button>
            <span className="text-sm font-semibold text-[#242630]">{viewYear}</span>
            <button aria-label="Próximo ano" className="grid h-7 w-7 place-items-center rounded-full text-sm text-[#726e66] transition hover:bg-[#f1f0ed]" onClick={() => setViewYear((current) => current + 1)} type="button">›</button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {monthNamesShort.map((label, index) => {
              const isSelected = viewYear === year && index === month - 1;
              return <button className={`rounded-xl py-2 text-xs font-medium capitalize transition ${isSelected ? "bg-[#202126] text-white" : "text-[#4c4a46] hover:bg-[#f1f0ed]"}`} key={label} onClick={() => selectMonth(index)} type="button">{label}</button>;
            })}
          </div>
          <button className="mt-3 w-full rounded-xl bg-[#f4f3ef] py-2 text-xs font-semibold text-[#5f5c56] transition hover:bg-[#ecebe6]" onClick={() => { onChange(currentMonth); setOpen(false); }} type="button">Mês atual</button>
        </div>
      ) : null}
    </div>
  );
}

function DashboardSearchModal({ query, results, onChange, onClose, visible }: { query: string; results: DashboardSearchResult[]; onChange: (value: string) => void; onClose: () => void; visible: boolean }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={`fixed inset-0 z-60 grid place-items-center p-5 backdrop-blur-[2px] transition-colors duration-180 ${visible ? "bg-[#17181b]/35" : "bg-[#17181b]/0"}`} onClick={onClose} role="dialog" aria-modal="true" aria-label="Buscar no sistema">
      <div className={`w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_rgba(20,20,24,0.25)] transition-all duration-180 ${visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.985] opacity-0"}`} onClick={(event) => event.stopPropagation()}>
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

function StatCard({ dark = false, icon, label, value, delta, detail }: { dark?: boolean; icon: string; label: string; value: string; delta?: number | null; detail?: string }) {
  return (
    <section className={`rounded-3xl p-5 ${dark ? "bg-[#111214] text-white" : "border border-[#efede8] bg-white text-[#202126]"}`}>
      <div className="flex items-start justify-between">
        <p className={`text-xs ${dark ? "text-white/65" : "text-[#76736d]"}`}>{label}</p>
        <span className={`grid h-8 w-8 place-items-center rounded-xl text-sm ${dark ? "bg-white text-black" : "bg-[#f4f4f2] text-[#6e6b65]"}`}>{icon}</span>
      </div>
      <p className="mt-5 text-3xl font-semibold tracking-tight">{value}</p>
      {delta !== undefined ? <DeltaBadge dark={dark} value={delta} /> : <p className={`mt-1 text-[11px] ${dark ? "text-white/55" : "text-[#85817b]"}`}>{detail}</p>}
    </section>
  );
}

function DeltaBadge({ dark, value }: { dark: boolean; value: number | null }) {
  if (value === null) return <p className={`mt-1 text-[11px] ${dark ? "text-white/55" : "text-[#85817b]"}`}>Sem dados do mês anterior</p>;
  if (value === 0) return <p className={`mt-1 text-[11px] font-semibold ${dark ? "text-white/55" : "text-[#9a968e]"}`}>▬ Estável vs. mês anterior</p>;
  const positive = value > 0;
  return (
    <p className={`mt-1 text-[11px] font-semibold ${positive ? "text-[#3ecb6b]" : "text-[#ff7a72]"}`}>
      {positive ? "▲" : "▼"} {Math.abs(value).toFixed(1)}% <span className={dark ? "text-white/45" : "text-[#9a968e]"}>vs. mês anterior</span>
    </p>
  );
}

type TrendSeries = { label: string; color: string; values: number[]; area?: boolean };

function TrendChart({ labels, series }: { labels: string[]; series: TrendSeries[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 600;
  const height = 200;
  const paddingTop = 10;
  const paddingBottom = 8;
  const count = labels.length;
  const maxValue = Math.max(1, ...series.flatMap((item) => item.values));
  const xFor = (index: number) => (count <= 1 ? width / 2 : (index / (count - 1)) * width);
  const yFor = (value: number) => paddingTop + (1 - value / maxValue) * (height - paddingTop - paddingBottom);

  function smoothPath(values: number[]) {
    const points = values.map((value, index) => ({ x: xFor(index), y: yFor(value) }));
    if (points.length < 2) return "";
    if (points.length === 2) return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
    let d = `M ${points[0].x},${points[0].y}`;
    for (let index = 1; index < points.length - 1; index++) {
      const current = points[index];
      const next = points[index + 1];
      const midpoint = { x: (current.x + next.x) / 2, y: (current.y + next.y) / 2 };
      d += ` Q ${current.x},${current.y} ${midpoint.x},${midpoint.y}`;
    }
    const last = points[points.length - 1];
    d += ` L ${last.x},${last.y}`;
    return d;
  }

  function handleMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(fraction * (count - 1)));
  }

  const gridSteps = [1, 0.75, 0.5, 0.25, 0];

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex h-48 w-14 shrink-0 flex-col justify-between py-1 text-[10px] text-[#a6a3ab]">
          {gridSteps.map((step) => <span key={step}>{compactMoney.format(maxValue * step)}</span>)}
        </div>
        <div className="relative h-48 flex-1" onMouseLeave={() => setHoverIndex(null)} onMouseMove={handleMove}>
          <svg className="h-full w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
            <defs>
              <linearGradient id="trend-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6c5ce7" stopOpacity="0.28" />
                <stop offset="100%" stopColor="#6c5ce7" stopOpacity="0" />
              </linearGradient>
            </defs>
            {gridSteps.map((step) => <line key={step} stroke="#f0eeea" strokeWidth={1} x1={0} x2={width} y1={yFor(maxValue * step)} y2={yFor(maxValue * step)} />)}
            {series.map((item) => item.area ? <path d={`${smoothPath(item.values)} L ${width},${height} L 0,${height} Z`} fill="url(#trend-area)" key={`${item.label}-area`} stroke="none" /> : null)}
            {series.map((item) => <path d={smoothPath(item.values)} fill="none" key={item.label} stroke={item.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} />)}
            {hoverIndex !== null ? <line stroke="#dcdadf" strokeDasharray="3 3" strokeWidth={1} x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={paddingTop} y2={height - paddingBottom} /> : null}
            {hoverIndex !== null ? series.map((item) => <circle cx={xFor(hoverIndex)} cy={yFor(item.values[hoverIndex])} fill={item.color} key={`${item.label}-dot`} r={4} stroke="white" strokeWidth={1.5} />) : null}
          </svg>
          {hoverIndex !== null ? (
            <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl bg-[#202126] px-3 py-2 text-[10px] font-medium text-white shadow-lg" style={{ left: `${(xFor(hoverIndex) / width) * 100}%` }}>
              <p className="font-semibold capitalize">{labels[hoverIndex]}</p>
              {series.map((item) => <p className="mt-0.5 flex items-center gap-1.5" key={item.label}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />{money.format(item.values[hoverIndex])}</p>)}
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex gap-3">
        <div className="w-14 shrink-0" />
        <div className="flex flex-1 justify-between text-[10px] text-[#a6a3ab]">
          {labels.map((label, index) => <span className={`capitalize ${hoverIndex === index ? "font-semibold text-[#202126]" : ""}`} key={`${label}-${index}`}>{label}</span>)}
        </div>
      </div>
    </div>
  );
}

function ClientsPage({ clients, projects, onSubmit, onUpdate, onDelete, deletingId, name, company, email, phone, document, setName, setCompany, setEmail, setPhone, setDocument, saving }: { clients: Client[]; projects: Project[]; onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>; onUpdate: (clientId: string) => Promise<boolean>; onDelete: (client: Client) => void; deletingId: string | null; name: string; company: string; email: string; phone: string; document: string; setName: (value: string) => void; setCompany: (value: string) => void; setEmail: (value: string) => void; setPhone: (value: string) => void; setDocument: (value: string) => void; saving: boolean }) {
  const [isModalMounted, setIsModalMounted] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const linkedProjects = viewingClient ? projects.filter((project) => project.clientId === viewingClient.id) : [];

  function openModal() { setIsModalMounted(true); window.requestAnimationFrame(() => setIsModalVisible(true)); }
  function openCreateModal() { setEditingClient(null); setName(""); setCompany(""); setEmail(""); setPhone(""); setDocument(""); openModal(); }
  function openEditModal(client: Client) { setEditingClient(client); setName(client.name); setCompany(client.companyName ?? ""); setEmail(client.email ?? ""); setPhone(client.phone ?? ""); setDocument(client.document ?? ""); openModal(); }
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
        {clients.length === 0 ? <ClientOnboarding onCreate={openCreateModal} /> : <div className="mt-5 min-h-102.5 rounded-2xl border border-[#e8e5df] bg-[#faf9f6] p-3"><div className="hidden px-4 pb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#989188] sm:grid sm:grid-cols-[minmax(0,1fr)_150px_245px]"><span>Cliente</span><span>Projetos</span><span className="text-right">Acoes</span></div><div className="space-y-2">{clients.map((client) => { const projectCount = projects.filter((project) => project.clientId === client.id).length; return <article className="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4 shadow-[0_5px_18px_rgba(63,55,44,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(63,55,44,0.08)] sm:grid sm:grid-cols-[minmax(0,1fr)_150px_245px] sm:items-center" key={client.id}><div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e8e0d2] text-sm font-bold text-[#5e594f]">{client.name.slice(0, 1)}</span><div className="min-w-0"><p className="truncate font-semibold text-[#242630]">{client.name}</p><p className="mt-1 truncate text-sm text-[#938d84]">{client.companyName || client.email || "Sem dados complementares"}</p></div></div><button className="justify-self-start rounded-xl bg-[#f1f0fa] px-3 py-2 text-xs font-medium text-[#65616f] transition hover:bg-[#e7e5f2] self-start" onClick={() => setViewingClient(client)} type="button">Ver {projectCount} {projectCount === 1 ? "projeto" : "projetos"}</button><div className="flex justify-end gap-2"><button className="rounded-xl bg-[#edf1fb] px-3 py-2 text-xs font-medium text-[#40507b] transition hover:bg-[#dfe6f7]" onClick={() => openEditModal(client)} type="button">Editar</button><button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50" disabled={deletingId === client.id} onClick={() => onDelete(client)} type="button">{deletingId === client.id ? "Apagando..." : "Apagar"}</button></div></article>; })}</div></div>}
      </Surface>

      {isModalMounted ? <div className={`fixed inset-0 z-50 grid place-items-center p-5 transition-opacity duration-200 ${isModalVisible ? "bg-[#161719]/45 opacity-100" : "bg-[#161719]/0 opacity-0"}`} onClick={closeModal} role="dialog" aria-modal="true"><div className={`w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl transition-all duration-200 ${isModalVisible ? "translate-y-0 scale-100 opacity-100" : "translate-y-3 scale-95 opacity-0"}`} onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">{editingClient ? "Editar cliente" : "Novo cliente"}</p><p className="mt-1 text-sm text-[#88837b]">{editingClient ? "Atualize os dados da sua carteira." : "Inclua os dados para organizar sua carteira."}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={closeModal} type="button">×</button></div><form className="mt-6 space-y-3" onSubmit={submitClient}><Input autoFocus placeholder="Nome do cliente *" value={name} onChange={setName} required /><Input placeholder="Empresa" value={company} onChange={setCompany} /><Input placeholder="E-mail" type="email" value={email} onChange={setEmail} /><Input placeholder="WhatsApp / celular" type="tel" value={phone} onChange={setPhone} /><Input placeholder="CPF ou CNPJ" value={document} onChange={setDocument} /><Button loading={saving}>{editingClient ? "Salvar alteracoes" : "Cadastrar cliente"}</Button></form></div></div> : null}

      {viewingClient ? <div className="fixed inset-0 z-50 grid place-items-center bg-[#161719]/45 p-5" onClick={() => setViewingClient(null)} role="dialog" aria-modal="true"><div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xl font-bold">Projetos de {viewingClient.name}</p><p className="mt-1 text-sm text-[#88837b]">{linkedProjects.length} {linkedProjects.length === 1 ? "projeto vinculado" : "projetos vinculados"}</p></div><button aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-[#f1eee8] text-lg text-[#5f5a52]" onClick={() => setViewingClient(null)} type="button">×</button></div><div className="mt-6 space-y-3">{linkedProjects.length === 0 ? <Empty text="Este cliente ainda não possui projetos vinculados." /> : linkedProjects.map((project) => <article className="flex items-center justify-between gap-4 rounded-2xl bg-[#f5f2ec] px-5 py-4" key={project.id}><div><p className="font-semibold">{project.name}</p><p className="mt-1 text-sm text-[#817c73]">{projectTypes[project.projectType]} · {projectStatuses[project.status]}</p></div><b className="text-sm">{project.totalValue ? money.format(project.totalValue) : "Sem valor"}</b></article>)}</div></div></div> : null}
    </section>
  );
}

function ClientOnboarding({ onCreate }: { onCreate: () => void }) {
  return <div className="mt-5 rounded-2xl border border-dashed border-[#d9d3c7] bg-[#fbfaf7] p-6"><div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#242630] text-xl text-white">♙</span><div><p className="font-semibold text-[#292824]">Comece sua carteira de clientes</p><p className="mt-1 text-sm text-[#858077]">Cadastre o primeiro cliente para acompanhar projetos, contratos e pagamentos em um só lugar.</p><button className="mt-4 rounded-xl bg-[#242630] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#353742]" onClick={onCreate} type="button">Cadastrar primeiro cliente</button></div></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><OnboardingStep number="1" title="Cliente" text="Cadastre os dados básicos." /><OnboardingStep number="2" title="Projeto" text="Defina escopo e etapas." /><OnboardingStep number="3" title="Cobrança" text="Registre valores e prazos." /></div></div>;
}

function OnboardingStep({ number, title, text }: { number: string; title: string; text: string }) { return <div className="rounded-xl bg-white p-4 shadow-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-[#e8e1d5] text-xs font-bold text-[#4d4942]">{number}</span><p className="mt-3 text-sm font-semibold">{title}</p><p className="mt-1 text-xs text-[#8b877e]">{text}</p></div>; }

function ProjectsPageV2(props: { clients: Client[]; projects: Project[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onUpdated: (project: Project) => void; onDelete: (project: Project) => void; deletingId: string | null; selectedClientId: string; setSelectedClientId: (value: string) => void; projectName: string; setProjectName: (value: string) => void; projectType: ProjectType; setProjectType: (value: ProjectType) => void; projectStatus: ProjectStatus; setProjectStatus: (value: ProjectStatus) => void; contractStatus: ContractStatus; setContractStatus: (value: ContractStatus) => void; projectValue: string; setProjectValue: (value: string) => void; maintenanceActive: boolean; setMaintenanceActive: (value: boolean) => void; maintenanceValue: string; setMaintenanceValue: (value: string) => void; maintenanceStartDate: string; setMaintenanceStartDate: (value: string) => void; saving: boolean }) {
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
          <label className="flex items-center gap-2 text-sm font-medium text-[#50515a]"><input checked={props.maintenanceActive} onChange={(event) => props.setMaintenanceActive(event.target.checked)} type="checkbox" />Cobrar manutenção recorrente</label>
          {props.maintenanceActive ? <div className="space-y-3 rounded-2xl border border-[#e8e5df] bg-[#faf9f6] p-3"><Input placeholder="Valor mensal (R$)" required type="number" value={props.maintenanceValue} onChange={props.setMaintenanceValue} /><BrazilianDateField label="Início do ciclo / primeiro vencimento" name="maintenanceStartDate" onChange={props.setMaintenanceStartDate} required value={props.maintenanceStartDate} /><p className="text-xs leading-5 text-[#777168]">A cobrança será repetida automaticamente todo mês neste mesmo dia.</p></div> : null}
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

const roomStatusLabels: Record<RoomStatus, string> = { WAITING: "Aguardando", ACTIVE: "Ao vivo", CLOSED: "Encerrada" };
const roomStatusStyles: Record<RoomStatus, string> = { WAITING: "bg-[#fdf3df] text-[#92660c]", ACTIVE: "bg-[#e7f7ec] text-[#1f9d55]", CLOSED: "bg-[#f1f0ed] text-[#726e66]" };

function RoomsPage(props: { rooms: Room[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; title: string; setTitle: (value: string) => void; url: string; setUrl: (value: string) => void; saving: boolean; deletingSlug: string | null; copiedSlug: string | null; onDelete: (room: Room) => void; onCopy: (room: Room) => void }) {
  const [formError, setFormError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!props.title.trim()) { setFormError("Informe um título para a apresentação."); return; }
    if (!/^https?:\/\/.+/i.test(props.url.trim())) { setFormError("Informe um endereço válido, começando com https://"); return; }
    setFormError(null);
    props.onSubmit(event);
  }

  return (
    <section className="mt-7 grid gap-6 xl:grid-cols-[340px_1fr]">
      <Surface>
        <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f4f4f2] text-sm text-[#6e6b65]">◉</span><div><Label>Nova apresentação</Label><p className="mt-0.5 text-xs text-[#a19d95]">Gere um link para apresentar ao cliente</p></div></div>
        <form className="mt-5 space-y-3" noValidate onSubmit={handleSubmit}>
          <Input placeholder="Título *" value={props.title} onChange={props.setTitle} />
          <Input placeholder="https://preview-do-site.com *" type="url" value={props.url} onChange={props.setUrl} />
          {formError ? <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{formError}</p> : null}
          <Button loading={props.saving}>Criar sala</Button>
        </form>
      </Surface>
      <Surface>
        <div className="flex items-center justify-between"><Label>Salas criadas</Label><span className="rounded-full bg-[#f0efeb] px-3 py-1 text-xs text-[#6d6962]">{props.rooms.length} total</span></div>
        <div className="mt-5 space-y-2.5">
          {props.rooms.length === 0 ? <Empty text="Nenhuma sala criada." /> : props.rooms.map((room) => (
            <article className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-[#eceaf0] bg-[#fafafd] p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-4" key={room.id}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold text-[#5e594f] shadow-sm">{room.title.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0"><p className="truncate font-semibold text-[#242630]">{room.title}</p><p className="mt-1 truncate font-mono text-xs text-[#999aa5]">/room/{room.slug}</p></div>
              <span className={`col-span-2 w-fit rounded-full px-2.5 py-1 text-[10px] font-semibold sm:col-span-1 ${roomStatusStyles[room.status]}`}>{roomStatusLabels[room.status]}</span>
              <div className="col-span-2 flex gap-2 sm:col-span-1 sm:justify-end">
                <a className="rounded-xl border border-[#e6e6ee] bg-white px-3 py-2 text-xs font-medium text-[#40507b] transition hover:bg-[#edf1fb]" href={`/room/${room.slug}?mode=host`} target="_blank">Abrir</a>
                <button className="rounded-xl bg-[#20212a] px-3 py-2 text-xs font-medium text-white transition hover:bg-[#353640]" onClick={() => void props.onCopy(room)} type="button">{props.copiedSlug === room.slug ? "Copiado" : "Link"}</button>
                <button className="rounded-xl bg-[#ffe9e9] px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50" disabled={props.deletingSlug === room.slug} onClick={() => props.onDelete(room)} type="button">{props.deletingSlug === room.slug ? "Apagando" : "Apagar"}</button>
              </div>
            </article>
          ))}
        </div>
      </Surface>
    </section>
  );
}

function Surface({ children, className = "" }: { children: ReactNode; className?: string }) { return <section className={`rounded-3xl border border-[#efede8] bg-white p-5 sm:p-6 ${className}`}>{children}</section>; }
function Label({ children }: { children: ReactNode }) { return <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#858690]">{children}</p>; }
function Input({ onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange: (value: string) => void }) { return <input className="w-full rounded-xl border border-[#e6e6ee] bg-[#fbfbfe] px-3 py-2.5 text-sm text-[#20212a] outline-none placeholder:text-[#b4b5bf] focus:border-[#6d6e79]" onChange={(event) => onChange(event.target.value)} {...props} />; }
function Select({ children, ...props }: { children: ReactNode; value: string; onChange: (value: string) => void; required?: boolean }) { return <CustomSelect onChange={props.onChange} required={props.required} value={props.value}>{children}</CustomSelect>; }
function Button({ children, loading, disabled }: { children: ReactNode; loading?: boolean; disabled?: boolean }) { return <button className="w-full rounded-xl bg-[#20212a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#353640] disabled:opacity-50" disabled={disabled || loading} type="submit">{loading ? "Salvando..." : children}</button>; }
function Empty({ text }: { text: string }) { return <div className="rounded-2xl border border-dashed border-[#dcdde6] px-4 py-8 text-center text-sm text-[#9a9ba6]">{text}</div>; }
function message(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
function formatDate(value: string) { return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function toIsoDate(value: string) { const normalized = value.trim(); if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized; const match = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return match ? `${match[3]}-${match[2]}-${match[1]}` : ""; }
