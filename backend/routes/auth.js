const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { auth } = require('../middleware/auth');

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ where: { username } });
    if (!user) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ user: { id: user.id, username: user.username, role: user.role, permissions: user.permissions }, token });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
