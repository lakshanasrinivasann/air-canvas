/* =========================================================
   AIR CANVAS — THE TUTORIAL
   A short 4-step walkthrough shown before the first drawing.
   Each step has a little animated hand drawn with SVG
   (shapes described in code, so no image files are needed).
   ========================================================= */


/* ---------------------------------------------------------
   1. A CARTOON HAND
   Built from rounded rectangles. Fingers listed in "up" are
   raised; the others are folded (squashed down in CSS).
   The index fingertip sits at roughly (71.5, 40).
   --------------------------------------------------------- */
function hand(up) {
  const finger = (name, x, y, w, h) =>
    `<rect class="finger ${up.includes(name) ? "" : "down"}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${w / 2}"/>`;
  return `
    <g class="hand">
      <rect class="finger thumb ${up.includes("thumb") ? "" : "down"}" x="41" y="100" width="20" height="54" rx="10"/>
      ${finger("index", 62, 35, 19, 72)}
      ${finger("middle", 84, 25, 19, 82)}
      ${finger("ring", 106, 32, 19, 75)}
      ${finger("pinky", 127, 50, 16, 58)}
      <rect class="palm" x="58" y="92" width="88" height="80" rx="26"/>
    </g>`;
}

// Shrinks the hand and shifts it so the index fingertip is at (0, 0).
// That way, when we move the group, the fingertip follows the path exactly.
const handAtTip = (up) => `<g transform="scale(0.6) translate(-71.5 -40)">${hand(up)}</g>`;


/* ---------------------------------------------------------
   2. THE FOUR ANIMATED SCENES
   <animateMotion> slides the hand along a path. The CSS
   animations in style.css use the same timings so they match.
   --------------------------------------------------------- */

// Step 1: the hand moves and a glowing line appears behind the fingertip
function drawScene() {
  const path = "M35 80 C 70 25, 100 125, 135 70 S 170 45, 180 85";
  return `
    <svg class="scene" viewBox="0 0 240 200" aria-hidden="true">
      <path class="trail glow" d="${path}" pathLength="1"/>
      <path class="trail core" d="${path}" pathLength="1"/>
      <g>
        <animateMotion dur="3s" repeatCount="indefinite" path="${path}"
          keyPoints="0;1;1" keyTimes="0;0.75;1" calcMode="linear"/>
        ${handAtTip(["index"])}
      </g>
    </svg>`;
}

// Step 2: two fingers up, the hand glides around with a cursor but leaves no ink
function hoverScene() {
  const path = "M45 85 C 85 35, 135 125, 185 70";
  return `
    <svg class="scene" viewBox="0 0 240 200" aria-hidden="true">
      <path class="route" d="${path}"/>
      <g>
        <animateMotion dur="4s" repeatCount="indefinite" path="${path}"
          keyPoints="0;1;0" keyTimes="0;0.5;1" calcMode="spline"
          keySplines=".45 0 .55 1; .45 0 .55 1"/>
        ${handAtTip(["index", "middle"])}
        <circle class="cursor-ring" r="9"/>
      </g>
    </svg>`;
}

// Step 3: the fingertip rests on a bubble while a ring fills up around it
function colourScene() {
  const path = "M55 125 Q 80 55 120 42";
  return `
    <svg class="scene" viewBox="0 0 240 200" aria-hidden="true">
      <circle class="demo-bubble" cx="75"  cy="42" r="13" fill="#22d3ee"/>
      <circle class="demo-bubble chosen" cx="120" cy="42" r="13" fill="#e879f9"/>
      <circle class="demo-bubble" cx="165" cy="42" r="13" fill="#a3e635"/>
      <g>
        <animateMotion dur="3.5s" repeatCount="indefinite" path="${path}"
          keyPoints="0;1;1;0" keyTimes="0;0.3;0.85;1" calcMode="spline"
          keySplines=".4 0 .2 1; 0 0 1 1; .4 0 .2 1"/>
        ${handAtTip(["index", "middle"])}
      </g>
      <circle class="pick-ring" cx="120" cy="42" r="21" pathLength="1" transform="rotate(-90 120 42)"/>
    </svg>`;
}

