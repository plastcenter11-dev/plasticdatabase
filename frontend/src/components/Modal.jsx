export default function Modal({ title, onClose, children, width = 'max-w-lg', zIndex = 50 }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40" style={{ zIndex }} onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${width} mx-4 max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl cursor-pointer">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
