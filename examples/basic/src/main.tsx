import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'galaxy-nodes/styles.css';
import './example.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
