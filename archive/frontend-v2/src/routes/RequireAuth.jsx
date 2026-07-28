import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { getCurrentUser } from '../lib/auth.js';

export default function RequireAuth() {
  const user = getCurrentUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
