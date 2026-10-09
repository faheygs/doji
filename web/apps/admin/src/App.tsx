import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Alert } from '@mui/material';
import { PageHeader, TableFrame, WorkspaceShell } from '@doji/ui';
import { destinations, destinationFor } from './navigation';
import { Overview } from './Overview';

const AnnouncementsPreview = lazy(() =>
  import('./AnnouncementsPreview').then((m) => ({ default: m.AnnouncementsPreview })),
);
const AnnouncementForm = lazy(() =>
  import('./AnnouncementForm').then((m) => ({ default: m.AnnouncementForm })),
);
const QueuePreview = lazy(() =>
  import('./QueuePreview').then((m) => ({ default: m.QueuePreview })),
);
const RecordPreview = lazy(() =>
  import('./RecordPreview').then((m) => ({ default: m.RecordPreview })),
);
const PlatformPreview = lazy(() =>
  import('./PlatformPreview').then((m) => ({ default: m.PlatformPreview })),
);
const TeamPreview = lazy(() => import('./TeamPreview').then((m) => ({ default: m.TeamPreview })));
const queueAreas = destinations.filter(
  (area) =>
    !['/', '/announcements', '/operations', '/sponsored-dojis', '/team'].includes(area.path),
);

export function App() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const area = destinationFor(pathname);
  return (
    <WorkspaceShell
      brand="Doji Admin"
      title={area?.label ?? 'Page not found'}
      activePath={pathname}
      destinations={destinations}
      navigate={navigate}
    >
      <Suspense fallback={<TableFrame label="page" state="loading" footer={null} />}>
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/team" element={<TeamPreview />} />
          {queueAreas.map((item) => (
            <Route
              key={item.path}
              path={item.path}
              element={<QueuePreview key={item.path} area={item} />}
            />
          ))}
          {queueAreas.map((item) => (
            <Route
              key={item.path + '/:id'}
              path={item.path + '/:id'}
              element={<RecordPreview area={item} />}
            />
          ))}
          <Route path="/operations" element={<PlatformPreview />} />
          <Route
            path="/overview/external/:id"
            element={
              <RecordPreview area={destinations.find((item) => item.path === '/trust-safety')!} />
            }
          />
          <Route path="/announcements" element={<AnnouncementsPreview />} />
          <Route path="/announcements/new" element={<AnnouncementForm />} />
          <Route
            path="/sponsored-dojis"
            element={
              <>
                <PageHeader title="Sponsored Dojis" description="Campaign review belongs here." />
                <Alert severity="info">
                  Sponsorship review is not connected. Publishing and billing remain disabled.
                </Alert>
              </>
            }
          />
          <Route
            path="*"
            element={
              <PageHeader
                title="Page not found"
                description="Choose a workspace from the navigation."
              />
            }
          />
        </Routes>
      </Suspense>
    </WorkspaceShell>
  );
}
