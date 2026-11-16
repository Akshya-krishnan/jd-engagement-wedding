/**
 * FINALE.JS
 * The last two sections of the couple slide:
 *  - the "drive into forever" video, which plays by itself when scrolled into view
 *  - the finale: venue maps, a wishes wall that shows every posted greeting, thank you
 */

/**
 * Shared wishes store (see api/wishes.js): every guest sees everyone's wishes.
 * If it can't be reached (e.g. local dev without the API), wishes stay on the device
 * and are sent the next time the page opens.
 */
const WISHES_ENDPOINT = '/api/wishes';
const WISHES_KEY = 'jd-wishes';
const PENDING_KEY = 'jd-wishes-pending';
const REFRESH_MS = 20000;

export class Finale {
  constructor({ scrollContainer = null } = {}) {
    this.scrollContainer = scrollContainer;
    this.videoSection = document.getElementById('wedding-video');
    this.video = document.getElementById('car-video');
    this.finalSection = document.getElementById('wedding-final');
    this.form = document.getElementById('greet-form');
    this.nameInput = document.getElementById('greet-name');
    this.msgInput = document.getElementById('greet-message');
    this.sendBtn = document.getElementById('greet-send');
    this.status = document.getElementById('greet-status');
    this.chips = Array.from(document.querySelectorAll('.greet-chip'));

    this.setupVideo();
    this.setupReveal();
    this.setupGreetings();
  }

