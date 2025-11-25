import React from 'react';
import { createRoot } from 'react-dom/client';
import Notes from './Notes';
import './popup.css';

function PopupApp() {
  return <Notes />;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>
  );
}