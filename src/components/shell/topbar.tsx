"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, LogOut, Menu, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, initials } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/rbac";
import { Brand, SidebarNav } from "./sidebar";
import type { NavItem } from "./nav";

type Notification = { id: string; title: string; body: string; link: string | null; read: boolean; createdAt: string };

export function Topbar({ user, nav, signOutAction }: { user: { name: string; email: string; role: Role }; nav: NavItem[]; signOutAction: () => Promise<void> }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notes, setNotes] = useState<{ items: Notification[]; unread: number }>({ items: [], unread: 0 });
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) setNotes(await res.json());
    } catch {
      /* offline – ignore */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000); // in-app reminders refresh every minute
    return () => clearInterval(t);
  }, [load]);

  async function markAllRead() {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    load();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur sm:px-5">
        {nav.length > 0 && (
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu />
          </Button>
        )}
        <div className="flex-1" />

        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="hidden dark:block" />
          <Moon className="dark:hidden" />
        </Button>

        <DropdownMenu onOpenChange={(o) => o && load()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell />
              {notes.unread > 0 && (
                <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {notes.unread > 9 ? "9+" : notes.unread}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="text-sm font-semibold">Notifications</span>
              {notes.unread > 0 && (
                <button className="text-xs text-primary hover:underline" onClick={markAllRead}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notes.items.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">You&apos;re all caught up.</p>}
              {notes.items.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className={cn("flex-col items-start gap-0.5 rounded-none border-b px-3 py-2", !n.read && "bg-accent/40")}
                  onSelect={() => n.link && router.push(n.link)}
                >
                  <span className="text-xs font-semibold">{n.title}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials(user.name || user.email)}</span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-xs font-medium">{user.name}</span>
                <span className="block text-[10px] text-muted-foreground">{ROLE_LABELS[user.role]}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              {user.name}
              <span className="block font-normal text-muted-foreground">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={signOutAction}>
              <button type="submit" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Mobile / tablet navigation drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-[hsl(var(--sidebar))]">
            <div className="flex items-center justify-between">
              <Brand />
              <Button variant="ghost" size="icon" className="mr-2 text-white hover:bg-white/10" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            <SidebarNav items={nav} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