  /* ------------------------------------------------------------- video */
  setupVideo() {
    if (!this.video || !this.videoSection) return;
    const video = this.video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const tryPlay = () => {
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.videoSection.classList.add('in-view');
            tryPlay();
          } else {
            video.pause();
          }
        });
      }, { root: this.scrollContainer, threshold: 0.35 });
      io.observe(this.videoSection);
    } else {
      this.videoSection.classList.add('in-view');
      tryPlay();
    }

    // Tap the video to toggle sound (it starts muted so phones allow autoplay)
    const soundBtn = document.getElementById('car-video-sound');
    if (soundBtn) {
      soundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        soundBtn.classList.toggle('on', !video.muted);
        soundBtn.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Turn sound off');
        tryPlay();
      });
    }
  }

  /* ------------------------------------------------------------ reveal */
  setupReveal() {
    if (!this.finalSection) return;
    const targets = Array.from(this.finalSection.querySelectorAll('.fin-reveal'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((t) => t.classList.add('in-view'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { root: this.scrollContainer, threshold: 0.2 });
    targets.forEach((t) => io.observe(t));
  }

  /* --------------------------------------------------------- greetings */
  setupGreetings() {
    if (!this.form) return;
    this.wall = document.getElementById('greet-wall');
    this.wallList = document.getElementById('greet-wall-list');
    this.wallEmpty = document.getElementById('greet-wall-empty');
    this.wallCount = document.getElementById('greet-wall-count');
    this.wishes = [];

    const stop = (e) => e.stopPropagation();
    this.form.addEventListener('click', stop);
    this.form.addEventListener('pointerdown', stop);
    if (this.wall) this.wall.addEventListener('click', stop);

    this.chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        if (this.msgInput) {
          this.msgInput.value = chip.dataset.text || chip.textContent.trim();
          this.msgInput.focus();
        }
      });
    });

    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.post();
    });

    this.loadWishes();
    // keep the wall fresh while the guest is reading it
    setInterval(() => { if (!document.hidden) this.loadWishes(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.loadWishes(); });
  }

  setStatus(text, ok = true) {
    if (!this.status) return;
    this.status.textContent = text;
    this.status.classList.toggle('ok', ok);
    this.status.classList.toggle('err', !ok);
  }

  /* Storage: the shared store, with this device as a fallback */
  readLocal(key = WISHES_KEY) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
  }

  writeLocal(list, key = WISHES_KEY) {
    try { localStorage.setItem(key, JSON.stringify(list.slice(0, 300))); } catch (e) {}
  }

  clean(list) {
    return (Array.isArray(list) ? list : [])
      .filter((w) => w && typeof w.message === 'string' && w.message.trim())
      .map((w) => ({ name: String(w.name || 'A well-wisher').slice(0, 60), message: String(w.message).slice(0, 500), at: Number(w.at) || Date.now() }))
      .sort((x, y) => y.at - x.at);
  }

  /** Sends one wish to the shared wall; resolves true when it was saved. */
  async sendWish(wish) {
    try {
      const res = await fetch(WISHES_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wish.name, message: wish.message })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  async loadWishes() {
    if (this.loading) return;
    this.loading = true;
    if (!this.wishes.length) {
      this.wishes = this.readLocal();
      this.renderWall();
    }
    try {
      // first deliver anything posted while the shared wall was unreachable
      const pending = this.readLocal(PENDING_KEY);
      if (pending.length) {
        const left = [];
        for (const w of pending) if (!(await this.sendWish(w))) left.push(w);
        this.writeLocal(left, PENDING_KEY);
      }

      const res = await fetch(WISHES_ENDPOINT, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error(res.status);
      const remote = await res.json();
      if (!Array.isArray(remote)) throw new Error('bad data');
      const stillPending = this.readLocal(PENDING_KEY);
      const next = this.clean(remote.concat(stillPending));
      const changed = next.length !== this.wishes.length || (next[0] && this.wishes[0] && next[0].at !== this.wishes[0].at);
      this.wishes = next;
      this.writeLocal(this.wishes);
      if (changed) this.renderWall();
    } catch (e) {
      // keep whatever this device remembers
    } finally {
      this.loading = false;
    }
  }

  async post() {
    const name = (this.nameInput && this.nameInput.value.trim()) || 'A well-wisher';
    const message = (this.msgInput && this.msgInput.value.trim()) || '';
    if (!message) {
      this.setStatus('Write a few words first ♥', false);
      if (this.msgInput) this.msgInput.focus();
      return;
    }
    const wish = { name: name.slice(0, 60), message: message.slice(0, 500), at: Date.now() };

    this.wishes.unshift(wish);
    this.writeLocal(this.wishes);
    this.renderWall(wish);
    if (this.msgInput) this.msgInput.value = '';
    if (this.sendBtn) { this.sendBtn.disabled = true; setTimeout(() => { this.sendBtn.disabled = false; }, 1500); }
    this.setStatus('Thank you! Your wishes are on the wall ♥');
    this.burstHearts();

    if (!(await this.sendWish(wish))) {
      this.writeLocal(this.readLocal(PENDING_KEY).concat([wish]), PENDING_KEY);
      this.setStatus("Saved on this phone. It will reach everyone's wall when you are back online ♥", true);
    }
  }

  renderWall(fresh = null) {
    if (!this.wallList) return;
    this.wallList.innerHTML = '';
    this.wishes.slice(0, 100).forEach((w, i) => {
      const li = document.createElement('li');
      li.className = 'greet-card' + (fresh && w === fresh ? ' is-new' : '');
      li.style.setProperty('--tilt', `${((i % 3) - 1) * 1.2}deg`);
      const msg = document.createElement('p');
      msg.className = 'greet-card-msg';
      msg.textContent = w.message;
      const who = document.createElement('p');
      who.className = 'greet-card-who';
      who.textContent = `— ${w.name}`;
      const when = document.createElement('span');
      when.className = 'greet-card-when';
      when.textContent = this.timeAgo(w.at);
      who.appendChild(when);
      li.appendChild(msg);
      li.appendChild(who);
      this.wallList.appendChild(li);
    });
    if (this.wallEmpty) this.wallEmpty.hidden = this.wishes.length > 0;
    if (this.wallCount) this.wallCount.textContent = String(this.wishes.length);
  }

  timeAgo(at) {
    const diff = Math.max(0, Date.now() - at);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} hr ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} day${d === 1 ? '' : 's'} ago`;
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  burstHearts() {
    const host = document.getElementById('greet-burst');
    if (!host) return;
    for (let i = 0; i < 14; i++) {
      const s = document.createElement('span');
      s.className = 'greet-heart';
      s.textContent = '♥';
      s.style.left = `${10 + Math.random() * 80}%`;
      s.style.animationDelay = `${Math.random() * 0.4}s`;
      s.style.fontSize = `${14 + Math.random() * 16}px`;
      host.appendChild(s);
      setTimeout(() => s.remove(), 2600);
    }
  }
}
