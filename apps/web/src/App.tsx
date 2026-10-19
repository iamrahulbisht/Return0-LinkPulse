import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Loading } from './components/ui';
import { AppLayout } from './layouts/AppLayout';
import { RequireAdmin, RequireAuth } from './routes/guards';
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));
const Login = lazy(() => import('./pages/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const Links = lazy(() => import('./pages/Links').then((m) => ({ default: m.Links })));
const CreateLink = lazy(() => import('./pages/CreateLink').then((m) => ({ default: m.CreateLink })));
const LinkDetails = lazy(() => import('./pages/LinkDetails').then((m) => ({ default: m.LinkDetails })));
const Campaigns = lazy(() => import('./pages/Campaigns').then((m) => ({ default: m.Campaigns })));
const QrCodes = lazy(() => import('./pages/QrCodes').then((m) => ({ default: m.QrCodes })));
const BulkImport = lazy(() => import('./pages/BulkImport').then((m) => ({ default: m.BulkImport })));
const BioPages = lazy(() => import('./pages/BioPages').then((m) => ({ default: m.BioPages })));
const PublicBio = lazy(() => import('./pages/PublicBio').then((m) => ({ default: m.PublicBio })));
const Admin = lazy(() => import('./pages/Admin').then((m) => ({ default: m.Admin })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminUserDetail = lazy(() => import('./pages/AdminUserDetail').then((m) => ({ default: m.AdminUserDetail })));
const BrandGuide = lazy(() => import('./pages/BrandGuide').then((m) => ({ default: m.BrandGuide })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));
const Workspaces = lazy(() => import('./pages/Workspaces').then((m) => ({ default: m.Workspaces })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

// Each page is its own chunk, so a visitor opening the landing page or a bio page does not
// download the charts library used by the dashboard.
export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/b/:slug" element={<PublicBio />} />
        <Route path="/brand" element={<BrandGuide />} />
        {/* The wizard has its own full-width header (no sidebar), like create-link.html. */}
        <Route
          path="/links/new"
          element={
            <RequireAuth>
              <CreateLink />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/links" element={<Links />} />
          <Route path="/links/:id" element={<LinkDetails />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/qr" element={<QrCodes />} />
          <Route path="/import" element={<BulkImport />} />
          <Route path="/bio" element={<BioPages />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/workspaces" element={<Workspaces />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAdmin>
                <AdminUsers />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/users/:id"
            element={
              <RequireAdmin>
                <AdminUserDetail />
              </RequireAdmin>
            }
          />
        </Route>
        <Route path="/app" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
