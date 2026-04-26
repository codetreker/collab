import React from 'react';
import ReactDOM from 'react-dom/client';
import AdminApp from './AdminApp';
import { AdminAuthProvider } from './auth';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AdminAuthProvider>
      <AdminApp />
    </AdminAuthProvider>
  </React.StrictMode>,
);
