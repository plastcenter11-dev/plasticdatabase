// Inventory logic and costing, against figures worked out by hand, through the real app.
// Tests named "RULE" check arithmetic the program must get right. Tests named "PROBE" record what the program does
// in cases that are a business decision (they assert today's behaviour, so a change to it is noticed).

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const models = require('../../models');
const { checkInvariants } = require('../../utils/invariants');
const { syncDb, truncateAll } = require('../helpers/db');
const { makeWarehouse, makeItem, makeCustomer, makeSupplier } = require('../helpers/fixtures');

const { sequelize, User, Stock, StockMovement, Item, Supplier, ItemAssembly } = models;

const SECRET = process.env.JWT_SECRET || 'secret';
let t, w1, w2, A, B, OUT, supplier, customer;
const as = () => ({ Authorization: `Bearer ${t}` });
const post = (url, body) => request(app).post(url).set(as()).send(body);
const put = (url, body) => request(app).put(url).set(as()).send(body);
const del = (url) => request(app).delete(url).set(as());
const probe = (name, value) => process.stdout.write(`PROBE ${name}: ${JSON.stringify(value)}\n`);

const cost = async (item) => Number((await Item.findByPk(item.id)).purchase_price);
const kg = async (item, wh = w1) => { const s = await Stock.findOne({ where: { item_id: item.id, warehouse_id: wh.id } }); return s ? Number(s.weight) : 0; };
const pcs = async (item, wh = w1) => { const s = await Stock.findOne({ where: { item_id: item.id, warehouse_id: wh.id } }); return s ? Number(s.quantity) : 0; };
const clean = async () => {
  const getJson = async (url) => (await request(app).get(url).set(as())).body;
  const res = await checkInvariants({ models, sequelize, getJson });
  return res.flatMap(r => r.violations.filter(v => v.severity === 'error').map(v => `[${r.code}] ${v.message}`));
};

async function buy(lines, header = {}, date = '2026-03-01') {
  const created = await post('/api/purchase-invoices', { supplier_id: supplier.id, warehouse_id: w1.id, date, tax_rate: 0, ...header, items: lines.map(l => ({ item_id: l.item.id, quantity: l.qty ?? 1, weight: l.kg ?? 0, price: l.price, discount: l.discount ?? 0 })) });
  expect(created.status).toBe(201);
  expect((await post(`/api/purchase-invoices/${created.body.id}/post`, {})).status).toBe(200);
  return created.body;
}
async function sell(item, weight, price = 50) {
  const created = await post('/api/sales-invoices', { customer_id: customer.id, warehouse_id: w1.id, date: '2026-03-05', tax_rate: 0, items: [{ item_id: item.id, quantity: 1, weight, price }] });
  return post(`/api/sales-invoices/${created.body.id}/post`, {});
}
const assemblyBody = (parts, outKg, extra = {}) => ({
  date: '2026-03-10', assembled_item_id: OUT.id, assembled_qty: 1, assembled_weight: outKg, warehouse_id: w1.id, output_warehouse_id: w1.id,
  components: parts.map(p => (p.expense ? { is_expense: true, quantity: p.qty, price: p.price } : { item_id: p.item.id, quantity: p.qty ?? 1, weight: p.kg, warehouse_id: w1.id })), ...extra,
});

beforeAll(async () => { await syncDb(); });
afterAll(async () => { await sequelize.close(); });
beforeEach(async () => {
  await truncateAll();
  const admin = await User.create({ username: 'boss', password: 'x', role: 'admin', permissions: {} });
  t = jwt.sign({ id: admin.id, role: admin.role }, SECRET);
  w1 = await makeWarehouse({ name: 'W1' });
  w2 = await makeWarehouse({ name: 'W2' });
  A = await makeItem({ name: 'خامة أ', purchase_price: 0, sale_price: 0 });
  B = await makeItem({ name: 'خامة ب', purchase_price: 0, sale_price: 0 });
  OUT = await makeItem({ name: 'منتج', purchase_price: 0, sale_price: 0 });
  supplier = await makeSupplier();
  customer = await makeCustomer();
});

