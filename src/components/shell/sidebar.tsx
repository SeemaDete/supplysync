"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell, Boxes, ChartColumn, Factory, FileBarChart, Gauge, ListChecks, Settings, ShieldCheck, Truck, Upload, Users, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge, list: ListChecks, bell: Bell, truck: Truck, chart: ChartColumn, file: FileBarChart, upload: Upload,
  shield: ShieldCheck, factory: Factory, users: Users, settings: Settings,
};

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? ListChecks;
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-white",
              active && "bg-white/10 font-medium text-white shadow-[inset_3px_0_0_0_rgb(125,211,252)]",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-4 text-white">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-sky-500/20">
        <Boxes className="h-5 w-5 text-sky-300" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold">SupplySync</p>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">PO Visibility</p>
      </div>
    </div>
  );
}
