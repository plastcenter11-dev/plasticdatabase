require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./models');
const { applySchemaPatches } = require('./utils/schemaPatches');
const app = require('./app');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync();
    console.log('Tables synced');
    const addedColumns = await applySchemaPatches(sequelize);
    if (addedColumns.length) console.log('Added columns:', addedColumns.join(', '));

    const adminExists = await User.findOne({ where: { username: 'admin' } });
    if (!adminExists) {
      await User.create({ username: 'admin', password: await bcrypt.hash('admin', 10), role: 'admin' });
      console.log('Admin user created (admin/admin)');
    }

    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start:', err.message);
  }
}

start();
