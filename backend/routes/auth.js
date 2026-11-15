const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const { record } = require('../utils/audit');
const loginGuard = require('../utils/loginGuard');

const MIN_PASSWORD = 8;
const TOKEN_LIFETIME = process.env.TOKEN_LIFETIME || '12h';
// compared against when the user name does not exist, so a wrong name and a wrong password take the same time
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// sign-in attempts are part of the audit trail; a logging failure must not block the login
const logLogin = async (action, who, req) => {
  try { await record({ action, entity: 'User', entity_id: who.user_id, label: who.username, username: who.username, user_id: who.user_id, ip: req.ip }); }
  catch (err) { console.error('audit log failed:', err.message); }
};

router.post('/login', async (req, res) => {
  try {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) return res.status(400).json({ error: 'أدخل اسم المستخدم وكلمة المرور' });

    const blocked = loginGuard.check(req.ip, username);
    if (blocked) {
      res.set('Retry-After', String(blocked.retryAfterSec));
      return res.status(429).json({ error: `محاولات دخول كثيرة. حاول بعد ${Math.max(1, Math.ceil(blocked.retryAfterSec / 60))} دقيقة` });
    }

    const user = await User.findOne({ where: { username } });
    const valid = user ? await bcrypt.compare(password, user.password) : (await bcrypt.compare(password, DUMMY_HASH), false);
    // a switched-off user gets the same answer as a wrong password
    if (!valid || !user.is_active) {
      loginGuard.recordFailure(req.ip, username);
      await logLogin('login_failed', { username: username.slice(0, 100), user_id: user?.id ?? null }, req);
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    loginGuard.recordSuccess(req.ip, username);
    await logLogin('login', { username: user.username, user_id: user.id }, req);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: TOKEN_LIFETIME });
    res.json({ user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions }, token });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const current_password = typeof req.body?.current_password === 'string' ? req.body.current_password : '';
    const new_password = typeof req.body?.new_password === 'string' ? req.body.new_password : '';
    if (new_password.length < MIN_PASSWORD) return res.status(400).json({ error: `كلمة المرور الجديدة لازم تكون ${MIN_PASSWORD} حروف على الأقل` });
    const user = await User.findByPk(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    user.password = await bcrypt.hash(new_password, 10);
    // every token issued before this moment stops working (a stolen or forgotten session ends here)
    user.password_changed_at = new Date();
    await user.save();
    res.json({ message: 'تم تغيير كلمة المرور' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;
module.exports.MIN_PASSWORD = MIN_PASSWORD;
