import { Download, FileSpreadsheet } from "lucide-react";
import { requirePageUser } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { ImportWizard } from "@/components/import-wizard";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Import / Export" };

export default async function ImportPage() {
  await requirePageUser("import:run");
  return (
    <>
      <PageHeader
        title="Import / export"
        description="Bulk-load POs from SAP or Excel, or export the tracker. Filtered exports are on the PO tracker page."
        actions={
          <>
            <Button asChild variant="outline" size="sm"><a href="/api/export?format=xlsx"><FileSpreadsheet /> Export all (Excel)</a></Button>
            <Button asChild variant="outline" size="sm"><a href="/api/export?format=csv"><Download /> Export all (CSV)</a></Button>
          </>
        }
      />
      <ImportWizard />
    </>
  );
}
