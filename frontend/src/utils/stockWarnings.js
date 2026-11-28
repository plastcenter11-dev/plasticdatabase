// Warnings shown before saving something that looks wrong for the stock or the cost. They never block: the person
// reads them and may go on (negative balances are sometimes intended, e.g. goods issued before their receipt).

const n = (v) => Number(v || 0);
const fmt = (v) => n(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const EPS = 0.001;
const nameOf = (line) => line.name || `رقم ${line.item_id}`;
const isStock = (line) => line.stockable !== false;

// Lines taking stock OUT of one warehouse, against its balances ([{ item_id, warehouse_id, weight, quantity }]).
// Measured by weight; a line with no weight by its count. The same item on two lines is added up.
// No balances (they could not be read) means no shortage warning.
export function shortageWarnings(lines, balances, warehouseId) {
  if (!Array.isArray(balances) || !warehouseId) return [];
  const wanted = new Map();
  for (const line of lines) {
    if (!line.item_id || !isStock(line)) continue;
    const w = wanted.get(Number(line.item_id)) || { name: nameOf(line), weight: 0, quantity: 0 };
    w.weight += Math.max(0, n(line.weight));
    if (!n(line.weight)) w.quantity += Math.max(0, n(line.quantity));
    wanted.set(Number(line.item_id), w);
  }
  const out = [];
  for (const [itemId, w] of wanted) {
    const row = balances.find(b => Number(b.item_id) === itemId && Number(b.warehouse_id) === Number(warehouseId));
    if (w.weight > n(row?.weight) + EPS) out.push(`«${w.name}»: المطلوب ${fmt(w.weight)} كجم والمتاح في المخزن ${fmt(row?.weight)} كجم — الرصيد هيبقى بالسالب`);
    else if (w.quantity > n(row?.quantity) + EPS) out.push(`«${w.name}»: المطلوب ${fmt(w.quantity)} والمتاح في المخزن ${fmt(row?.quantity)} — الرصيد هيبقى بالسالب`);
  }
  return out;
}

// the balances as they would be without a movement that is being edited (it has already changed them)
export function withoutMovement(balances, movement) {
  if (!Array.isArray(balances) || !movement) return balances;
  const sign = movement.movement_type === 'صرف' ? 1 : movement.movement_type === 'إضافة' ? -1 : 0;
  const same = (b) => Number(b.item_id) === Number(movement.item_id) && Number(b.warehouse_id) === Number(movement.warehouse_id);
  return balances.map(b => (same(b) ? { ...b, weight: n(b.weight) + sign * n(movement.weight), quantity: n(b.quantity) + sign * n(movement.quantity) } : b));
}

export function negativeWarnings(lines) {
  return lines.filter(l => n(l.weight) < 0 || n(l.quantity) < 0)
    .map(l => `«${nameOf(l)}»: الوزن أو العدد مكتوب بالسالب`);
}

// An assembly: a component with no cost makes the product look cheaper than it is, and an output heavier than
// everything that went in is usually a typing mistake. (Negative components - material given back - are normal.)
export function assemblyWarnings(components, outputWeight, items) {
  const used = (components || []).filter(c => !c.is_expense && c.item_id);
  const out = used.map(c => items.find(i => Number(i.id) === Number(c.item_id)))
    .filter(i => i && !(n(i.purchase_price) > 0))
    .map(i => `«${i.name}» ليس له سعر تكلفة، فتكلفة المنتج هتطلع أقل من الحقيقة`);
  const input = used.reduce((s, c) => s + n(c.weight), 0);
  if (input > 0 && n(outputWeight) > input + EPS) out.push(`وزن المنتج الناتج ${fmt(outputWeight)} كجم أكبر من وزن المكونات ${fmt(input)} كجم`);
  return [...new Set(out)];
}

// true when there is nothing to warn about, or the person chooses to go on
export function confirmWarnings(warnings, ask = (text) => window.confirm(text)) {
  if (!warnings.length) return true;
  return ask(`تنبيه:\n• ${warnings.join('\n• ')}\n\nهل تريد المتابعة؟`);
}
