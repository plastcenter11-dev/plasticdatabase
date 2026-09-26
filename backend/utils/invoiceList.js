const { Op } = require('sequelize');

// Optional server-side paging for the invoice lists. Without ?page the
// caller still gets the full array (other screens rely on that); with it,
// returns { rows, total, page, pages }. Search matches invoice number or the
// party name. Ids are picked first (party join is one-to-one, so limit is
// safe) and the items are loaded only for that page.
async function listInvoices(req, { Invoice, Party, ItemModel, extra = [] }) {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  const partyInclude = { model: Party, attributes: ['id', 'name'] };
  const itemsInclude = { model: ItemModel, as: 'items', include: [{ model: require('../models').Item, attributes: ['id', 'code', 'name'] }] };
  if (!req.query.page) {
    return Invoice.findAll({ where, include: [partyInclude, ...extra, itemsInclude], order: [['id', 'DESC']] });
  }
  const size = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  if (req.query.search) {
    const like = `%${req.query.search}%`;
    where[Op.or] = [{ invoice_no: { [Op.like]: like } }, { [`$${Party.name}.name$`]: { [Op.like]: like } }];
  }
  const { rows: idRows, count } = await Invoice.findAndCountAll({
    where, include: [{ ...partyInclude, required: false }], attributes: ['id'],
    order: [['id', 'DESC']], limit: size, offset: (page - 1) * size, distinct: true, subQuery: false,
  });
  const ids = idRows.map(r => r.id);
  const rows = ids.length ? await Invoice.findAll({ where: { id: ids }, include: [partyInclude, ...extra, itemsInclude], order: [['id', 'DESC']] }) : [];
  return { rows, total: count, page, pages: Math.max(Math.ceil(count / size), 1) };
}

module.exports = { listInvoices };
