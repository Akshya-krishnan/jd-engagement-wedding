/**
 * MEMORY-SKETCH.JS
 * "Draw a memory" — interactive reveal for the memories scrapbook.
 *
 * Every memory card starts as an empty sheet of paper with a little invitation
 * ("Tap to draw us"); no pencil is shown yet. When the guest taps a card, a single pencil appears and scribbles
 * across it, stroke by stroke, drawing the pencil sketch (sketch/lines/memory-N.jpg).
 * Then the colours wash in and the finished colourful sketch (the card's own <img>)
 * is left. Only one pencil ever draws at a time: a card tapped meanwhile waits its
 * turn. Once drawn, tapping the card opens the full photo as before.
 */

const DRAW_MS = 2600;      // pencil drawing time per card
const COLOUR_MS = 1300;    // colours washing in
const PAPER = '#fcf6ec';

const PROMPTS = [
  'Tap to draw us',
  'A memory is hiding here…',
  'Sketch this moment',
  'Pick up the pencil!',
  'What did we do here?',
  'Tap & watch it come alive'
];

const PENCIL_SVG =
  '<svg viewBox="0 0 64 64" aria-hidden="true">' +
  '<g transform="rotate(45 32 32)">' +
  '<rect x="27" y="-2" width="10" height="44" rx="1.5" fill="#e9b949"/>' +
  '<rect x="27" y="-2" width="3.4" height="44" fill="#f4d27a"/>' +
  '<rect x="27" y="-6" width="10" height="6" rx="2" fill="#e88b9a"/>' +
  '<rect x="27" y="-0.5" width="10" height="2.4" fill="#b9b9b9"/>' +
  '<path d="M27 42 L37 42 L32 56 Z" fill="#f3d9b1"/>' +
  '<path d="M30.3 51.5 L33.7 51.5 L32 56 Z" fill="#3a302a"/>' +
  '</g></svg>';

export class MemorySketch {
  constructor() {
    this.section = document.getElementById('wedding-memories');
    if (!this.section) return;
    this.cards = Array.from(this.section.querySelectorAll('.mem-card'));
    if (!this.cards.length) return;
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.queue = [];
    this.busy = false;
    this.cards.forEach((card, i) => this.prepare(card, i));

    // Tapping an undrawn card draws it instead of opening the photo
    this.section.addEventListener('click', (e) => {
      const card = e.target.closest && e.target.closest('.mem-card');
      if (!card || !card._sketch || card._sketch.state === 'done') return;
      e.stopImmediatePropagation();
      e.preventDefault();
      this.request(card);
    }, true);

    // keep the paper and canvas lined up with the photo as the layout settles
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver((entries) => entries.forEach((en) => {
        const card = en.target.closest('.mem-card');
        if (card && card._sketch) this.place(card);
      }));
      this.cards.forEach((c) => { const img = c.querySelector('.mem-card-a'); if (img) ro.observe(img); });
    }

