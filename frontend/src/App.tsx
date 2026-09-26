import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import UploadPage from './pages/UploadPage';
import ListPage from './pages/ListPage';
import DetailPage from './pages/DetailPage';

export default function App() {
  return (
    <>
      <header className="app-header">
        <div className="brand">
          Surety<span>Seven</span> · Docs
        </div>
        <nav>
          <NavLink to="/" end>
            Upload
          </NavLink>
          <NavLink to="/documents">Documents</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/documents" element={<ListPage />} />
        <Route path="/documents/:id" element={<DetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
