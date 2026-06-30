const MASCOT_W = 36, MASCOT_H = 36;

// Three-tone palette (black / white / gray), theme-aware.
function getMascotColorB() { return document.body.classList.contains('dark') ? '#f4f4f0' : '#1a1a1a'; }
function getMascotColorW() { return document.body.classList.contains('dark') ? '#1a1a1a' : '#f4f4f0'; }
function getMascotColorG() { return document.body.classList.contains('dark') ? '#9a9a9a' : '#8a8a8a'; }

// Benchmark Navigator Husky — side view, pointed ears, white face mask,
// gray body shading, curled tail, compass collar badge on the chest, and a
// tiny benchmark card by the front paw.
//   B = outline/black, G = gray body fill, W = white markings, . = empty
const huskyFrames = [
  // Frame 1: standing, neutral
  [
    "....................................",
    "....................................",
    "....................................",
    "......B...B.........................",
    "......BB.BB.........................",
    ".....BGB.BGB........................",
    ".....WWWWGGGB.......................",
    "....BWWWWWGGB.......................",
    "....WWWWWWGGGBB.....................",
    "...WWWBWWWGGGGB..............BBB....",
    "..WWWWBBWWGGGGB.............BGGGBB..",
    "..WWWWWWWGGGGGGB...........BGGGGGGB.",
    "...WWWWWWGGGGGGGB..........BGGGGGGB.",
    "...WWWWWGGGGGGGGGB........BGGGGGBB..",
    ".....WWGGGGGGGGGGGB......BGGGGGB....",
    "......WGGGGGGGGGGGGBBBBBBGGGGGGB....",
    "......WWGGGGGGGGGGGGGGGGGGGGGGGB....",
    ".......WWGGGGGGGGGGGGGGGGGGGGGB.....",
    ".......WWWBBGGGGGGGGGGGGGGGGGGB.....",
    "........WBWBBGGGGGGGGGGGGGGGGGB.....",
    "........WBBWBGGGGGGGGGGGGGGGGGB.....",
    "........WWBBWGGGGGGGGGGGGGGGGGB.....",
    ".........WWWWGGGGGGGGBGGGGGGGGB.....",
    ".........WWWBBBBBBBBB.BBBBBBBBB.....",
    ".........BGB.BGB......BGB..BGB......",
    ".........BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    ".BWWWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    "........BBBBBBBB.....BBBB.BBBB......",
    "....................................",
    "....................................",
    "....................................",
    "...................................."
  ],
  // Frame 2: front paw lifted, tail up
  [
    "....................................",
    "....................................",
    "....................................",
    "......B...B.........................",
    "......BB.BB.........................",
    ".....BGB.BGB........................",
    ".....WWWWGGGB.......................",
    "....BWWWWWGGB.......................",
    "....WWWWWWGGGBB.....................",
    "...WWWBWWWGGGGB..............BBB....",
    "..WWWWBBWWGGGGB.............BGGGBB..",
    "..WWWWWWWGGGGGGB...........BGGGGGGB.",
    "...WWWWWWGGGGGGGB..........BGGGGGGB.",
    "...WWWWWGGGGGGGGGB........BGGGGGBB..",
    ".....WWGGGGGGGGGGGB......BGGGGGB....",
    "......WGGGGGGGGGGGGBBBBBBGGGGGGB....",
    "......WWGGGGGGGGGGGGGGGGGGGGGGGB....",
    ".......WWGGGGGGGGGGGGGGGGGGGGGB.....",
    ".......WWWBBGGGGGGGGGGGGGGGGGGB.....",
    "........WBWBBGGGGGGGGGGGGGGGGGB.....",
    "........WBBWBGGGGGGGGGGGGGGGGGB.....",
    "........WWBBWGGGGGGGGGGGGGGGGGB.....",
    ".........WWWWGGGGGGGGBGGGGGGGGB.....",
    ".........WWWBBBBBBBBB.BBBBBBBBB.....",
    ".........BGB.BGB......BGB..BGB......",
    ".........BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    ".BWWWB...BGB.BGB......BGB..BGB......",
    ".BWGWB..BBBB.BGB......BGB..BGB......",
    ".BWGWB.......BGB......BGB..BGB......",
    ".BBBBB.......BGB......BGB..BGB......",
    "............BBBB.....BBBB.BBBB......",
    "....................................",
    "....................................",
    "....................................",
    "...................................."
  ],
  // Frame 3: blinking
  [
    "....................................",
    "....................................",
    "....................................",
    "......B...B.........................",
    "......BB.BB.........................",
    ".....BGB.BGB........................",
    ".....WWWWGGGB.......................",
    "....BWWWWWGGB.......................",
    "....WWWWWWGGGBB.....................",
    "...WWWWWWWGGGGB..............BBB....",
    "..WWWBBBWWGGGGB.............BGGGBB..",
    "..WWWWWWWGGGGGGB...........BGGGGGGB.",
    "...WWWWWWGGGGGGGB..........BGGGGGGB.",
    "...WWWWWGGGGGGGGGB........BGGGGGBB..",
    ".....WWGGGGGGGGGGGB......BGGGGGB....",
    "......WGGGGGGGGGGGGBBBBBBGGGGGGB....",
    "......WWGGGGGGGGGGGGGGGGGGGGGGGB....",
    ".......WWGGGGGGGGGGGGGGGGGGGGGB.....",
    ".......WWWBBGGGGGGGGGGGGGGGGGGB.....",
    "........WBWBBGGGGGGGGGGGGGGGGGB.....",
    "........WBBWBGGGGGGGGGGGGGGGGGB.....",
    "........WWBBWGGGGGGGGGGGGGGGGGB.....",
    ".........WWWWGGGGGGGGBGGGGGGGGB.....",
    ".........WWWBBBBBBBBB.BBBBBBBBB.....",
    ".........BGB.BGB......BGB..BGB......",
    ".........BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    ".BWWWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    "........BBBBBBBB.....BBBB.BBBB......",
    "....................................",
    "....................................",
    "....................................",
    "...................................."
  ],
  // Frame 4: tiny bounce
  [
    "....................................",
    "....................................",
    "....................................",
    "....................................",
    "......B...B.........................",
    "......BB.BB.........................",
    ".....BGB.BGB........................",
    ".....WWWWGGGB.......................",
    "....BWWWWWGGB.......................",
    "....WWWWWWGGGBB.....................",
    "...WWWBWWWGGGGB..............BBB....",
    "..WWWWBBWWGGGGB.............BGGGBB..",
    "..WWWWWWWGGGGGGB...........BGGGGGGB.",
    "...WWWWWWGGGGGGGB..........BGGGGGGB.",
    "...WWWWWGGGGGGGGGB........BGGGGGBB..",
    ".....WWGGGGGGGGGGGB......BGGGGGB....",
    "......WGGGGGGGGGGGGBBBBBBGGGGGGB....",
    "......WWGGGGGGGGGGGGGGGGGGGGGGGB....",
    ".......WWGGGGGGGGGGGGGGGGGGGGGB.....",
    ".......WWWBBGGGGGGGGGGGGGGGGGGB.....",
    "........WBWBBGGGGGGGGGGGGGGGGGB.....",
    "........WBBWBGGGGGGGGGGGGGGGGGB.....",
    "........WWBBWGGGGGGGGGGGGGGGGGB.....",
    ".........WWWWGGGGGGGGBGGGGGGGGB.....",
    ".........WWWBBBBBBBBB.BBBBBBBBB.....",
    ".........BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    ".BWWWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BWGWB...BGB.BGB......BGB..BGB......",
    ".BBBBB...BGB.BGB......BGB..BGB......",
    ".........BGB.BGB......BGB..BGB......",
    "........BBBBBBBB.....BBBB.BBBB......",
    "....................................",
    "....................................",
    "...................................."
  ],
];

