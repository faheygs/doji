import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { Link } from 'react-router-dom';
import { WorkspaceIcon } from '@doji/ui';
import { homeEventStage, type HomeEvent } from '../../../packages/portal-data/src/employee-home';

export type HomeDojiProps = {
  data?: HomeEvent | undefined;
  state: 'loading' | 'ready' | 'error';
  retry?: () => void;
};
export function HomeDojiCard({ data, state, retry }: HomeDojiProps) {
  return (
    <Card
      variant="outlined"
      component="section"
      aria-label="Daily Doji"
      sx={{ borderTop: 3, borderTopColor: 'primary.main' }}
    >
      <CardContent sx={{ p: 3, minHeight: 280, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 2 }}>
          <WorkspaceIcon path="/community-ideas" />
          <Typography component="h2" variant="h6">
            Daily Doji
          </Typography>
          {state === 'ready' && data && (
            <Chip
              size="small"
              variant="outlined"
              label={homeEventStage(data)}
              sx={{ ml: 'auto' }}
            />
          )}
        </Stack>
        {state === 'loading' ? (
          <Stack aria-label="Loading Daily Doji">
            <Skeleton height={42} />
            <Skeleton width="65%" />
          </Stack>
        ) : state === 'error' ? (
          <Alert severity="warning" action={<Button onClick={retry}>Retry Doji</Button>}>
            Doji details are unavailable.
          </Alert>
        ) : (
          <>
            <Typography
              variant="h4"
              component="p"
              sx={{ overflowWrap: 'anywhere', maxWidth: '32ch', my: 1 }}
            >
              {data?.event?.title || 'No Daily Doji occurrence returned'}
            </Typography>
            {data?.event && (
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Scheduled for{' '}
                {new Date(data.event.firesAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Typography>
            )}
            {data && (
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
                Last checked {new Date(data.checkedAt).toLocaleString()} · snapshot, not a live
                status
              </Typography>
            )}
          </>
        )}
        <Box sx={{ mt: 'auto', pt: 2 }}>
          <Button component={Link} to="/operations" endIcon={<ArrowForwardOutlined />}>
            Open platform health
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}
