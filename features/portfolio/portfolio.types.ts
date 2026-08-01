export type Client = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  document: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProjectType =
  | "LANDING_PAGE"
  | "INSTITUTIONAL_WEBSITE"
  | "ECOMMERCE"
  | "WEB_SYSTEM"
  | "MAINTENANCE"
  | "OTHER";

export type ProjectStatus =
  | "LEAD"
  | "PLANNING"
  | "DESIGN"
  | "DEVELOPMENT"
  | "REVIEW"
  | "DELIVERED"
  | "MAINTENANCE"
  | "CANCELLED";

export type ContractStatus = "NOT_STARTED" | "DRAFT" | "SENT" | "SIGNED";

export type Project = {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  projectType: ProjectType;
  status: ProjectStatus;
  scope: string | null;
  totalValue: number | null;
  contractStatus: ContractStatus;
  contractUrl: string | null;
  maintenanceActive: boolean;
  maintenanceMonthlyValue: number | null;
  maintenanceStartDate: string | null;
  startDate: string;
  deliveryDate: string | null;
  createdAt: string;
};

export type PaymentStatus = "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentType = "PROJECT" | "MONTHLY_MAINTENANCE" | "OTHER";

export type Payment = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  description: string;
  paymentType: PaymentType;
  status: PaymentStatus;
  amount: number;
  dueDate: string;
  paidAt: string | null;
};
