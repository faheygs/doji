import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import ArrowForwardOutlined from '@mui/icons-material/ArrowForwardOutlined';
import { Link } from 'react-router-dom';
import { PageHeader, WorkspaceIcon, type WorkspaceDestination } from '@doji/ui';
import type { EmployeeOperator } from '@doji/portal-data/employee';
import type { WorkRow } from '@doji/portal-data/employee-queues';
import { workLabels, workPath } from './connected/WorkTable';
import { HomeDojiCard, type HomeDojiProps } from './HomeDojiCard';

const quickLinks = [
  ['/businesses', 'Business applications'],
  ['/community-ideas', 'Community ideas'],
  ['/trust-safety', 'Trust & safety'],
  ['/operations', 'Platform health'],
  ['/team', 'Team & access'],
] as const;

export function OverviewPanel({
  actor,
  destinations,
  rows,
  state,
  more = false,
  retry,
  doji,
}: {
  actor: EmployeeOperator;
  destinations: readonly WorkspaceDestination[];
  rows: WorkRow[];
  state: 'ready' | 'loading' | 'error' | 'denied';
  more?: boolean;
  retry?: () => void;
  doji?: HomeDojiProps | undefined;
}) {
  const can = (path: string) => destinations.some((item) => item.path === path);
  const available = state === 'ready' ? rows : [];
  const overdue = (row: WorkRow) => !!row.due_at && Date.parse(row.due_at) < Date.now();
  const attention = available
    .filter((row) => overdue(row) || !row.assigned_to)
    .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || Date.parse(a.at) - Date.parse(b.at))
    .slice(0, 4);
  const counts = [
    ['Past review target', available.filter(overdue).length, 'error'],
    ['Need an owner', available.filter((row) => !row.assigned_to).length, 'warning'],
    [
      'Assigned to you',
      available.filter((row) => row.assigned_to === actor.user_id).length,
      'primary',
    ],
  ] as const;
  return (
    <Stack sx={{ gap: 3 }}>
      <PageHeader
        title={`Welcome back, ${actor.display_name}.`}
        description="Here’s what’s happening at Doji."
        action={
          can('/my-work') && (
            <Button
              component={Link}
              to="/my-work"
              variant="contained"
              endIcon={<ArrowForwardOutlined />}
            >
              Open my work
            </Button>
          )
        }
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.4fr) minmax(320px, 1fr)' },
          gap: 3,
          alignItems: 'start',
        }}
      >
        <Stack sx={{ gap: 3, minWidth: 0 }}>
          {doji && <HomeDojiCard {...doji} />}
          {state !== 'denied' && (
            <Box component="section" aria-labelledby="work-snapshot-title">
              <Stack
                direction="row"
                sx={{ alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1.5 }}
              >
                <Typography id="work-snapshot-title" component="h2" variant="h6">
                  Work snapshot
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Oldest 25 open items
                </Typography>
              </Stack>
              <Paper
                variant="outlined"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
                }}
              >
                {counts.map(([label, count, color]) => (
                  <Box key={label} sx={{ p: 2.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      {label}
                    </Typography>
                    {state === 'loading' ? (
                      <Skeleton width={48} height={48} />
                    ) : (
                      <Typography
                        variant="h4"
                        component="p"
                        sx={{
                          mt: 1,
                          color: count ? color + '.main' : 'text.primary',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {state === 'ready' ? count : '—'}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Paper>
              <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
                Your accessible snapshot, not organization-wide totals.
              </Typography>
            </Box>
          )}
        </Stack>
        <Stack sx={{ gap: 3, minWidth: 0 }}>
          <Card variant="outlined" component="section" aria-labelledby="attention-title">
            <CardContent sx={{ p: 3 }}>
              <Typography id="attention-title" component="h2" variant="h6">
                Needs attention
              </Typography>
              {state === 'loading' ? (
                <Stack aria-label="Loading attention items" sx={{ mt: 2 }}>
                  <Skeleton height={60} />
                  <Skeleton height={60} />
                </Stack>
              ) : state === 'error' ? (
                <Alert
                  severity="warning"
                  sx={{ mt: 2 }}
                  action={<Button onClick={retry}>Retry intake</Button>}
                >
                  Attention items could not be loaded.
                </Alert>
              ) : state === 'denied' ? (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                  Your available tools are in Quick access.
                </Typography>
              ) : attention.length ? (
                <List disablePadding aria-label="Items needing attention" sx={{ mt: 1 }}>
                  {attention.map((row) => {
                    const path = workPath(row, 'overview', actor);
                    const content = (
                      <>
                        <ListItemText
                          primary={row.subject}
                          secondary={workLabels[row.kind]}
                          slotProps={{
                            primary: { sx: { overflowWrap: 'anywhere', fontWeight: 500 } },
                          }}
                        />
                        <Chip
                          size="small"
                          variant="outlined"
                          color={overdue(row) ? 'error' : 'warning'}
                          label={overdue(row) ? 'Past target' : 'Unassigned'}
                        />
                      </>
                    );
                    return (
                      <ListItem key={row.key} disablePadding={!!path} divider>
                        {path ? (
                          <ListItemButton
                            component={Link}
                            to={path}
                            sx={{ px: 0, gap: 2, flexWrap: 'wrap' }}
                          >
                            {content}
                          </ListItemButton>
                        ) : (
                          content
                        )}
                      </ListItem>
                    );
                  })}
                </List>
              ) : (
                <Typography color="text.secondary" sx={{ mt: 2 }}>
                  No overdue or unassigned items in this snapshot.
                </Typography>
              )}
              {state === 'ready' &&
                (more ||
                  attention.length <
                    available.filter((row) => overdue(row) || !row.assigned_to).length) && (
                  <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 2 }}>
                    More work is available in the individual queues.
                  </Typography>
                )}
            </CardContent>
          </Card>
          <Card variant="outlined" component="section" aria-labelledby="quick-access-title">
            <CardContent sx={{ p: 3, pb: 2 }}>
              <Typography id="quick-access-title" component="h2" variant="h6">
                Quick access
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Jump into your workspace.
              </Typography>
            </CardContent>
            <Divider />
            <List sx={{ p: 1 }}>
              {quickLinks
                .filter(([path]) => can(path))
                .map(([path, title]) => (
                  <ListItem key={path} disablePadding>
                    <ListItemButton
                      component={Link}
                      to={path}
                      aria-label={`Open ${title}`}
                      sx={{ gap: 1.5, py: 1.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 28, color: 'primary.main' }}>
                        <WorkspaceIcon path={path} />
                      </ListItemIcon>
                      <ListItemText primary={title} />
                      <ArrowForwardOutlined fontSize="small" color="action" />
                    </ListItemButton>
                  </ListItem>
                ))}
            </List>
          </Card>
        </Stack>
      </Box>
    </Stack>
  );
}
