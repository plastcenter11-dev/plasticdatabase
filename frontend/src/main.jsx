import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import './index.css'
import App from './App.jsx'

// Every form in the app has only a single explicit "حفظ" button, so a text
// input's native Enter-submits-the-form behavior does more harm than good:
// it saves the form the moment the user hits Enter mid-entry (e.g. after
// typing a code and tabbing between fields), before they've finished the
// rest of the fields. Block it globally for plain text-like inputs; leave
// buttons, checkboxes, and SearchableSelect's own dropdown navigation alone
// (it already calls preventDefault for its own Enter handling).
const TEXT_LIKE_TYPES = new Set(['text', 'number', 'search', 'email', 'tel', 'url', 'date', '']);
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  if (!TEXT_LIKE_TYPES.has(el.type)) return;
  e.preventDefault();
}, true);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <ToastContainer position="top-left" rtl autoClose={3000} />
    </BrowserRouter>
  </StrictMode>,
)
