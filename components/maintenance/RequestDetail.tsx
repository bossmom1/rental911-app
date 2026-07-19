import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { MaintenanceChat } from '@/components/maintenance/MaintenanceChat';
import { StatusUpdater } from '@/components/maintenance/StatusUpdater';
import { fmtDate } from '@/lib/format';
import type {
  ChatSenderRole,
  MaintenanceChat as ChatRow,
  MaintenanceRequest,
} from '@/types/database';

/**
 * Shared maintenance-request detail. Admin + landlord can edit status and see
 * the AI chat summary; tenants get a read-oriented view (no status control,
 * no summary — enforced by the props passed from each portal).
 */
export function RequestDetail({
  request,
  unitLabel,
  messages,
  currentUserId,
  currentRole,
  canEditStatus,
  showSummary,
}: {
  request: MaintenanceRequest;
  unitLabel: string;
  messages: ChatRow[];
  currentUserId: string;
  currentRole: ChatSenderRole;
  canEditStatus: boolean;
  showSummary: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {showSummary && request.status === 'closed' && request.chat_summary && (
          <Card className="mb-6 border-l-4 border-l-gold">
            <CardHeader title="AI Summary" subtitle="Generated on close" />
            <p className="whitespace-pre-wrap text-ink">{request.chat_summary}</p>
          </Card>
        )}

        <Card>
          <CardHeader title="Conversation" subtitle={unitLabel} />
          <MaintenanceChat
            requestId={request.id}
            currentUserId={currentUserId}
            currentRole={currentRole}
            initialMessages={messages}
            readOnly={request.status === 'closed'}
          />
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader title={request.title || 'Maintenance request'} />
          <p className="mb-4 whitespace-pre-wrap text-ink">
            {request.description || 'No description provided.'}
          </p>
          <dl className="space-y-2">
            <Row label="Category">
              <span className="capitalize">{request.category || '—'}</span>
            </Row>
            <Row label="Priority">
              <Badge value={request.priority} />
            </Row>
            <Row label="Status">
              <Badge value={request.status} />
            </Row>
            <Row label="Opened">{fmtDate(request.created_at)}</Row>
            {request.closed_at && (
              <Row label="Closed">{fmtDate(request.closed_at)}</Row>
            )}
          </dl>
        </Card>

        {canEditStatus && (
          <Card>
            <CardHeader title="Update status" />
            <StatusUpdater requestId={request.id} current={request.status} />
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-display font-bold text-navy">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}
