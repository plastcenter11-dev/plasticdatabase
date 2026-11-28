'use strict';

// The accounting integrity test, run from inside the program (admin only, see app.js). It only reads: the same
// checks as the daily job (utils/invariants.js) - balances against documents and statements, invoice arithmetic,
// payments on invoices, stock against movements, documents against stock movements, dangling records.

const router = require('express').Router();
const models = require('../models');
const { checkInvariants } = require('../utils/invariants');
const { describeError, errorStatus } = require('../utils/errors');

// The balance checks compare the stored balance with what the customer / supplier screens themselves report, so
// they ask those same route handlers, inside this process (no network request is made, nothing is exposed).
const SOURCES = { customers: require('./customers'), suppliers: require('./suppliers') };

function getJson(url) {
  const [, , name, ...rest] = url.split('/');          // '/api/<name>/<rest>'
  return new Promise((resolve, reject) => {
    const req = { method: 'GET', url: `/${rest.join('/')}`, originalUrl: url, baseUrl: '', headers: {}, query: {}, params: {} };
    let code = 200;
    const res = {
      status(c) { code = c; return this; },
      json(body) {
        if (code === 200) resolve(JSON.parse(JSON.stringify(body)));
        else reject(new Error(`${url}: ${body?.error || code}`));
        return this;
      },
    };
    SOURCES[name].handle(req, res, (err) => reject(err || new Error(`unknown address ${url}`)));
  });
}

const SHOWN = 100;   // problems listed per check; the count is always the full one
let running = false; // one test at a time: it reads a lot

router.get('/', async (req, res) => {
  if (running) return res.status(409).json({ error: 'الفحص شغال بالفعل، انتظر حتى ينتهي' });
  running = true;
  try {
    const started = Date.now();
    const results = await checkInvariants({ models, sequelize: models.sequelize, getJson });
    const count = (severity) => results.reduce((n, r) => n + r.violations.filter(v => v.severity === severity).length, 0);
    res.json({
      checked_at: new Date().toISOString(),
      seconds: Math.round((Date.now() - started) / 100) / 10,
      errors: count('error'),
      warnings: count('warning'),
      results: results.map(r => ({
        code: r.code, title: r.title, examined: r.examined,
        errors: r.violations.filter(v => v.severity === 'error').length,
        warnings: r.violations.filter(v => v.severity === 'warning').length,
        // errors first, so a long list of warnings never pushes an error out of sight
        violations: [...r.violations].sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1)).slice(0, SHOWN),
      })),
    });
  } catch (err) {
    res.status(errorStatus(err)).json({ error: describeError(err) });
  } finally {
    running = false;
  }
});

module.exports = router;
