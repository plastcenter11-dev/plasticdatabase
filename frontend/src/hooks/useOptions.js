import { useState, useEffect } from 'react';
import api from '../api/axios';

// The system options saved from the settings screen ('1' = on). Defaults match
// the backend's utils/settings.js so the screens behave before the first load.
const DEFAULTS = { opt_credit_no_limit: '1', opt_auto_tax: '1', opt_block_below_cost: '0', opt_auto_numbering: '1', opt_require_approval: '0', protect_until: '' };

export const isOn = (v) => v === '1' || v === 'true' || v === true;

export function useOptions() {
  const [options, setOptions] = useState(DEFAULTS);
  useEffect(() => {
    let live = true;
    api.get('/options').then(r => { if (live) setOptions({ ...DEFAULTS, ...r.data }); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return { options, autoTaxRate: isOn(options.opt_auto_tax) ? 14 : 0, typedNumber: !isOn(options.opt_auto_numbering), needsApproval: isOn(options.opt_require_approval) };
}
