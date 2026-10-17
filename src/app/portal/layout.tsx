import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (user.role !== "SUPPLIER") redirect("/dashboard");
  return (
    <AppShell user={user} portal>
      {children}
    </AppShell>
  );
}
