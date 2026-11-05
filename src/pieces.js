// Original geometric piece silhouettes; no external image requests or font dependencies.
const bodies={
p:'<circle cx="24" cy="12" r="6"/><path d="M19 20h10l-2 11 6 7H15l6-7z"/>',
n:'<path d="m14 35 4-9-7-2 4-12 10-6 1 6c12 4 12 16 8 23z"/><path class="piece-cut" d="m16 20 5-5m4 6 4 1"/>',
b:'<path d="M24 5c-3 5-9 9-9 15 0 4 4 7 9 7s9-3 9-7c0-6-6-10-9-15Z"/><path d="m20 28-4 10h16l-4-10z"/><path class="piece-cut" d="m23 10 4 9"/>',
r:'<path d="M12 7h6v6h4V7h4v6h4V7h6v14l-5 3v10l4 4H13l4-4V24l-5-3z"/><path class="piece-cut" d="M16 21h16"/>',
q:'<path d="m10 14 8 6 6-11 6 11 8-6-5 20H15z"/><circle cx="9" cy="11" r="3"/><circle cx="24" cy="6" r="3"/><circle cx="39" cy="11" r="3"/><path d="m17 34-3 4h20l-3-4z"/>',
k:'<path d="M22 4h4v5h5v4h-5v5h-4v-5h-5V9h5z"/><path d="M24 22c-12-12-21 1-9 11l2 5h14l2-5c12-10 3-23-9-11Z"/>'
};
export function pieceSVG(piece,style='classic'){return `<svg class="piece-art ${style==='outline'?'outline-art':''}" viewBox="0 0 48 48" aria-hidden="true"><g>${bodies[piece.type]}<path d="M12 39h24v4H12z"/></g></svg>`;}
