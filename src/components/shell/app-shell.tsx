import { signOut } from "@/auth";
import { can } from "@/lib/rbac";
import type { SessionUser } from "@/lib/session";
import { NAV } from "./nav";
import { Brand, SidebarNav } from "./sidebar";
import { Topbar } from "./topbar";

async function signOutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export function AppShell({ user, children, portal = false }: { user: SessionUser; children: React.ReactNode; portal?: boolean }) {
  const items = portal ? [] : NAV.filter((n) => can(user.role, n.permission, { canOverride: user.canOverride }));
  return (
    <div className="flex min-h-screen">
      {!portal && (
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-[hsl(var(--sidebar))] lg:flex">
          <Brand />
          <div className="flex-1 overflow-y-auto pb-4">
            <SidebarNav items={items} />
          </div>
          <p className="px-5 pb-4 text-[10px] text-slate-500">SupplySync v1.0</p>
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={{ name: user.name, email: user.email, role: user.role }} nav={items} signOutAction={signOutAction} />
        {portal && (
          <div className="border-b bg-[hsl(var(--sidebar))] text-white">
            <Brand />
          </div>
        )}
        <main className="mx-auto w-full max-w-[1500px] flex-1 p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
