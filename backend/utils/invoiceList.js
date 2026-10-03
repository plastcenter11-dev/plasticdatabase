const { Op } = require('sequelize');

// Server-side filtering, sorting and paging for the invoice lists. Without
// ?page the caller still gets the full array (other screens rely on that);
// with it, returns { rows, total, page, pages }.
//
// Filters: status, from/to (invoice date), party_id, employee_id (sales only),
// remaining=open|paid, search (invoice number or party name).
// Sort: sort=invoice_no|date|party|total|paid|remaining|status, dir=asc|desc.
//
// Ids are picked first (the party join is one-to-one, so limit is safe) and the
// items are loaded only for that page, then put back in the picked order.
async function listInvoices(req, { Invoice, Party, ItemModel, partyKey, extra = [] }) {
  const { Item, sequelize } = require('../models');
  const q = req.query;

  const where = {};
  if (q.status) where.status = q.status;
  if (q.from || q.to) {
    where.date = {};
    if (q.from) where.date[Op.gte] = q.from;
    if (q.to) where.date[Op.lte] = q.to;
  }
  if (q.party_id) where[partyKey] = Number(q.party_id);
  if (q.employee_id && Invoice.rawAttributes.employee_id) where.employee_id = Number(q.employee_id);
  if (q.remaining === 'open') where.remaining = { [Op.gt]: 0 };
  else if (q.remaining === 'paid') where.remaining = { [Op.lte]: 0 };

  const dir = q.dir === 'desc' ? 'DESC' : 'ASC';
  const SORTS = {
    // Invoice numbers are free text ("33", "SI-000012"); shorter first, then
    // alphabetical, keeps "9" before "10" within the same style of number.
    invoice_no: () => [[sequelize.fn('LENGTH', sequelize.col(`${Invoice.name}.invoice_no`)), dir], ['invoice_no', dir]],
    date: () => [['date', dir]],
    total: () => [['total', dir]],
    paid: () => [['paid', dir]],
    remaining: () => [['remaining', dir]],
    status: () => [['status', dir]],
    party: () => [[Party, 'name', dir]],
  };
  const order = [...(SORTS[q.sort] ? SORTS[q.sort]() : []), ['id', 'DESC']];

  const partyInclude = { model: Party, attributes: ['id', 'name'] };
  const itemsInclude = { model: ItemModel, as: 'items', include: [{ model: Item, attributes: ['id', 'code', 'name'] }] };

  if (!q.page) {
    return Invoice.findAll({ where, include: [partyInclude, ...extra, itemsInclude], order });
  }

  const size = Math.min(Math.max(parseInt(q.limit, 10) || 25, 1), 200);
  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  if (q.search) {
    const like = `%${q.search}%`;
    where[Op.or] = [{ invoice_no: { [Op.like]: like } }, { [`$${Party.name}.name$`]: { [Op.like]: like } }];
  }
  const { rows: idRows, count } = await Invoice.findAndCountAll({
    where, include: [{ ...partyInclude, required: false }], attributes: ['id'],
    order, limit: size, offset: (page - 1) * size, distinct: true, subQuery: false,
  });
  const ids = idRows.map(r => r.id);
  const found = ids.length ? await Invoice.findAll({ where: { id: ids }, include: [partyInclude, ...extra, itemsInclude] }) : [];
  const byId = new Map(found.map(r => [r.id, r]));
  const rows = ids.map(id => byId.get(id)).filter(Boolean);
  return { rows, total: count, page, pages: Math.max(Math.ceil(count / size), 1) };
}

module.exports = { listInvoices };