describe('costing from purchases', () => {
  test('RULE the cost is the price per kg of the purchase, and stock goes up by the weight', async () => {
    await buy([{ item: A, kg: 100, price: 10 }]);
    expect(await cost(A)).toBe(10);
    expect(await kg(A)).toBe(100);
    expect(await clean()).toEqual([]);
  });

  test('PROBE a second purchase at another price: last price or average?', async () => {
    await buy([{ item: A, kg: 100, price: 10 }]);
    await buy([{ item: A, kg: 300, price: 20 }]);
    const result = await cost(A);
    probe('cost after 100kg@10 then 300kg@20 (weighted average would be 17.5)', result);
    expect(result).toBe(20);                       // last purchase price
    expect(await kg(A)).toBe(400);
  });

  test('RULE line discount, invoice discount and VAT are shared into the cost per kg', async () => {
    // 100kg x 20 less 10% = 1800; less 50 = 1750; VAT 14% = 245; total 1995
    const inv = await buy([{ item: A, kg: 100, price: 20, discount: 10 }], { discount: 50, tax_rate: 14 });
    expect(Number((await models.PurchaseInvoice.findByPk(inv.id)).total)).toBe(1995);
    expect(Number((await Supplier.findByPk(supplier.id)).balance)).toBe(1995);
    const result = await cost(A);
    probe('cost per kg with VAT 14% (without VAT it would be 17.50)', result);
    expect(result).toBe(19.95);                    // VAT is inside the cost
  });

  test('RULE discount and VAT are shared between lines in proportion to their value', async () => {
    // A 100kg x10 = 1000, B 100kg x30 = 3000; discount 400 -> 3600; VAT 14% = 504
    await buy([{ item: A, kg: 100, price: 10 }, { item: B, kg: 100, price: 30 }], { discount: 400, tax_rate: 14 });
    expect(await cost(A)).toBe(10.26);             // (1000 - 100 + 126) / 100
    expect(await cost(B)).toBe(30.78);             // (3000 - 300 + 378) / 100
  });

  test('PROBE an older-dated purchase posted later: which price wins?', async () => {
    await buy([{ item: A, kg: 10, price: 50 }], {}, '2026-04-01');
    await buy([{ item: A, kg: 10, price: 5 }], {}, '2026-01-01');
    const result = await cost(A);
    probe('cost after posting an April purchase @50 then a January one @5', result);
    expect(result).toBe(5);                        // the order of posting, not the date
  });

  test('PROBE a purchase return: stock and supplier balance move, the cost does not', async () => {
    await buy([{ item: A, kg: 100, price: 10 }]);
    await buy([{ item: A, kg: 100, price: 20 }]);
    const res = await post('/api/returns/purchase', { supplier_id: supplier.id, warehouse_id: w1.id, date: '2026-03-06', tax_rate: 0, items: [{ item_id: A.id, quantity: 1, weight: 100, price: 20 }] });
    expect(res.status).toBe(201);
    expect(await kg(A)).toBe(100);
    expect(Number((await Supplier.findByPk(supplier.id)).balance)).toBe(1000);
    probe('cost after returning the whole 20-per-kg purchase (what is left was bought @10)', await cost(A));
    expect(await cost(A)).toBe(20);
    expect(await clean()).toEqual([]);
  });

  test('PROBE an item counted by pieces only (no weight): cost per piece, and what the stock screen values it at', async () => {
    await buy([{ item: A, qty: 10, kg: 0, price: 7 }]);
    expect(await cost(A)).toBe(7);
    expect(await pcs(A)).toBe(10);
    probe('stock value shown for it (weight x cost; its weight is 0)', (await kg(A)) * (await cost(A)));
  });
});

