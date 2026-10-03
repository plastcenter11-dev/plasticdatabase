import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';

export default function SortButton({ column, sortKey, sortDir, onSort }) {
  const active = sortKey === column;
  return (
    <button type="button" onClick={() => onSort(column)} title="ترتيب من الأصغر للأكبر" className={`shrink-0 cursor-pointer ${active ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}>
      {active ? (sortDir === 'asc' ? <MdArrowUpward size={16} /> : <MdArrowDownward size={16} />) : <MdUnfoldMore size={16} />}
    </button>
  );
}

// A table header cell: the title or dropdown filter plus, when `column` is
// given, the sort arrow. `sort` is { sortKey, sortDir, onSort }.
export function SortTh({ column, sort, children }) {
  return (
    <th>
      <div className="flex items-center gap-1">
        {children}
        {column && <SortButton column={column} {...sort} />}
      </div>
    </th>
  );
}
