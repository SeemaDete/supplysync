import { redirect } from "next/navigation";
import { Boxes, Truck, BellRing, ClipboardCheck } from "lucide-react";
import { entraEnabled } from "@/auth";
import { getSessionUser } from "@/lib/session";
import { homeFor } from "@/lib/rbac";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const showDemo = process.env.SHOW_DEMO_LOGINS !== "false";

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-[hsl(var(--sidebar))] p-10 text-white lg:flex">
        <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative flex items-center gap-2 text-lg font-semibold">
          <Boxes className="h-6 w-6 text-sky-300" /> SupplySync
        </div>
        <div className="relative max-w-md space-y-6">
          <h1 className="text-3xl font-semibold leading-tight">Every PO, every supplier date, every delivery — in one place.</h1>
          <ul className="space-y-3 text-sm text-slate-300">
            <li className="flex gap-3"><ClipboardCheck className="h-5 w-5 text-sky-300" /> Suppliers acknowledge and confirm dates in their own portal</li>
            <li className="flex gap-3"><BellRing className="h-5 w-5 text-sky-300" /> Follow-ups generate themselves 7 days before delivery</li>
            <li className="flex gap-3"><Truck className="h-5 w-5 text-sky-300" /> Partial deliveries and GRs tracked to the last unit</li>
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">Supplier Collaboration & Purchase Order Visibility Platform</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-lg font-semibold lg:hidden">
              <Boxes className="h-5 w-5 text-primary" /> SupplySync
            </div>
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="text-sm text-muted-foreground">Buyers, suppliers, logistics and management use the same login.</p>
          </div>
          <LoginForm entraEnabled={entraEnabled} showDemo={showDemo} />
        </div>
      </section>
    </main>
  );
}
