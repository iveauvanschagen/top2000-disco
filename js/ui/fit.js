// Lange artiestnamen op de tegels kleiner maken, zodat ze in maximaal twee regels passen.
// Eerst een schatting op het aantal tekens (tot 24 normaal, tot 40 iets kleiner, daarboven kleiner),
// daarna meten: past het nog niet in twee regels, dan stap voor stap kleiner tot minimaal 45%.
const STEPS = [1, 0.9, 0.8, 0.72, 0.64, 0.57, 0.5, 0.45];

function start(n) {
  return n <= 24 ? 0 : n <= 40 ? 2 : 4;
}

function lines(el) {
  // Een inline element geeft per regel één rechthoek; bij een blok rekenen we met de hoogte
  if (getComputedStyle(el).display === 'inline') return el.getClientRects().length;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 1;
  return Math.round(el.scrollHeight / lh);
}

function fit(el) {
  const box = el.closest('strong') || el;
  const n = (box.textContent || '').trim().length;
  let i = start(n);
  box.style.setProperty('--k', STEPS[i]);
  while (i < STEPS.length - 1 && lines(el) > 2) box.style.setProperty('--k', STEPS[++i]);
}

const els = [];

// Past zich vanzelf aan zodra de tekst verandert, waar die ook gezet wordt, en bij draaien of venster groter maken
export function bindFit() {
  for (const id of ['kinkArtist', 'spotArtist']) {
    const el = document.getElementById(id);
    if (!el) continue;
    els.push(el);
    fit(el);
    new MutationObserver(() => fit(el)).observe(el, { childList: true, characterData: true, subtree: true });
  }
  let t = null;
  addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => els.forEach(fit), 150);
  });
}
