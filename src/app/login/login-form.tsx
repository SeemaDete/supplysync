"use client";

import { useActionState, useState } from "react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/primitives";
import { loginWithEmail, loginWithMicrosoft } from "./actions";

const DEMO = [
  { role: "Admin", email: "admin@supplysync.demo" },
  { role: "Buyer", email: "buyer@supplysync.demo" },
  { role: "Supplier", email: "supplier@precisioncastings.demo" },
  { role: "Logistics", email: "logistics@supplysync.demo" },
  { role: "Management", email: "management@supplysync.demo" },
];

export function LoginForm({ entraEnabled, showDemo }: { entraEnabled: boolean; showDemo: boolean }) {
  const [state, action, pending] = useActionState(loginWithEmail, undefined);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="grid gap-5">
      {entraEnabled && (
        <>
          <form action={loginWithMicrosoft}>
            <Button type="submit" variant="outline" className="w-full">
              <svg viewBox="0 0 21 21" aria-hidden className="h-4 w-4">
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> or use email <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <form action={action} className="grid gap-3">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {state?.error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{state.error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
        </Button>
      </form>

      {showDemo && (
        <div className="rounded-md border border-dashed p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Demo accounts · password Demo@1234</p>
          <div className="flex flex-wrap gap-1.5">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => {
                  setEmail(d.email);
                  setPassword("Demo@1234");
                }}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent"
              >
                {d.role}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
