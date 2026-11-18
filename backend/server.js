require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize, User } = require('./models');
const { applySchemaPatches } = require('./utils/schemaPatches');
const app = require('./app');

const PORT = process.env.PORT || 3001;

// a signing secret that is short or guessable lets anyone mint their own login token
function checkSecret() {
  const s = process.env.JWT_SECRET || '';
  if (s.length >= 32 && !/^(secret|changeme|password)/i.test(s)) return;
  const msg = 'JWT_SECRET is missing or too weak: use at least 32 random characters (see deploy/README.md)';
  if (process.env.NODE_ENV === 'production') { console.error(msg); process.exit(1); }
  console.warn('WARNING: ' + msg);
}

// Right after the machine starts MySQL may still be getting ready (or answering very slowly). Instead of
// hanging or giving up, keep trying every few seconds and say so in the log; the branches simply wait.
async function connectWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      await Promise.race([
        sequelize.authenticate(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('no answer from the database within 20 s')), 20000)),
      ]);
      return;
    } catch (err) {
      console.error(`Waiting for the database (attempt ${attempt}): ${err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

async function start() {
  try {
    checkSecret();
    await connectWithRetry();
    console.log('Database connected');
    await sequelize.sync();
    console.log('Tables synced');
    const addedColumns = await applySchemaPatches(sequelize);
    if (addedColumns.length) console.log('Added columns:', addedColumns.join(', '));

    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      // never a well-known password on a server that faces the internet: use ADMIN_INITIAL_PASSWORD or a random one
      const initial = process.env.ADMIN_INITIAL_PASSWORD || crypto.randomBytes(9).toString('base64url');
      await User.create({ username: 'admin', password: await bcrypt.hash(initial, 10), role: 'admin' });
      console.log(process.env.ADMIN_INITIAL_PASSWORD
        ? 'Admin user created with the password from ADMIN_INITIAL_PASSWORD'
        : `Admin user created. Initial password (shown once, change it after signing in): ${initial}`);
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err.message);
    process.exit(1); // the scheduled task starts it again a minute later
  }
}

start();