    const foot = this.section.querySelector('.sb-foot');
    if (foot) foot.textContent = 'tap a card to draw a memory';
  }

  /** Covers the card's photo with an empty sheet and a little invitation to draw. */
  prepare(card, i) {
    const img = card.querySelector('.mem-card-a');
    if (!img) return;
    const src = img.getAttribute('src') || '';
    const linesSrc = src.replace('/sketch/', '/sketch/lines/');
    if (linesSrc === src) return;

    const cover = document.createElement('span');
    cover.className = 'sk-cover';
    cover.setAttribute('aria-hidden', 'true');
    cover.innerHTML =
      `<span class="sk-cover-text">${PROMPTS[i % PROMPTS.length]}</span>` +
      '<span class="sk-cover-dots"><i></i><i></i><i></i></span>';
    img.insertAdjacentElement('afterend', cover);

    card.setAttribute('aria-label', 'Tap to draw this memory');
    card._sketch = { img, cover, linesSrc, lines: null, state: 'empty' };
    card.classList.add('sk-empty');
    this.place(card);
  }

  /** Lines an overlay up exactly with the photo inside the card. */
  fit(card, el) {
    const { img } = card._sketch;
    el.style.left = img.offsetLeft + 'px';
    el.style.top = img.offsetTop + 'px';
    el.style.width = img.offsetWidth + 'px';
    el.style.height = img.offsetHeight + 'px';
  }

  place(card) {
    const s = card._sketch;
    if (s.cover && s.cover.isConnected) this.fit(card, s.cover);
  }

  /** Tapped: draw now, or after the card currently being drawn. */
  request(card) {
    const s = card._sketch;
    if (s.state !== 'empty') return;
    s.state = 'queued';
    card.classList.add('sk-queued');
    if (!s.lines) {
      s.lines = new Image();
      s.lines.decoding = 'async';
      s.lines.src = s.linesSrc;
    }
    this.queue.push(card);
    this.next();
  }

  next() {
    if (this.busy) return;
    const card = this.queue.shift();
    if (!card) return;
    this.busy = true;
    this.draw(card).finally(() => {
      this.busy = false;
      this.next();
    });
  }

  async draw(card) {
    const s = card._sketch;
    s.state = 'drawing';
    card.classList.remove('sk-empty', 'sk-queued');
    try { await s.lines.decode(); } catch (e) { /* fall through */ }
    if (this.reduceMotion || !s.lines.naturalWidth) { this.reveal(card, true); return; }

    const { img } = s;
    const w = img.offsetWidth;
    const h = img.offsetHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // the drawing sheet replaces the empty cover
    const canvas = document.createElement('canvas');
    canvas.className = 'sk-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    this.fit(card, canvas);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    s.cover.insertAdjacentElement('beforebegin', canvas);
    s.cover.remove();
    s.canvas = canvas;

    // the one and only pencil
    const pencil = document.createElement('span');
    pencil.className = 'sk-pencil';
    pencil.innerHTML = PENCIL_SVG;
    canvas.insertAdjacentElement('afterend', pencil);
    s.pencil = pencil;
    card.classList.add('sk-drawing');

    // the pencil-lines image, cropped like the photo (object-fit: cover), used as the stroke "paint"
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const scale = Math.max(off.width / s.lines.naturalWidth, off.height / s.lines.naturalHeight);
    const dw = s.lines.naturalWidth * scale;
    const dh = s.lines.naturalHeight * scale;
    off.getContext('2d').drawImage(s.lines, (off.width - dw) / 2, (off.height - dh) / 2, dw, dh);
    const paint = ctx.createPattern(off, 'no-repeat');
    if (paint.setTransform && window.DOMMatrix) paint.setTransform(new DOMMatrix().scale(1 / dpr));

    // a hand-drawn back-and-forth scribble that covers the whole picture, top to bottom
    const lw = Math.max(w, h) / 7;
    const step = lw * 0.62;
    const pts = [];
    let y = -lw * 0.3;
    let left = true;
    while (y < h + lw) {
      pts.push({ x: left ? -lw * 0.4 : w + lw * 0.4, y: y + (Math.random() - 0.5) * step * 0.35 });
      y += step;
      left = !left;
    }
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      segs.push({ a: pts[i - 1], b: pts[i], len, from: total });
      total += len;
    }
    const at = (d) => {
      const seg = segs.find((g) => d <= g.from + g.len) || segs[segs.length - 1];
      const t = seg.len ? Math.min(1, (d - seg.from) / seg.len) : 1;
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, y: seg.a.y + (seg.b.y - seg.a.y) * t };
    };

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = paint;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;

    await new Promise((resolve) => {
      const t0 = performance.now();
      let drawnTo = 0;
      const frame = (now) => {
        const p = Math.min(1, (now - t0) / DRAW_MS);
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const target = eased * total;
        if (target > drawnTo) {
          ctx.beginPath();
          const from = at(drawnTo);
          ctx.moveTo(from.x, from.y);
          for (let d = drawnTo; d < target; d += lw / 3) { const q = at(d); ctx.lineTo(q.x, q.y); }
          const end = at(target);
          ctx.lineTo(end.x, end.y);
          ctx.stroke();
          drawnTo = target;
          const tx = Math.max(0, Math.min(w, end.x));
          const ty = Math.max(0, Math.min(h, end.y));
          pencil.style.transform = `translate(${canvas.offsetLeft + tx}px, ${canvas.offsetTop + ty}px)`;
        }
        if (p < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    });
    ctx.restore();
    await this.reveal(card, false);
  }

  /** Colours wash in: the pencil drawing fades to reveal the finished colourful sketch. */
  reveal(card, instant) {
    const s = card._sketch;
    card.classList.remove('sk-drawing', 'sk-empty', 'sk-queued');
    card.classList.add('sk-colouring');
    const cleanup = () => {
      if (s.canvas) s.canvas.remove();
      if (s.pencil) s.pencil.remove();
      if (s.cover) s.cover.remove();
      card.classList.remove('sk-colouring');
      card.classList.add('sk-done');
      card.removeAttribute('aria-label');
      s.state = 'done';
    };
    if (instant) { cleanup(); return Promise.resolve(); }
    return new Promise((r) => setTimeout(() => { cleanup(); r(); }, COLOUR_MS + 100));
  }
}