// Step 4: an open palm with a countdown ring that fills, then flashes
function palmScene() {
  return `
    <svg class="scene" viewBox="0 0 240 200" aria-hidden="true">
      <circle class="count-flash" cx="120" cy="100" r="78"/>
      <circle class="count-track" cx="120" cy="100" r="78"/>
      <circle class="count-ring" cx="120" cy="100" r="78" pathLength="1" transform="rotate(-90 120 100)"/>
      <g class="palm-wave">
        <g transform="translate(120 104) scale(0.72) translate(-100 -105)">
          ${hand(["thumb", "index", "middle", "ring", "pinky"])}
        </g>
      </g>
    </svg>`;
}


/* ---------------------------------------------------------
   3. THE STEPS (heading, one-line explanation, picture)
   --------------------------------------------------------- */
// "still" = the moment (in seconds) to freeze on if the person prefers less motion
const STEPS = [
  { title: "Draw",          text: "Point your index finger to draw",             scene: drawScene,   still: 2.3 },
  { title: "Move",          text: "Raise two fingers to move without drawing",   scene: hoverScene,  still: 1   },
  { title: "Pick a colour", text: "Hover over a colour bubble to change colour", scene: colourScene, still: 2.5 },
  { title: "Clear",         text: "Hold your open palm for 2 seconds to clear",  scene: palmScene,   still: 0   },
];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");


/* ---------------------------------------------------------
   4. REMEMBERING WHETHER THEY'VE SEEN IT
   Stored in the browser's own little notebook (localStorage)
   on this device only. "try" is used because some private
   browsing modes block it; then we simply show it again.
   --------------------------------------------------------- */
const STORAGE_KEY = "airCanvas.tutorialSeen";

export function hasSeenTutorial() {
  try { return localStorage.getItem(STORAGE_KEY) === "yes"; }
  catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(STORAGE_KEY, "yes"); }
  catch { /* not available: nothing to do */ }
}


/* ---------------------------------------------------------
   5. SHOWING THE TUTORIAL
   --------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const tutorial  = $("tutorial");
const tutStage  = $("tutStage");
const tutDots   = $("tutDots");
const tutStep   = $("tutStep");
const tutTitle  = $("tutTitle");
const tutText   = $("tutText");
const tutNext   = $("tutNext");
const tutSkip   = $("tutSkip");

// Build all the pictures and progress dots once, when the page loads
tutStage.innerHTML = STEPS.map((s) => s.scene()).join("");
tutDots.innerHTML = STEPS.map(() => "<span></span>").join("");
const scenes = [...tutStage.querySelectorAll(".scene")];

let step = 0;
let onDone = null;   // what to do when the tutorial closes

// Opens the tutorial at step 1. "done" runs when they finish or skip.
export function openTutorial(done) {
  onDone = done;
  step = 0;
  showStep();
  tutorial.classList.remove("hidden");
  tutNext.focus();
}

function showStep() {
  const last = step === STEPS.length - 1;

  // Show only this step's picture, and restart its animation from the beginning
  scenes.forEach((svg, i) => svg.classList.toggle("hidden", i !== step));
  const svg = scenes[step];
  if (reduceMotion.matches) {
    svg.pauseAnimations();
    svg.setCurrentTime(STEPS[step].still);
  } else {
    svg.unpauseAnimations();
    svg.setCurrentTime(0);
  }

  // Progress dots and text
  [...tutDots.children].forEach((dot, i) => dot.classList.toggle("active", i === step));
  tutStep.textContent = `Step ${step + 1} of ${STEPS.length}`;
  tutTitle.textContent = STEPS[step].title;
  tutText.textContent = STEPS[step].text;

  // Replay the little text fade-in
  for (const el of [tutTitle, tutText]) {
    el.classList.remove("swap");
    void el.offsetWidth; // forces the browser to notice the class was removed
    el.classList.add("swap");
  }

  // On the last step, "Next" becomes "Let's draw!" and "Skip" isn't needed
  tutNext.textContent = last ? "Let's draw! ✨" : "Next";
  tutSkip.classList.toggle("invisible", last);
}

function next() {
  if (step < STEPS.length - 1) { step++; showStep(); }
  else finish();
}

function back() {
  if (step > 0) { step--; showStep(); }
}

function finish() {
  markSeen();
  tutorial.classList.add("hidden");
  const done = onDone;
  onDone = null;
  if (done) done();
}

tutNext.addEventListener("click", next);
tutSkip.addEventListener("click", finish);

// Keyboard: → next, ← back, Esc skips
window.addEventListener("keydown", (e) => {
  if (tutorial.classList.contains("hidden")) return;
  if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") back();
  else if (e.key === "Escape") finish();
});