describe('costing of assembled items', () => {
  beforeEach(async () => {
    await buy([{ item: A, kg: 200, price: 10 }]);
    await buy([{ item: B, kg: 200, price: 20 }]);
  });

  test('RULE cost = (components at their cost + extra expenses) / output weight, and stock moves both ways', async () => {
    const res = await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 60 }, { item: B, kg: 40 }, { expense: true, qty: 2, price: 50 }], 100));
    expect(res.status).toBe(201);
    expect(await cost(OUT)).toBe(15);              // (600 + 800 + 100) / 100
    expect([await kg(A), await kg(B), await kg(OUT)]).toEqual([140, 160, 100]);
    expect(await clean()).toEqual([]);
  });

  test('RULE a lighter output raises the cost per kg (production waste)', async () => {
    await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 60 }, { item: B, kg: 40 }], 80));
    expect(await cost(OUT)).toBe(17.5);            // 1400 / 80
  });

  test('RULE a negative component (material given back) lowers the cost and returns to stock', async () => {
    await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 100 }, { item: B, kg: -10 }], 100));
    expect(await cost(OUT)).toBe(8);               // (1000 - 200) / 100
    expect(await kg(B)).toBe(210);
  });

  test('PROBE a second batch at a different cost: last batch or average with what is already in stock?', async () => {
    await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 100 }], 100));   // @10
    await post('/api/stock/assemblies', assemblyBody([{ item: B, kg: 100 }], 100));   // @20
    probe('cost after a batch @10 then a batch @20, 100kg of each in stock (average 15)', await cost(OUT));
    expect(await cost(OUT)).toBe(20);
  });

  test('PROBE re-saving an old assembly after a component price changed', async () => {
    const made = (await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 100 }], 100))).body;
    await buy([{ item: A, kg: 1, price: 30 }]);
    expect(await cost(OUT)).toBe(10);              // unchanged by the purchase itself
    expect((await put(`/api/stock/assemblies/${made.id}`, assemblyBody([{ item: A, kg: 100 }], 100))).status).toBe(200);
    probe('cost of the output after re-saving the old assembly (made when the component cost 10)', await cost(OUT));
    expect(await cost(OUT)).toBe(30);
  });

  test('PROBE deleting an assembly: stock is restored; is the cost?', async () => {
    const made = (await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 100 }], 100))).body;
    expect((await del(`/api/stock/assemblies/${made.id}`)).status).toBe(200);
    expect([await kg(A), await kg(OUT), await ItemAssembly.count()]).toEqual([200, 0, 0]);
    probe('cost of the output after its only assembly was deleted (it was 0 before)', await cost(OUT));
    expect(await cost(OUT)).toBe(10);
    expect(await clean()).toEqual([]);
  });

  test('PROBE a component that never had a cost, and an output heavier than the inputs: accepted?', async () => {
    const free = await makeItem({ name: 'بلا تكلفة', purchase_price: 0 });
    const r1 = await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 50 }, { item: free, kg: 50 }], 100));
    probe('assembly with a zero-cost component: status and output cost', [r1.status, await cost(OUT)]);
    const r2 = await post('/api/stock/assemblies', assemblyBody([{ item: A, kg: 10 }], 500));
    probe('10 kg in, 500 kg out: status and output cost', [r2.status, await cost(OUT)]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
  });
});

