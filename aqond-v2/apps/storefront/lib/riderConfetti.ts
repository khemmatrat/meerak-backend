/** Lightweight confetti — no external dependency */

export function fireRiderConfetti() {
  if (typeof document === 'undefined') return;

  const root = document.createElement('div');
  root.className = 'tt-rider-confetti-root';
  root.setAttribute('aria-hidden', 'true');
  document.body.appendChild(root);

  const colors = ['#34d399', '#10b981', '#6ee7b7', '#fbbf24', '#fcd34d', '#60a5fa'];
  const count = 40;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement('span');
    piece.className = 'tt-rider-confetti-piece';
    piece.style.left = `${35 + Math.random() * 30}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.25}s`;
    piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 180}px`);
    piece.style.setProperty('--spin', `${Math.random() * 720 - 360}deg`);
    root.appendChild(piece);
  }

  window.setTimeout(() => root.remove(), 2400);
}
