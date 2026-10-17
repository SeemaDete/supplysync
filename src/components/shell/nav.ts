import type { Permission } from "@/lib/rbac";

export type NavItem = { href: string; label: string; icon: string; permission: Permission };

// icon names map to lucide icons in sidebar.tsx
export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "gauge", permission: "dashboard:view" },
  { href: "/purchase-orders", label: "PO Tracker", icon: "list", permission: "po:view" },
  { href: "/followups", label: "Follow-ups", icon: "bell", permission: "followup:manage" },
  { href: "/deliveries", label: "Deliveries & GR", icon: "truck", permission: "delivery:record" },
  { href: "/analytics", label: "Analytics", icon: "chart", permission: "analytics:view" },
  { href: "/reports", label: "Reports", icon: "file", permission: "analytics:view" },
  { href: "/import", label: "Import / Export", icon: "upload", permission: "import:run" },
  { href: "/audit", label: "Audit Log", icon: "shield", permission: "audit:view" },
  { href: "/admin/suppliers", label: "Suppliers", icon: "factory", permission: "admin:suppliers" },
  { href: "/admin/users", label: "Users", icon: "users", permission: "admin:users" },
  { href: "/admin/settings", label: "Settings", icon: "settings", permission: "admin:settings" },
];
