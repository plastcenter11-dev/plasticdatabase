require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { sequelize, User } = require('./models');
const { auth } = require('./middleware/auth');

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', auth, require('./routes/items'));
app.use('/api/warehouses', auth, require('./routes/warehouses'));
app.use('/api/customers', auth, require('./routes/customers'));
app.use('/api/suppliers', auth, require('./routes/suppliers'));
app.use('/api/sales-orders', auth, require('./routes/salesOrders'));
app.use('/api/delivery-notes', auth, require('./routes/deliveryNotes'));
app.use('/api/sales-invoices', auth, require('./routes/salesInvoices'));
app.use('/api/purchase-invoices', auth, require('./routes/purchaseInvoices'));
app.use('/api/returns', auth, require('./routes/returns'));
app.use('/api/finance', auth, require('./routes/finance'));
app.use('/api/stock', auth, require('./routes/stock'));
app.use('/api', auth, require('./routes/settings'));

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');
    await sequelize.sync();
    console.log('Tables synced');

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
