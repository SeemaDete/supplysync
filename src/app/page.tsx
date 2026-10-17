import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { homeFor } from "@/lib/rbac";

export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? homeFor(user.role) : "/login");
}
