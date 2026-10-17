import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fmtDateTime } from "@/lib/dates";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { UserDialog } from "@/components/admin-forms";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requirePageUser("admin:users");
  const [users, suppliers] = await Promise.all([
    prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { role: true, supplier: { select: { id: true, name: true } } } }),
    prisma.supplier.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Users & roles" description="Users are never deleted – deactivate them instead." actions={<UserDialog suppliers={suppliers} />} />
      <Card className="overflow-hidden">
        <Table>
          <THead><TR><TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Supplier</TH><TH>Override</TH><TH>Status</TH><TH>Last login</TH><TH /></TR></THead>
          <TBody>
            {users.map((u) => (
              <TR key={u.id} className={u.active ? "" : "opacity-60"}>
                <TD className="font-medium">{u.name}</TD>
                <TD className="text-xs">{u.email}</TD>
                <TD>{ROLE_LABELS[u.role.key as Role]}</TD>
                <TD className="text-xs">{u.supplier?.name ?? "—"}</TD>
                <TD>{u.canOverride || u.role.key === "ADMIN" ? <Badge tone="violet">Yes</Badge> : "—"}</TD>
                <TD>{u.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD className="text-xs">{fmtDateTime(u.lastLoginAt)}</TD>
                <TD className="text-right">
                  <UserDialog suppliers={suppliers} user={{ id: u.id, email: u.email, name: u.name, role: u.role.key, supplierId: u.supplierId, canOverride: u.canOverride, active: u.active }} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
