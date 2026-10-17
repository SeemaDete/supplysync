import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { can, type Permission, type Role } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  supplierId: string | null;
  canOverride: boolean;
};

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    supplierId: session.user.supplierId,
    canOverride: session.user.canOverride,
  };
}

/** For server components/pages: redirect instead of throwing */
export async function requirePageUser(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (permission && !can(user.role, permission, { canOverride: user.canOverride })) redirect("/forbidden");
  return user;
}

/** For API route handlers: throw HttpError (converted to JSON by withApi) */
export async function requireApiUser(permission?: Permission): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Not signed in");
  if (permission && !can(user.role, permission, { canOverride: user.canOverride })) {
    throw new HttpError(403, "You do not have permission for this action");
  }
  return user;
}
