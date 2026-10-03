import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import App from './App.jsx'
import { focusNextField } from './utils/enterNav'

// Every form in the app has only a single explicit "حفظ" button, so a field's
// native Enter-submits-the-form behavior does more harm than good: it saves
// the form the moment the user hits Enter mid-entry, before they've finished
// the rest of the fields. Enter in a field never submits; inside a form or
// modal it moves to the next field instead (Shift+Enter goes back), and after
// the last field it lands on the save button. SearchableSelect handles its own
// Enter (it picks the highlighted option, then advances itself).
const ENTER_TYPES = new Set(['text', 'number', 'search', 'email', 'tel', 'url', 'date', 'checkbox', 'radio', '']);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || !ENTER_TYPES.has(el.type)) return;
  e.preventDefault();
  if (el.classList.contains('erp-select')) return;
  focusNextField(el, e.shiftKey ? -1 : 1);
}, true);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer position="top-left" rtl autoClose={3000} />
    </BrowserRouter>
  </StrictMode>,
)
