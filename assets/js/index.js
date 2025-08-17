// ---- Extracted scripts from inline <script> blocks ----
// Loading overlay
window.addEventListener('load', () => {
  const loading = document.getElementById('loading');
  loading.style.opacity = '0';
  setTimeout(() => loading.style.display = 'none', 500);
});

// TETRIS 4 langkah per huruf (1s per langkah)
(function(){
  const title = document.getElementById('tetrisTitle');
  if(!title) return;
  const txt = title.textContent;
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build spans
  title.textContent = '';
  const nodes = [];
  [...txt].forEach(ch=>{
    const span=document.createElement('span');
    span.className='tetris-char';
    span.textContent=ch;
    if(ch===' '){
      span.style.transform='none';
      span.style.opacity='1';
    }
    title.appendChild(span);
    nodes.push(span);
  });

  if(prefersReduced){
    nodes.forEach(n=>{ n.style.transform='none'; n.style.opacity='1'; });
    return;
  }

  // Jatuhkan satu huruf dengan 4 tick (1s per tick)
  function dropChar(node){
    return new Promise(resolve=>{
      if(node.textContent===' '){ resolve(); return; }
      let steps = 0;
      const startY = -100;      // 4 langkah x 25px
      node.style.opacity = '1';
      node.style.transform = `translateY(${startY}px)`;

      const interval = setInterval(()=>{
        steps++;
        const y = startY + steps*25; // -100, -75, -50, -25, 0
        node.style.transform = `translateY(${Math.min(y,0)}px)`;
        if(steps >= 4){
          clearInterval(interval);
          node.style.transform = 'translateY(0)'; // lock
          resolve();
        }
      }, 70); // 1 detik per langkah
    });
  }

  // Jalankan berurutan per huruf
  (async ()=>{
    for(const node of nodes){
      await dropChar(node);
    }
  })();
})();

// Sort tool-cards by title (A→Z)
(function(){
  const grid = document.querySelector('.grid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('a.tool-card'));
  if (cards.length === 0) return;

  cards.sort((a, b) => {
    const ta = a.querySelector('.tool-title')?.textContent?.trim() ?? '';
    const tb = b.querySelector('.tool-title')?.textContent?.trim() ?? '';
    return ta.localeCompare(tb, undefined, { sensitivity: 'base' });
  });

  // Re-append in sorted order
  cards.forEach(card => grid.appendChild(card));
})();

// Card ripple + page transition
const transitionEl = document.getElementById('transition');
document.querySelectorAll('a.tool-card').forEach(card=>{
  card.addEventListener('click', e=>{
    if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0) return;
    e.preventDefault();
    const href = card.getAttribute('href');
    const rect = card.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    const x = (e.clientX ?? (rect.left + rect.width/2)) - rect.left - size/2;
    const y = (e.clientY ?? (rect.top + rect.height/2)) - rect.top - size/2;
    ripple.style.left = x + 'px';
    ripple.style.top  = y + 'px';
    card.appendChild(ripple);
    setTimeout(()=>{
      transitionEl.classList.add('active');
      setTimeout(()=>window.location.href = href, 480);
    }, 180);
  });
  card.addEventListener('animationend', ev=>{
    if(ev.target.classList.contains('ripple')) ev.target.remove();
  });
});
