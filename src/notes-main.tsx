import React from 'react';
import { createRoot } from 'react-dom/client';
import Notes from './Notes';
import './popup.css';

// A simple wrapper to keep things clean
function PopupApp() {
  return <Notes onNotesChange={() => {}} />;
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