import { Database, ExternalLink, FileSpreadsheet } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requirePageUser("analytics:view");
  const embed = process.env.POWERBI_EMBED_URL;

  return (
    <>
      <PageHeader title="Reports" description="Power BI embedded report and data access for BI tools." />
      {embed ? (
        <Card className="overflow-hidden">
          <iframe title="Power BI report" src={embed} className="h-[75vh] w-full border-0" allowFullScreen />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Connect Power BI</CardTitle>
              <CardDescription>No report is embedded yet. Set POWERBI_EMBED_URL in Vercel to show one here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <ol className="list-decimal space-y-1.5 pl-5">
                <li>In Power BI Desktop choose <b>Get data → PostgreSQL database</b>.</li>
                <li>Server: your Supabase host with port 5432 (Project settings → Database → Session pooler). Database: <code>postgres</code>.</li>
                <li>Sign in with a read-only role (see <code>prisma/sql/reporting_views.sql</code>).</li>
                <li>Import the views in the <code>reporting</code> schema: <code>rpt_po_lines</code>, <code>rpt_supplier_performance</code>, <code>rpt_followups</code>, <code>rpt_monthly_deliveries</code>.</li>
                <li>Publish the report, create an embed link (Secure embed or Power BI Embedded), and paste it into <code>POWERBI_EMBED_URL</code>.</li>
              </ol>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Quick exports</CardTitle></CardHeader>
            <CardContent className="grid gap-2">
              <Button asChild variant="outline"><a href="/api/export?format=xlsx"><FileSpreadsheet /> Full PO tracker (Excel)</a></Button>
              <Button asChild variant="outline"><a href="/api/export?format=xlsx&overdue=1"><FileSpreadsheet /> Overdue lines (Excel)</a></Button>
              <Button asChild variant="outline"><a href="/api/export?format=xlsx&status=GR_PENDING"><FileSpreadsheet /> GR pending (Excel)</a></Button>
              <Button asChild variant="ghost"><a href="/api/analytics" target="_blank" rel="noreferrer"><ExternalLink /> KPI JSON</a></Button>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
