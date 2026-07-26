const router = require('express').Router();
const { SalesInvoice, SalesInvoiceItem, Customer, Employee, Item, Stock, StockMovement } = require('../models');

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    res.json(await SalesInvoice.findAll({ where, include: [{ model: Customer, attributes: ['id', 'name'] }, { model: Employee, attributes: ['id', 'name'] }, { model: SalesInvoiceItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }], order: [['id', 'DESC']] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [Customer, Employee, { model: SalesInvoiceItem, as: 'items', include: [Item] }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    res.json(inv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { items, ...data } = req.body;
    const max = await SalesInvoice.max('id') || 0;
    data.invoice_no = data.invoice_no || `SI-${String(max + 1).padStart(6, '0')}`;
    const inv = await SalesInvoice.create(data);
    if (items?.length) await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    res.status(201).json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    const { items, ...data } = req.body;
    if (items) {
      await SalesInvoiceItem.destroy({ where: { invoice_id: inv.id } });
      await SalesInvoiceItem.bulkCreate(items.map(i => ({ ...i, invoice_id: inv.id })));
    }
    await inv.update(data);
    res.json(await SalesInvoice.findByPk(inv.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/post', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id, { include: [{ model: SalesInvoiceItem, as: 'items' }] });
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    if (inv.status === 'posted') return res.status(400).json({ error: 'الفاتورة مرحّلة مسبقاً' });

    // Check stock availability before posting
    if (inv.warehouse_id) {
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id);
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;
        const stock = await Stock.findOne({ where: { item_id: item.item_id, warehouse_id: inv.warehouse_id } });
        const available = stock ? Number(stock.quantity) : 0;
        if (available < qty) {
          return res.status(400).json({ error: `الكمية المتاحة من "${fullItem.name}" (${available}) أقل من الكمية المطلوبة (${qty})` });
        }
      }
    }

    await inv.update({ status: 'posted' });

    // Decrement stock for each item
    if (inv.warehouse_id) {
      for (const item of (inv.items || [])) {
        const fullItem = await Item.findByPk(item.item_id);
        if (!fullItem?.is_stockable) continue;
        const qty = Number(item.quantity || 0);
        if (qty <= 0) continue;
        const wt = Number(item.weight || 0);
        const [stock] = await Stock.findOrCreate({
          where: { item_id: item.item_id, warehouse_id: inv.warehouse_id },
          defaults: { quantity: 0, weight: 0 },
        });
        await stock.update({ quantity: Number(stock.quantity) - qty, weight: Number(stock.weight || 0) - wt });
        await fullItem.update({ sale_price: Number(item.price || 0) });
        await StockMovement.create({
          item_id: item.item_id, warehouse_id: inv.warehouse_id,
          movement_type: 'فاتورة بيع', quantity: qty, weight: wt,
          unit_price: Number(item.price || 0), date: inv.date,
          description: `فاتورة بيع ${inv.invoice_no}`, reference: inv.invoice_no,
        });
      }
    }

    res.json({ message: 'تم الترحيل' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const inv = await SalesInvoice.findByPk(req.params.id);
    if (!inv) return res.status(404).json({ error: 'غير موجود' });
    await inv.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    await SalesInvoice.destroy({ where: { id: ids } });
    res.json({ message: `تم حذف ${ids.length} فاتورة` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
