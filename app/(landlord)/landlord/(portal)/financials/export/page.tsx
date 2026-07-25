import { PageHeader } from '@/components/ui/PortalShell';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';

export const dynamic = 'force-dynamic';

export default function LandlordTaxExport() {
  const now = new Date();
  const defaultStart = `${now.getUTCFullYear()}-01-01`;
  const defaultEnd = `${now.getUTCFullYear()}-12-31`;

  return (
    <>
      <PageHeader title="Tax Export" subtitle="Year-end rent payment export for your records." />
      <Card>
        <form action="/api/financials/tax-export" method="GET" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Start date" htmlFor="start">
              <Input id="start" name="start" type="date" defaultValue={defaultStart} />
            </Field>
            <Field label="End date" htmlFor="end">
              <Input id="end" name="end" type="date" defaultValue={defaultEnd} />
            </Field>
          </div>
          <Button type="submit">Download CSV</Button>
          <p className="text-ink/60">
            For use with Schedule E or your accountant — consult a tax professional.
          </p>
        </form>
      </Card>
    </>
  );
}
