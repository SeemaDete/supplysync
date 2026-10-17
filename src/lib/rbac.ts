// Role-based access control. Pure (no DB) so it can run in middleware and on the client.

export type Role = "ADMIN" | "BUYER" | "SUPPLIER" | "LOGISTICS" | "MANAGEMENT";

export type Permission =
  | "po:view"
  | "po:create"
  | "po:edit"
  | "po:archive"
  | "po:close"
  | "followup:manage"
  | "email:send"
  | "response:record"
  | "delivery:record"
  | "gr:post"
  | "comment:create"
  | "attachment:upload"
  | "override:apply"
  | "import:run"
  | "export:run"
  | "dashboard:view"
  | "analytics:view"
  | "audit:view"
  | "admin:users"
  | "admin:suppliers"
  | "admin:settings"
  | "portal:access";

const MATRIX: Record<Role, Permission[]> = {
  ADMIN: [
    "po:view", "po:create", "po:edit", "po:archive", "po:close", "followup:manage", "email:send",
    "response:record", "delivery:record", "gr:post", "comment:create", "attachment:upload",
    "override:apply", "import:run", "export:run", "dashboard:view", "analytics:view", "audit:view",
    "admin:users", "admin:suppliers", "admin:settings",
  ],
  BUYER: [
    "po:view", "po:create", "po:edit", "po:archive", "po:close", "followup:manage", "email:send",
    "response:record", "comment:create", "attachment:upload", "import:run", "export:run",
    "dashboard:view", "analytics:view", "audit:view", "admin:suppliers",
  ],
  LOGISTICS: [
    "po:view", "delivery:record", "gr:post", "comment:create", "attachment:upload", "export:run", "dashboard:view",
  ],
  MANAGEMENT: ["po:view", "export:run", "dashboard:view", "analytics:view", "audit:view", "comment:create"],
  SUPPLIER: ["portal:access", "comment:create", "attachment:upload"],
};

export function can(role: Role | undefined | null, permission: Permission, opts?: { canOverride?: boolean }): boolean {
  if (!role) return false;
  if (permission === "override:apply") {
    return role === "ADMIN" || ((role === "BUYER" || role === "LOGISTICS") && !!opts?.canOverride);
  }
  return MATRIX[role]?.includes(permission) ?? false;
}

export function homeFor(role: Role): string {
  return role === "SUPPLIER" ? "/portal" : "/dashboard";
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  BUYER: "Procurement Buyer",
  SUPPLIER: "Supplier",
  LOGISTICS: "Logistics / Stores",
  MANAGEMENT: "Management",
};
