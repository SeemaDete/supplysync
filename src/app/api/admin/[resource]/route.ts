import bcrypt from "bcryptjs";
import { withApi, readJson } from "@/lib/api";
import { HttpError, requireApiUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { settingsInput, supplierInput, userInput } from "@/lib/validation";
import { getSettings, saveSettings } from "@/lib/settings";
import { audit } from "@/services/audit-service";

type P = { resource: string };

export const GET = withApi<P>(async (_req, { params }) => {
  const { resource } = await params;
  if (resource === "users") {
    await requireApiUser("admin:users");
    return prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, email: true, name: true, active: true, canOverride: true, lastLoginAt: true, role: { select: { key: true } }, supplier: { select: { id: true, name: true } } },
    });
  }
  if (resource === "suppliers") {
    await requireApiUser("po:view");
    return prisma.supplier.findMany({ orderBy: { name: "asc" } });
  }
  if (resource === "settings") {
    await requireApiUser("admin:settings");
    return getSettings();
  }
  throw new HttpError(404, "Unknown resource");
});

// POST creates (users, suppliers); PUT saves settings
export const POST = withApi<P>(async (req, { params }) => {
  const { resource } = await params;
  if (resource === "users") {
    const admin = await requireApiUser("admin:users");
    const i = userInput.parse(await readJson(req));
    if (i.role === "SUPPLIER" && !i.supplierId) throw new HttpError(422, "Supplier users must be linked to a supplier");
    const role = await prisma.role.findUniqueOrThrow({ where: { key: i.role } });
    const user = await prisma.user.create({
      data: {
        email: i.email, name: i.name, roleId: role.id, supplierId: i.role === "SUPPLIER" ? i.supplierId : null,
        canOverride: i.canOverride, active: i.active, passwordHash: i.password ? await bcrypt.hash(i.password, 10) : null,
      },
    });
    await audit(prisma, { entityType: "User", entityId: user.id, action: "CREATE", after: `${i.email} (${i.role})`, userId: admin.id });
    return { id: user.id };
  }
  if (resource === "suppliers") {
    const u = await requireApiUser("admin:suppliers");
    const i = supplierInput.parse(await readJson(req));
    const s = await prisma.supplier.create({ data: { ...i, code: i.code.toUpperCase() } });
    await audit(prisma, { entityType: "Supplier", entityId: s.id, action: "CREATE", after: `${s.code} ${s.name}`, userId: u.id });
    return s;
  }
  throw new HttpError(404, "Unknown resource");
});

export const PUT = withApi<P>(async (req, { params }) => {
  const { resource } = await params;
  if (resource !== "settings") throw new HttpError(404, "Unknown resource");
  const u = await requireApiUser("admin:settings");
  const before = await getSettings();
  const i = settingsInput.parse(await readJson(req));
  await saveSettings(i);
  await audit(prisma, { entityType: "Setting", entityId: "global", action: "UPDATE", before, after: i, userId: u.id });
  return i;
});
