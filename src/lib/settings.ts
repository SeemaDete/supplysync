import { prisma } from "@/lib/prisma";

export type AppSettings = {
  followupLeadDays: number;
  grPendingAfterDays: number;
  riskOverdueThreshold: number;
  emailBuyerOnFollowup: boolean;
  companyName: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  followupLeadDays: 7,
  grPendingAfterDays: 1,
  riskOverdueThreshold: 2,
  emailBuyerOnFollowup: true,
  companyName: "SupplySync Manufacturing",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out as AppSettings;
}

export async function saveSettings(values: AppSettings) {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } }),
    ),
  );
}
