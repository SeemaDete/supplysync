import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { runFollowupScheduler } from "@/services/followup-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily follow-up engine. Triggered by Vercel Cron (see vercel.json) which sends
 * "Authorization: Bearer $CRON_SECRET". An Admin can also run it from Settings.
 */
export async function GET(req: Request) {
  const header = req.headers.get("authorization");
  const cronOk = !!process.env.CRON_SECRET && header === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const session = await auth();
    if (session?.user?.role !== "ADMIN") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const result = await runFollowupScheduler();
  return NextResponse.json({ ...result, ms: Date.now() - started, ranAt: new Date().toISOString() });
}

export const POST = GET;
