import { requirePageUser } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { emailConfigured } from "@/services/email-service";
import { entraEnabled } from "@/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { SettingsForm } from "@/components/admin-forms";
import { RunSchedulerButton } from "@/components/followup-actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageUser("admin:settings");
  const settings = await getSettings();
  const checks = [
    { label: "Database", ok: true },
    { label: "Email (SMTP)", ok: emailConfigured() },
    { label: "Microsoft Entra ID", ok: entraEnabled },
    { label: "Cron secret", ok: !!process.env.CRON_SECRET },
    { label: "Supabase Storage", ok: !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { label: "Power BI embed", ok: !!process.env.POWERBI_EMBED_URL },
  ];
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Business rules</CardTitle></CardHeader>
          <CardContent><SettingsForm initial={settings} /></CardContent>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              {checks.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-sm">
                  {c.label} {c.ok ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not set</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Follow-up engine</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>Runs daily at 07:00 IST via Vercel Cron. Run it now after importing data or changing lead time.</p>
              <RunSchedulerButton />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
