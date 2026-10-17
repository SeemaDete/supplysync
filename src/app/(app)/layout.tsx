import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export const dynamic = "force-dynamic";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  if (user.role === "SUPPLIER") redirect("/portal");
  return <AppShell user={user}>{children}</AppShell>;
}
