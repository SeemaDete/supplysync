import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, Table, TBody, TD, TH, THead, TR } from "@/components/ui/primitives";
import { SupplierDialog } from "@/components/admin-forms";

export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  await requirePageUser("admin:suppliers");
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { purchaseOrders: true, users: true } } },
  });
  return (
    <>
      <PageHeader title="Suppliers" description="Supplier master data. Link portal users to a supplier on the Users page." actions={<SupplierDialog />} />
      <Card className="overflow-hidden">
        <Table>
          <THead><TR><TH>Code</TH><TH>Name</TH><TH>Email</TH><TH>Contact</TH><TH>Phone</TH><TH className="text-right">POs</TH><TH className="text-right">Portal users</TH><TH>Status</TH><TH /></TR></THead>
          <TBody>
            {suppliers.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.code}</TD>
                <TD>{s.name}</TD>
                <TD className="text-xs">{s.email}</TD>
                <TD className="text-xs">{s.contactPerson ?? "—"}</TD>
                <TD className="text-xs">{s.phone ?? "—"}</TD>
                <TD className="num text-right">{s._count.purchaseOrders}</TD>
                <TD className="num text-right">{s._count.users}</TD>
                <TD>{s.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</TD>
                <TD className="text-right">
                  <SupplierDialog supplier={{ id: s.id, code: s.code, name: s.name, email: s.email, contactPerson: s.contactPerson, phone: s.phone, country: s.country, active: s.active }} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
