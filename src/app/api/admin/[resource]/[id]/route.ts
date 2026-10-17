import bcrypt from "bcryptjs";
import { withApi, readJson } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { supplierInput, userInput } from "@/lib/validation";
import { auditDiff } from "@/services/audit-service";

type P = { resource: string; id: string };

// PATCH /api/admin/users/:id | /api/admin/suppliers/:id  (no deletes – deactivate instead)
export const PATCH = withApi<P>(async (req, { params }) => {
  const { resource, id } = await params;
  if (resource === "users") {
    const admin = await requireApiUser("admin:users");
    const i = userInput.partial().parse(await readJson(req));
    const before = await prisma.user.findUniqueOrThrow({ where: { id }, include: { role: true } });
    if (id === admin.id && i.active === false) throw new HttpError(422, "You cannot deactivate yourself");
    const data: Record<string, unknown> = {};
    if (i.name !== undefined) data.name = i.name;
    if (i.email !== undefined) data.email = i.email;
    if (i.active !== undefined) data.active = i.active;
    if (i.canOverride !== undefined) data.canOverride = i.canOverride;
    if (i.supplierId !== undefined) data.supplierId = i.supplierId || null;
    if (i.role) data.roleId = (await prisma.role.findUniqueOrThrow({ where: { key: i.role } })).id;
    if (i.password) data.passwordHash = await bcrypt.hash(i.password, 10);
    await prisma.user.update({ where: { id }, data });
    const { passwordHash: _p, ...auditable } = data;
    await auditDiff(prisma, { entityType: "User", entityId: id, action: "UPDATE", userId: admin.id }, before as unknown as Record<string, unknown>, auditable);
    return { ok: true };
  }
  if (resource === "suppliers") {
    const u = await requireApiUser("admin:suppliers");
    const i = supplierInput.partial().parse(await readJson(req));
    const before = await prisma.supplier.findUniqueOrThrow({ where: { id } });
    const s = await prisma.supplier.update({ where: { id }, data: i });
    await auditDiff(prisma, { entityType: "Supplier", entityId: id, action: "UPDATE", userId: u.id }, before as unknown as Record<string, unknown>, i as Record<string, unknown>);
    return s;
  }
  throw new HttpError(404, "Unknown resource");
});
