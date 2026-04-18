import React from 'react';

export default function App() {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <aside style={{ width: 240, background: '#1e1e2e', color: '#cdd6f4', padding: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Collab</h2>
        <p style={{ opacity: 0.6, fontSize: 14 }}>Channels will appear here</p>
      </aside>
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <p style={{ color: '#666' }}>Select a channel to start chatting</p>
      </main>
    </div>
  );
}
