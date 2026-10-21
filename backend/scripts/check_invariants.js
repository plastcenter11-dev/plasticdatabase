// Read-only health check of the configured database: runs the accounting and
// stock invariants (utils/invariants.js) and prints every violation.
//
//   node scripts/check_invariants.js            # readable report
//   node scripts/check_invariants.js --json     # machine-readable
//
// Exit code 1 when any error-level violation is found (warnings do not fail it).
// It never writes: the only requests it makes are GETs through the same route
// handlers the app uses.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const request = require('supertest');
const models = require('../models');
const { checkInvariants } = require('../utils/invariants');

(async () => {
  const asJson = process.argv.includes('--json');
  const app = express();
  app.use(express.json());
  app.use('/api/customers', require('../routes/customers'));
  app.use('/api/suppliers', require('../routes/suppliers'));
  const getJson = async (url) => {
    const res = await request(app).get(url);
    if (res.status !== 200) throw new Error(`GET ${url} returned ${res.status}`);
    return res.body;
  };

  const results = await checkInvariants({ models, sequelize: models.sequelize, getJson });
  const errors = results.reduce((n, r) => n + r.violations.filter(v => v.severity === 'error').length, 0);
  const warnings = results.reduce((n, r) => n + r.violations.filter(v => v.severity === 'warning').length, 0);

  if (asJson) {
    console.log(JSON.stringify({ database: models.sequelize.config.database, errors, warnings, results }, null, 2));
  } else {
    console.log(`فحص الثوابت المحاسبية - قاعدة البيانات: ${models.sequelize.config.database}\n`);
    for (const r of results) {
      const e = r.violations.filter(v => v.severity === 'error').length;
      const w = r.violations.length - e;
      const mark = e ? '✗' : (w ? '!' : '✓');
      console.log(`${mark} ${r.title}  (فُحص ${r.examined}${e ? `، أخطاء ${e}` : ''}${w ? `، تنبيهات ${w}` : ''})`);
      r.violations.forEach(v => console.log(`    ${v.severity === 'error' ? '✗' : '!'} ${v.message}`));
    }
    console.log(`\nالنتيجة: ${errors} خطأ، ${warnings} تنبيه`);
  }
  await models.sequelize.close();
  process.exit(errors ? 1 : 0);
})().catch(async (e) => {
  console.error('تعذّر تنفيذ الفحص:', e.message);
  try { await models.sequelize.close(); } catch { /* already closed */ }
  process.exit(2);
});
