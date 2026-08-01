"use client";

import { SalesOverview } from "@/features/rooms/components/dashboard";
import type { Client, Payment, Project } from "@/features/portfolio/portfolio.types";
import type { Room } from "@/features/rooms/room.types";

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

const clients: Client[] = [
  { id: "c1", name: "Ana Ferreira", companyName: "Ferreira Contabilidade", email: "ana@ferreira.com", phone: null, document: null, notes: null, createdAt: today },
  { id: "c2", name: "Bruno Lima", companyName: "Lima Advocacia", email: "bruno@lima.com", phone: null, document: null, notes: null, createdAt: today },
  { id: "c3", name: "Clara Souza", companyName: null, email: "clara@souza.com", phone: null, document: null, notes: null, createdAt: today },
];

const projects: Project[] = [
  { id: "p1", clientId: "c1", clientName: "Ana Ferreira", name: "Site institucional", projectType: "INSTITUTIONAL_WEBSITE", status: "DEVELOPMENT", scope: null, totalValue: 8500, contractStatus: "SIGNED", contractUrl: null, maintenanceActive: true, maintenanceMonthlyValue: 250, maintenanceStartDate: today, startDate: today, deliveryDate: null, createdAt: today },
  { id: "p2", clientId: "c2", clientName: "Bruno Lima", name: "Landing page campanha", projectType: "LANDING_PAGE", status: "DELIVERED", scope: null, totalValue: 4200, contractStatus: "SIGNED", contractUrl: null, maintenanceActive: false, maintenanceMonthlyValue: null, maintenanceStartDate: null, startDate: today, deliveryDate: today, createdAt: today },
  { id: "p3", clientId: "c3", clientName: "Clara Souza", name: "Sistema de gestão", projectType: "WEB_SYSTEM", status: "PLANNING", scope: null, totalValue: 21000, contractStatus: "SENT", contractUrl: null, maintenanceActive: false, maintenanceMonthlyValue: null, maintenanceStartDate: null, startDate: today, deliveryDate: null, createdAt: today },
];

const payments: Payment[] = [
  { id: "pay1", projectId: "p1", projectName: "Site institucional", clientName: "Ana Ferreira", description: "Entrada projeto", paymentType: "PROJECT", status: "PAID", amount: 4250, dueDate: `${thisMonth}-05`, paidAt: `${thisMonth}-05` },
  { id: "pay2", projectId: "p2", projectName: "Landing page campanha", clientName: "Bruno Lima", description: "Pagamento final", paymentType: "PROJECT", status: "PAID", amount: 4200, dueDate: `${thisMonth}-10`, paidAt: `${thisMonth}-10` },
  { id: "pay3", projectId: "p3", projectName: "Sistema de gestão", clientName: "Clara Souza", description: "Entrada sistema", paymentType: "PROJECT", status: "PENDING", amount: 7000, dueDate: `${thisMonth}-20`, paidAt: null },
  { id: "pay4", projectId: "p1", projectName: "Site institucional", clientName: "Ana Ferreira", description: "Manutenção mensal", paymentType: "MONTHLY_MAINTENANCE", status: "OVERDUE", amount: 250, dueDate: `${thisMonth}-15`, paidAt: null },
];

const rooms: Room[] = [
  { id: "r1", slug: "site-ana", title: "Apresentação site Ana", projectUrl: null, status: "CLOSED", scrollLocked: false, presentationActive: false, createdAt: today },
];

export default function DevPreviewPage() {
  return (
    <main className="min-h-screen bg-white p-8 text-[#20212a]">
      <SalesOverview
        account={{ name: "Lázaro Alves", email: "lazaroalves12355@gmail.com" }}
        clients={clients}
        metrics={{ openProjects: 2, pending: 7000, monthly: 250 }}
        onRefresh={() => {}}
        payments={payments}
        projects={projects}
        refreshing={false}
        rooms={rooms}
      />
    </main>
  );
}
