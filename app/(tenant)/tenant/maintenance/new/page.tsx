import Link from 'next/link';
import { PageHeader } from '@/components/ui/PortalShell';
import { NewRequestForm } from '@/components/tenant/NewRequestForm';

export default function NewMaintenanceRequest() {
  return (
    <>
      <div className="mb-4">
        <Link href="/tenant/maintenance" className="text-navy underline">
          ← Back to maintenance
        </Link>
      </div>
      <PageHeader
        title="New maintenance request"
        subtitle="Submitting opens a chat thread with your landlord and the Rental911 team."
      />
      <NewRequestForm />
    </>
  );
}
