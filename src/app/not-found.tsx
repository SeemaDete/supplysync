import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-lg font-semibold">Not found</h1>
      <p className="text-sm text-muted-foreground">The page or record does not exist, or you do not have access to it.</p>
      <Button asChild variant="outline"><Link href="/">Go home</Link></Button>
    </main>
  );
}
