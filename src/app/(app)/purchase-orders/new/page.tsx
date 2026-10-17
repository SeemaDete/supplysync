import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { todayISO } from "@/lib/dates";
import { PageHeader } from "@/components/page-header";
import { PoForm } from "@/components/po/po-form";

export const metadata = { title: "New PO" };

export default async function NewPoPage() {
  const user = await requirePageUser("po:create");
  const [suppliers, buyers] = await Promise.all([
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true, code: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { active: true, role: { key: { in: ["BUYER", "ADMIN"] } } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Create purchase order" description="Lines start as Open. Supplier confirmation drives follow-ups." />
      <PoForm suppliers={suppliers} buyers={buyers} currentUserId={user.id} today={todayISO()} />
    </>
  );
}
