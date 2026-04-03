import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // This line "connects" your Tailwind styles to the app
import App from './App'; // This imports your WhatsApp UI logic

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);