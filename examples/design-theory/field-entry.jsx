import React from 'react';
import { createRoot } from 'react-dom/client';
import FieldSession from './FieldSession.jsx';

function FieldWorkspace() {
  return (
    <div
      style={{
        fontFamily: 'TheorySans,Arial,sans-serif',
        background: '#171b18',
        color: '#f2f0e6',
        '--paper': '#f2f0e6',
        '--ink': '#171b18',
        '--signal': '#d8f42c',
        '--accent': '#d8f42c',
      }}
    >
      <a className="skip-link" href="#field-session">
        Skip to comparison
      </a>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          padding: '20px max(20px,5vw)',
          borderBottom: '1px solid #ffffff44',
        }}
      >
        <a
          href="../"
          data-field-return
          style={{ textDecoration: 'none', paddingBlock: 10 }}
        >
          ← Back to Design Theory
        </a>
        <span style={{ fontSize: 12 }}>Design field / saved exploration</span>
      </header>
      <main>
        <FieldSession />
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')).render(<FieldWorkspace />);
