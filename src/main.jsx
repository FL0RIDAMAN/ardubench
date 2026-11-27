import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { getTheme, applyTheme } from './theme.js';

// Set the theme before the first paint so the page doesn't flash.
applyTheme(getTheme());

createRoot(document.getElementById('root')).render(<App />);