describe('inventory logic', () => {
  beforeEach(async () => { await buy([{ item: A, kg: 100, price: 10 }]); });

  test('RULE selling reduces stock; a sales invoice for more than is there is refused and changes nothing', async () => {
    expect((await sell(A, 40)).status).toBe(200);
    expect(await kg(A)).toBe(60);
    const over = await sell(A, 61);
    expect(over.status).toBe(400);
    expect(await kg(A)).toBe(60);
    expect(await clean()).toEqual([]);
  });

  test('PROBE a delivery note for more than is in stock', async () => {
    const note = (await post('/api/delivery-notes', { date: '2026-03-05', customer_id: customer.id, warehouse_id: w1.id, items: [{ item_id: A.id, net_weight: 150, roll_count: 1 }] })).body;
    const res = await post(`/api/delivery-notes/${note.id}/deliver`, { items: [{ item_id: A.id, price: 50 }] });
    probe('posting a 150 kg note with 100 kg in stock: status and stock after', [res.status, await kg(A)]);
    expect([res.status, await kg(A)]).toEqual([200, -50]);
  });

  test('PROBE issuing, returning to the supplier or transferring more than is in stock', async () => {
    const issue = await post('/api/stock/adjustments', { item_id: A.id, warehouse_id: w1.id, movement_type: 'صرف', quantity: 1, weight: 150, date: '2026-03-05' });
    probe('stock issue of 150 kg with 100 in stock: status and stock', [issue.status, await kg(A)]);
    const ret = await post('/api/returns/purchase', { supplier_id: supplier.id, warehouse_id: w1.id, date: '2026-03-06', tax_rate: 0, items: [{ item_id: A.id, quantity: 1, weight: 500, price: 10 }] });
    probe('unlinked purchase return of 500 kg: status and stock', [ret.status, await kg(A)]);
    const tr = (await post('/api/stock/transfers', { date: '2026-03-07', from_warehouse_id: w1.id, to_warehouse_id: w2.id, items: [{ item_id: A.id, quantity: 1, weight: 1000 }] })).body;
    const ok = await post(`/api/stock/transfers/${tr.id}/confirm`, {});
    probe('transfer of 1000 kg: status, source, destination', [ok.status, await kg(A, w1), await kg(A, w2)]);
    expect(await clean()).toEqual([]);             // negative, but still consistent with the movements
  });

  test('RULE a transfer moves weight from one warehouse to the other once only, keeping the total', async () => {
    const tr = (await post('/api/stock/transfers', { date: '2026-03-07', from_warehouse_id: w1.id, to_warehouse_id: w2.id, items: [{ item_id: A.id, quantity: 1, weight: 30 }] })).body;
    expect((await post(`/api/stock/transfers/${tr.id}/confirm`, {})).status).toBe(200);
    expect((await post(`/api/stock/transfers/${tr.id}/confirm`, {})).status).toBe(400);
    expect([await kg(A, w1), await kg(A, w2)]).toEqual([70, 30]);
    expect(await cost(A)).toBe(10);
    expect(await clean()).toEqual([]);
  });

  test('RULE a stock count sets the balance; later movements build on it; adding and deleting a movement restores it', async () => {
    await post('/api/stock/adjustments', { item_id: A.id, warehouse_id: w1.id, movement_type: 'تعديل جرد', quantity: 5, weight: 80, date: '2026-03-08' });
    expect(await kg(A)).toBe(80);
    const add = (await post('/api/stock/adjustments', { item_id: A.id, warehouse_id: w1.id, movement_type: 'إضافة', quantity: 1, weight: 15, date: '2026-03-09' })).body;
    expect(await kg(A)).toBe(95);
    expect((await del(`/api/stock/adjustments/${add.id}`)).status).toBe(200);
    expect(await kg(A)).toBe(80);
    expect(await cost(A)).toBe(10);                // counting and adjusting never change the cost
    expect(await clean()).toEqual([]);
  });

  test('PROBE entries that make no physical sense: negative weights, a transfer to the same warehouse', async () => {
    const neg = await post('/api/stock/adjustments', { item_id: A.id, warehouse_id: w1.id, movement_type: 'إضافة', quantity: 1, weight: -40, date: '2026-03-05' });
    probe('"add to stock" of -40 kg: status and stock', [neg.status, await kg(A)]);
    const same = await post('/api/stock/transfers', { date: '2026-03-07', from_warehouse_id: w1.id, to_warehouse_id: w1.id, items: [{ item_id: A.id, quantity: 1, weight: 10 }] });
    probe('transfer from a warehouse to itself: create status', same.status);
    const negT = await post('/api/stock/transfers', { date: '2026-03-07', from_warehouse_id: w1.id, to_warehouse_id: w2.id, items: [{ item_id: A.id, quantity: 1, weight: -25 }] });
    let negOk = null;
    if (negT.status === 201) negOk = (await post(`/api/stock/transfers/${negT.body.id}/confirm`, {})).status;
    probe('transfer of -25 kg: create, confirm, source, destination', [negT.status, negOk, await kg(A, w1), await kg(A, w2)]);
    probe('invariant errors after these', (await clean()).length);
  });
});