function drawMascotFrame(ctx, frame) {
  ctx.clearRect(0, 0, MASCOT_W, MASCOT_H);
  const colorB = getMascotColorB();
  const colorW = getMascotColorW();
  const colorG = getMascotColorG();
  let y = 0;
  for (let row of frame) {
    let x = 0;
    for (let char of row) {
      if (char === 'B') { ctx.fillStyle = colorB; ctx.fillRect(x, y, 1, 1); }
      else if (char === 'W') { ctx.fillStyle = colorW; ctx.fillRect(x, y, 1, 1); }
      else if (char === 'G') { ctx.fillStyle = colorG; ctx.fillRect(x, y, 1, 1); }
      x++;
    }
    y++;
  }
}

function initMascot() {
  const canvas = document.getElementById('benchMascot');
  if (!canvas) return;

  canvas.width = MASCOT_W;
  canvas.height = MASCOT_H;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');

  // Hold frame 1 longer (the resting pose), then play the action frames.
  const sequence = [0, 0, 0, 1, 0, 2, 0, 3];
  let i = 0;

  setInterval(() => {
    drawMascotFrame(ctx, huskyFrames[sequence[i % sequence.length]]);
    i++;
  }, 220);

  const observer = new MutationObserver(() => {
    drawMascotFrame(ctx, huskyFrames[sequence[i % sequence.length]]);
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMascot);
} else {
  initMascot();
}
