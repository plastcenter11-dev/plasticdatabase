const router = require('express').Router();
const { describeError, errorStatus } = require('../utils/errors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { auth } = require('../middleware/auth');
const { record } = require('../utils/audit');

// sign-in attempts are part of the audit trail; a logging failure must not block the login
const logLogin = async (action, who, req) => {
  try { await record({ action, entity: 'User', entity_id: who.user_id, label: who.username, username: who.username, user_id: who.user_id, ip: req.ip }); }
  catch (err) { console.error('audit log failed:', err.message); }
};

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    const valid = user ? await bcrypt.compare(password, user.password) : false;
    if (!valid) {
      await logLogin('login_failed', { username: String(username || '').slice(0, 100), user_id: user?.id ?? null }, req);
      return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
    await logLogin('login', { username: user.username, user_id: user.id }, req);
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions }, token });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

router.post('/change-password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findByPk(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password);
    if (!valid) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    user.password = await bcrypt.hash(new_password, 10);
    await user.save();
    res.json({ message: 'تم تغيير كلمة المرور' });
  } catch (err) { res.status(errorStatus(err)).json({ error: describeError(err) }); }
});

module.exports = router;
