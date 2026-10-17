"use client";

import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

// Colours are CSS variables so charts follow light/dark theme
const C = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  grid: "hsl(var(--border))",
  text: "hsl(var(--muted-foreground))",
};

const axis = { stroke: C.text, fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = {
  contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12, color: "hsl(var(--popover-foreground))" },
  cursor: { fill: "hsl(var(--muted))", opacity: 0.6 },
};

function Frame({ children, height = 240 }: { children: React.ReactElement; height?: number }) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function MonthlyDeliveryChart({ data }: { data: { label: string; onTime: number; late: number }[] }) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        <Bar dataKey="onTime" name="On time" stackId="a" fill={C.success} radius={[0, 0, 0, 0]} maxBarSize={36} />
        <Bar dataKey="late" name="Late" stackId="a" fill={C.danger} radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </Frame>
  );
}

export function OtifTrendChart({ data }: { data: { label: string; otif: number | null }[] }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="label" {...axis} />
        <YAxis domain={[0, 100]} unit="%" {...axis} />
        <Tooltip {...tooltipStyle} formatter={(v) => (v === null ? "—" : `${v}%`)} />
        <Line type="monotone" dataKey="otif" name="OTIF" stroke={C.primary} strokeWidth={2} dot={{ r: 3 }} connectNulls />
      </LineChart>
    </Frame>
  );
}

export function SupplierPerformanceChart({ data }: { data: { name: string; otif: number; open: number; overdue: number }[] }) {
  return (
    <Frame height={Math.max(200, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
        <YAxis type="category" dataKey="name" width={140} {...axis} tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)} />
        <Tooltip {...tooltipStyle} formatter={(v, n) => (n === "OTIF %" ? `${v}%` : v)} />
        <Bar dataKey="otif" name="OTIF %" fill={C.primary} radius={[0, 3, 3, 0]} maxBarSize={18} />
      </BarChart>
    </Frame>
  );
}

export function BuyerWorkloadChart({ data }: { data: { name: string; openLines: number; overdue: number }[] }) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        <Bar dataKey="openLines" name="Open lines" fill={C.primary} radius={[3, 3, 0, 0]} maxBarSize={36} />
        <Bar dataKey="overdue" name="Overdue" fill={C.danger} radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </Frame>
  );
}

export function BucketChart({ data, color = "primary", name = "Count" }: { data: { bucket: string; count: number }[]; color?: "primary" | "danger" | "warning"; name?: string }) {
  return (
    <Frame height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="bucket" {...axis} />
        <YAxis allowDecimals={false} {...axis} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="count" name={name} fill={C[color]} radius={[3, 3, 0, 0]} maxBarSize={44} />
      </BarChart>
    </Frame>
  );
}
