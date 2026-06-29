const router = require('express').Router();
const { DeliveryNote, DeliveryNoteItem, DeliveryNoteOrder, Customer, Item, SalesOrder } = require('../models');

router.get('/', async (req, res) => {
  try {
    res.json(await DeliveryNote.findAll({
      include: [{ model: Customer, attributes: ['id', 'name'] }, { model: DeliveryNoteItem, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] }, { model: SalesOrder, attributes: ['id', 'order_no'] }],
      order: [['id', 'DESC']],
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const n = await DeliveryNote.findByPk(req.params.id, { include: [Customer, { model: DeliveryNoteItem, as: 'items', include: [Item] }, SalesOrder] });
    if (!n) return res.status(404).json({ error: 'غير موجود' });
    res.json(n);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { items, linked_orders, ...data } = req.body;
    const count = await DeliveryNote.count();
    data.note_no = count + 1;
    const note = await DeliveryNote.create(data);
    if (items?.length) await DeliveryNoteItem.bulkCreate(items.map(i => ({ ...i, note_id: note.id })));
    if (linked_orders?.length) {
      await DeliveryNoteOrder.bulkCreate(linked_orders.map(orderId => ({ note_id: note.id, order_id: orderId })));
    }
    res.status(201).json(await DeliveryNote.findByPk(note.id, { include: [{ model: DeliveryNoteItem, as: 'items' }, SalesOrder] }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const note = await DeliveryNote.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'غير موجود' });
    await note.update(req.body);
    res.json(note);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/deliver', async (req, res) => {
  try {
    const note = await DeliveryNote.findByPk(req.params.id);
    if (!note) return res.status(404).json({ error: 'غير موجود' });
    const { invoice_no } = req.body;
    await note.update({ status: 'delivered', invoice_no: invoice_no || '' });
    res.json({ message: 'تم الترحيل', note });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const n = await DeliveryNote.findByPk(req.params.id);
    if (!n) return res.status(404).json({ error: 'غير موجود' });
    if (n.status === 'delivered') return res.status(400).json({ error: 'لا يمكن حذف إذن تم ترحيله' });
    await n.destroy();
    res.json({ message: 'تم الحذف' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
