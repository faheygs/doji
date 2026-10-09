import { Box, Button, Stack, Typography } from '@mui/material';
import { PageHeader, RecordSection } from '@doji/ui';
import type { AuditEntry } from '@doji/portal-data/audit-entry';
import { Link } from 'react-router-dom';
import type { EmployeeOperator } from '@doji/portal-data/employee';
import { RecordLayout } from '../RecordLayout';
import { auditRelatedPath } from './audit-related';

export function AuditDetail({
  item,
  back,
  actor,
}: {
  item: AuditEntry;
  back(): void;
  actor: EmployeeOperator;
}) {
  const related = auditRelatedPath(item.entityType, item.entityId, actor);
  return (
    <Stack sx={{ gap: 3 }}>
      <Button onClick={back} sx={{ alignSelf: 'flex-start' }}>
        Back to audit log
      </Button>
      <PageHeader title={item.action} description="Recorded audit event · read only" />
      {related && (
        <Button component={Link} to={related} sx={{ alignSelf: 'flex-start' }}>
          Open related case
        </Button>
      )}
      <RecordLayout
        summary={
          <RecordSection title="Event details">
            <Box
              component="dl"
              sx={{
                m: 0,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: 2,
              }}
            >
              {[
                ['Event ID', item.id],
                ['Occurred at (UTC)', item.at],
                ['Actor', item.actor],
                ['Actor ID', item.actorId],
                ['Actor role', item.actorRole],
                ['Category', item.category],
                ['Record type', item.entityType],
                ['Record ID', item.entityId],
                ['Request ID', item.requestId],
                ['Reason', item.reason || 'No reason recorded'],
              ].map(([label, value]) => (
                <Box key={label} sx={{ display: 'contents' }}>
                  <Typography component="dt" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography
                    component="dd"
                    sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {value ?? 'Not supplied'}
                  </Typography>
                </Box>
              ))}
            </Box>
          </RecordSection>
        }
      >
        <RecordSection title="Recorded metadata">
          <Typography
            component="pre"
            variant="body2"
            sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
          >
            {item.metadata === null
              ? 'Not supplied'
              : JSON.stringify(JSON.parse(item.metadata), null, 2)}
          </Typography>
        </RecordSection>
      </RecordLayout>
    </Stack>
  );
}
