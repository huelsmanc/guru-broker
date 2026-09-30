import { Navigate, useSearchParams } from 'react-router-dom';

// Old signing links (/custom-sign?token=...) now open the one signing page.
// The previous version of this page read every signing request from the browser.
export default function CustomSign() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  return <Navigate to={`/sign?token=${encodeURIComponent(token)}`} replace />;
}
