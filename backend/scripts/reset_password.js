// Sets a new password for a user straight in the database - for when the admin password is lost.
// Run on the server computer, from the backend folder:
//
//   node scripts/reset_password.js NewPassword123            (the user "admin")
//   node scripts/reset_password.js NewPassword123 someuser   (another user)
//
// The password must be at least 8 characters. Everybody signed in as that user is signed out, and the
// sign-in lockout (which lives in the server's memory) is cleared by restarting the server.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('../models');

const MIN_PASSWORD = 8;

(async () => {
  const [password, username = 'admin'] = process.argv.slice(2);
  if (!password) {
    console.log('Usage: node scripts/reset_password.js <new password> [user name, default admin]');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD) {
    console.error(`The password must be at least ${MIN_PASSWORD} characters.`);
    process.exit(1);
  }
  try {
    const user = await User.findOne({ where: { username } });
    if (!user) {
      const all = (await User.findAll({ attributes: ['username'] })).map(u => u.username).join(', ');
      console.error(`There is no user "${username}". Users in this database: ${all || '(none)'}`);
      process.exit(1);
    }
    user.password = await bcrypt.hash(password, 10);
    user.password_changed_at = new Date();
    if (user.is_active === false) user.is_active = true;
    await user.save();
    console.log(`Done: "${username}" can sign in with the new password.`);
    console.log('If the server refuses because of too many attempts, restart the server (or wait 15 minutes).');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
