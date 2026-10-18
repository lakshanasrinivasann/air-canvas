/* =========================================================
   AIR CANVAS — THE BRAINS
   Reads the webcam, finds your hand with Google MediaPipe,
   works out which gesture you're making, and draws.
   Everything runs on your own device. Nothing is uploaded.
   ========================================================= */

// The step-by-step tutorial lives in its own file
import { openTutorial, hasSeenTutorial } from "./tutorial.js";


/* ---------------------------------------------------------
   1. SETTINGS — change these to tweak how the app feels
   --------------------------------------------------------- */

// The colour bubbles shown at the top of the screen
const COLOURS = [
  { name: "Cyan",    value: "#22d3ee" },
  { name: "Magenta", value: "#e879f9" },
  { name: "Lime",    value: "#a3e635" },
  { name: "Yellow",  value: "#facc15" },
  { name: "Orange",  value: "#fb923c" },
  { name: "White",   value: "#f8fafc" },
];

// Brush sizes (thickness in pixels)
const BRUSH_SIZES = [
  { name: "Small",  value: 4  },
  { name: "Medium", value: 8  },
  { name: "Large",  value: 15 },
];

const COLOUR_PICK_TIME = 1000;   // ms to hover over a bubble to pick it
const CLEAR_TIME       = 2000;   // ms to hold an open palm to clear
const SMOOTHING        = 0.45;   // 0 = very smooth but laggy, 1 = raw & jittery
const STABLE_FRAMES    = 3;      // a gesture must be seen this many frames in a row
const NO_HAND_HINT_MS  = 1500;   // show "show your hand" hint after this long

// Where the hand-tracking library and its "hand model" are downloaded from.
// These are just program files — your camera video never goes anywhere.
const MEDIAPIPE_VERSION = "0.10.14";
const MEDIAPIPE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/vision_bundle.mjs`;
const WASM_URL      = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL     = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";


/* ---------------------------------------------------------
   2. GRAB THE PIECES OF THE PAGE WE NEED
   --------------------------------------------------------- */
const $ = (id) => document.getElementById(id);

const welcome     = $("welcome");
const loader      = $("loader");
const loaderText  = $("loaderText");
const errorScreen = $("errorScreen");
const stage       = $("stage");
const video       = $("camera");
const paintCanvas   = $("paintCanvas");
const overlayCanvas = $("overlayCanvas");
const paintCtx   = paintCanvas.getContext("2d");
const overlayCtx = overlayCanvas.getContext("2d");
const palette  = $("palette");
const guide    = $("guide");
const guideBtn = $("guideBtn");
const hint     = $("hint");
const toast    = $("toast");


/* ---------------------------------------------------------
   3. THE APP'S MEMORY ("state")
   --------------------------------------------------------- */
let handLandmarker = null;       // the MediaPipe hand tracker
let trackerPromise = null;       // the tracker while it's still downloading
let paused = false;              // true while the tutorial is open over the drawing
let currentColour = COLOURS[0].value;
let sizeIndex = 1;               // start on "Medium"

let strokes = [];                // every finished line: { color, size, points: [{x,y}] }
let history = [];                // list of actions, so Undo knows what to reverse
let liveStroke = null;           // the line currently being drawn (or null)

let smoothTip = null;            // the steadied fingertip position
let gesture = "none";            // the confirmed gesture right now
let candidate = "none";          // a gesture we've seen but not yet confirmed
let candidateCount = 0;

let pickTarget = null;           // the bubble we're hovering over
let pickStart = 0;
let palmStart = 0;               // when the open palm was first seen (0 = not)
let palmLocked = false;          // stops repeated clears until the palm is lowered

let lastVideoTime = -1;
let lastHandSeen = 0;
let screenW = 0, screenH = 0, dpr = 1;


/* ---------------------------------------------------------
   4. BUILD THE COLOUR BUBBLES
   --------------------------------------------------------- */
const bubbles = COLOURS.map((c) => {
  const b = document.createElement("button");
  b.className = "bubble";
  b.style.setProperty("--c", c.value);
  b.title = c.name;
  b.setAttribute("aria-label", `${c.name} colour`);
  b.dataset.colour = c.value;
  b.dataset.name = c.name;
  // Tapping / clicking a bubble also works
  b.addEventListener("click", () => selectColour(b));
  palette.appendChild(b);
  return b;
});
bubbles[0].classList.add("active");

function selectColour(bubble) {
  currentColour = bubble.dataset.colour;
  bubbles.forEach((b) => b.classList.toggle("active", b === bubble));
  updateSizeButton();
  showToast(`🎨 ${bubble.dataset.name}`);
}


/* ---------------------------------------------------------
   5. STARTING UP: camera first, then the hand tracker
   --------------------------------------------------------- */
$("startBtn").addEventListener("click", () => {
  // Begin downloading the hand tracker straight away (this doesn't need the camera),
  // so it's ready sooner.
  getTracker();
  // First visit: show the tutorial, then start. Otherwise start right away.
  if (hasSeenTutorial()) {
    start();
  } else {
    welcome.classList.add("hidden");
    openTutorial(start);
  }
});
$("retryBtn").addEventListener("click", start);

// Downloads the hand tracker only once, even if asked several times.
// If the download fails, we forget it so "Try again" can download it again.
function getTracker() {
  if (!trackerPromise) {
    trackerPromise = loadHandTracker();
    trackerPromise.catch(() => { trackerPromise = null; });
  }
  return trackerPromise;
}

async function start() {
  welcome.classList.add("hidden");
  errorScreen.classList.add("hidden");
  loader.classList.remove("hidden");
  loaderText.textContent = "Asking for your camera…";

  // Cameras only work on secure pages (https:// or localhost)
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return showError("insecure");
  }

  // Make sure the hand tracker is downloading while we ask for the camera
  const tracker = getTracker();

  // --- Ask for the camera ---
  // (If we're retrying, switch off any camera stream from the last attempt first)
  if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    console.error(err);
    return showError(err.name);
  }

  // --- Wait for the hand tracker ---
  loaderText.textContent = "Warming up the hand tracker…";
  try {
    handLandmarker = await tracker;
  } catch (err) {
    console.error(err);
    return showError("tracker");
  }

  // --- Everything ready: show the drawing stage ---
  loader.classList.add("hidden");
  stage.classList.remove("hidden");
  document.querySelector(".bg-glow").classList.add("hidden");
  resizeCanvases();
  updateSizeButton();
  // On small phones, start with the guide tucked away
  if (window.innerWidth < 700) setGuide(false);
  requestAnimationFrame(loop);
}

// Downloads MediaPipe and prepares the hand-tracking model
async function loadHandTracker() {
  const { FilesetResolver, HandLandmarker } = await import(MEDIAPIPE_URL);
  const files = await FilesetResolver.forVisionTasks(WASM_URL);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL_URL, delegate },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.5,
  });
  // Try the faster graphics-card mode first; fall back to normal mode if it fails
  try {
    return await HandLandmarker.createFromOptions(files, options("GPU"));
  } catch {
    return await HandLandmarker.createFromOptions(files, options("CPU"));
  }
}


/* ---------------------------------------------------------
   6. FRIENDLY ERROR MESSAGES
   --------------------------------------------------------- */
const ERRORS = {
  NotAllowedError: {
    icon: "🔒", title: "Camera access was blocked",
    text: "Air Canvas needs your camera to see your hand. Click the camera or lock icon in your browser's address bar, choose “Allow”, then try again. Remember: nothing is recorded or uploaded.",
  },
  NotFoundError: {
    icon: "📷", title: "No camera found",
    text: "We couldn't find a webcam on this device. Plug one in (or try on a laptop or phone with a camera), then try again.",
  },
  NotReadableError: {
    icon: "⏳", title: "Your camera is busy",
    text: "Another app (like Zoom, Teams or another browser tab) might be using your camera. Close it and try again.",
  },
  insecure: {
    icon: "🛡️", title: "This page needs a secure address",
    text: "Browsers only allow cameras on https:// pages or on localhost. Open the page through a local server or GitHub Pages (see the README).",
  },
  tracker: {
    icon: "📡", title: "Couldn't load the hand tracker",
    text: "The hand-tracking files didn't download. Check your internet connection and try again.",
  },
  default: {
    icon: "😕", title: "Something went wrong",
    text: "We couldn't start the camera. Please refresh the page and try again.",
  },
};
// Some browsers use different names for the same problems
ERRORS.PermissionDeniedError = ERRORS.NotAllowedError;
ERRORS.SecurityError = ERRORS.NotAllowedError;
ERRORS.DevicesNotFoundError = ERRORS.NotFoundError;
ERRORS.OverconstrainedError = ERRORS.NotFoundError;
ERRORS.TrackStartError = ERRORS.NotReadableError;

function showError(kind) {
  const e = ERRORS[kind] || ERRORS.default;
  $("errorIcon").textContent = e.icon;
  $("errorTitle").textContent = e.title;
  $("errorMessage").textContent = e.text;
  loader.classList.add("hidden");
  errorScreen.classList.remove("hidden");
}


/* ---------------------------------------------------------
   7. CANVAS SIZING — keep the drawing sharp on any screen
   --------------------------------------------------------- */
function resizeCanvases() {
  screenW = window.innerWidth;
  screenH = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2x for speed
  for (const c of [paintCanvas, overlayCanvas]) {
    c.width = Math.round(screenW * dpr);
    c.height = Math.round(screenH * dpr);
    // Lets us draw using normal screen pixels while staying crisp
    c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  redrawAll();
}
window.addEventListener("resize", resizeCanvases);


/* ---------------------------------------------------------
   8. THE MAIN LOOP — runs about 60 times per second
   --------------------------------------------------------- */
function loop() {
  // Only ask MediaPipe to look when the camera has a new picture
  // (and not while the tutorial is open on top)
  if (!paused && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = handLandmarker.detectForVideo(video, performance.now());
    handleHand(result.landmarks && result.landmarks[0]);
  }
  requestAnimationFrame(loop);
}


/* ---------------------------------------------------------
   9. UNDERSTANDING THE HAND
   MediaPipe gives 21 dots per hand. Useful ones:
   0 = wrist, 4 = thumb tip, 8 = index tip, 12 = middle tip,
   16 = ring tip, 20 = pinky tip. The joint below each tip
   (6, 10, 14, 18) tells us whether that finger is bent.
   --------------------------------------------------------- */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// A finger is "up" if its tip is further from the wrist than its middle joint
function fingerUp(lm, tip, joint) {
  return dist(lm[tip], lm[0]) > dist(lm[joint], lm[0]) * 1.1;
}

function readGesture(lm) {
  const index  = fingerUp(lm, 8, 6);
  const middle = fingerUp(lm, 12, 10);
  const ring   = fingerUp(lm, 16, 14);
  const pinky  = fingerUp(lm, 20, 18);
  // Thumb is "out" if its tip is far from the base of the little finger
  const thumb  = dist(lm[4], lm[17]) > dist(lm[3], lm[17]) * 1.1;

  if (index && middle && ring && pinky && thumb) return "palm";
  if (index && middle && !ring && !pinky)        return "hover";
  if (index && !middle && !ring && !pinky)       return "draw";
  return "none";
}

// Turns MediaPipe's 0–1 numbers into screen pixels.
// The video is mirrored and cropped to fill the screen, so we do the same here.
function toScreen(p) {
  const vw = video.videoWidth || screenW;
  const vh = video.videoHeight || screenH;
  const scale = Math.max(screenW / vw, screenH / vh);
  const w = vw * scale, h = vh * scale;
  return {
    x: (1 - p.x) * w - (w - screenW) / 2,   // (1 - x) = mirror flip
    y: p.y * h - (h - screenH) / 2,
  };
}

function handleHand(lm) {
  const now = performance.now();

  // ---- No hand in view ----
  if (!lm) {
    finishStroke();
    smoothTip = null;
    gesture = candidate = "none";
    candidateCount = 0;
    resetPick();
    palmStart = 0;
    palmLocked = false;
    hint.classList.toggle("show", now - lastHandSeen > NO_HAND_HINT_MS);
    drawOverlay(null);
    return;
  }
  lastHandSeen = now;
  hint.classList.remove("show");

  // ---- Confirm the gesture only once it's steady (avoids flicker) ----
  const seen = readGesture(lm);
  if (seen === candidate) candidateCount++;
  else { candidate = seen; candidateCount = 1; }
  if (candidateCount >= STABLE_FRAMES) gesture = candidate;

  // ---- Steady the fingertip position ----
  const rawTip = toScreen(lm[8]);
  if (!smoothTip) smoothTip = rawTip;
  else {
    smoothTip = {
      x: smoothTip.x + (rawTip.x - smoothTip.x) * SMOOTHING,
      y: smoothTip.y + (rawTip.y - smoothTip.y) * SMOOTHING,
    };
  }
  const tip = smoothTip;
  const pointing = gesture === "draw" || gesture === "hover";

  // ---- Colour picking: is the fingertip over a bubble? ----
  const overBubble = pointing ? bubbleAt(tip) : null;
  if (overBubble) {
    if (overBubble !== pickTarget) {
      resetPick();
      pickTarget = overBubble;
      pickStart = now;
      pickTarget.classList.add("picking");
    } else if (now - pickStart >= COLOUR_PICK_TIME && !pickTarget.classList.contains("active")) {
      selectColour(pickTarget);
    }
  } else {
    resetPick();
  }

  // ---- Drawing ----
  if (gesture === "draw" && !overBubble) addPoint(tip);
  else finishStroke();

  // ---- Open palm held = clear ----
  let palmProgress = 0;
  if (gesture === "palm" && !palmLocked) {
    if (!palmStart) palmStart = now;
    palmProgress = (now - palmStart) / CLEAR_TIME;
    if (palmProgress >= 1) {
      clearCanvas();
      palmStart = 0;
      palmLocked = true; // lower your hand before you can clear again
      palmProgress = 0;
    }
  } else if (gesture !== "palm") {
    palmStart = 0;
    palmLocked = false;
  }

  drawOverlay({ tip, palm: toScreen(lm[9]), palmProgress, now });
}

// Which bubble (if any) is under this point? A little extra margin makes it easier.
function bubbleAt(p) {
  const pad = 8;
  return bubbles.find((b) => {
    const r = b.getBoundingClientRect();
    return p.x > r.left - pad && p.x < r.right + pad && p.y > r.top - pad && p.y < r.bottom + pad;
  }) || null;
}

function resetPick() {
  if (pickTarget) pickTarget.classList.remove("picking");
  pickTarget = null;
}


/* ---------------------------------------------------------
   10. DRAWING THE GLOWING NEON LINES
   --------------------------------------------------------- */
function addPoint(p) {
  if (!liveStroke) {
    liveStroke = { color: currentColour, size: BRUSH_SIZES[sizeIndex].value, points: [p] };
    return;
  }
  // Skip tiny wobbles so lines stay clean
  const last = liveStroke.points[liveStroke.points.length - 1];
  if (dist(last, p) > 1.5) liveStroke.points.push({ x: p.x, y: p.y });
}

// The finger left "draw" mode: save the line onto the painting layer
function finishStroke() {
  if (!liveStroke) return;
  strokes.push(liveStroke);
  history.push({ type: "stroke" });
  drawStroke(paintCtx, liveStroke);
  liveStroke = null;
}

// Traces a smooth curve through the points (instead of jagged straight bits)
function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 1) {
    ctx.lineTo(pts[0].x + 0.01, pts[0].y); // a single dot
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      // Curve towards the midpoint between this point and the next
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }
    const end = pts[pts.length - 1];
    ctx.lineTo(end.x, end.y);
  }
}

// Draws one stroke as neon: a wide coloured glow + a thin bright core
function drawStroke(ctx, stroke) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter"; // overlapping light adds up, like real neon
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Pass 1 — the soft coloured glow
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.shadowColor = stroke.color;
  ctx.shadowBlur = stroke.size * 2.5 * dpr;
  tracePath(ctx, stroke.points);
  ctx.stroke();

  // Pass 2 — the hot white centre
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = Math.max(1.5, stroke.size * 0.35);
  ctx.shadowBlur = stroke.size * dpr;
  tracePath(ctx, stroke.points);
  ctx.stroke();

  ctx.restore();
}

// Wipes the painting layer and draws every saved stroke again
function redrawAll() {
  paintCtx.clearRect(0, 0, screenW, screenH);
  for (const s of strokes) drawStroke(paintCtx, s);
}


/* ---------------------------------------------------------
   11. THE TOP "HELPER" LAYER: live line, cursor, rings
   --------------------------------------------------------- */
function drawOverlay(info) {
  overlayCtx.clearRect(0, 0, screenW, screenH);
  if (liveStroke) drawStroke(overlayCtx, liveStroke);
  if (!info) return;
  const { tip, palm, palmProgress, now } = info;

  // Cursor
  if (gesture === "hover") {
    ring(tip.x, tip.y, 12, 1, currentColour, 2, 0.9);
    dot(tip.x, tip.y, 3, currentColour);
  } else if (gesture === "draw") {
    dot(tip.x, tip.y, BRUSH_SIZES[sizeIndex].value / 2 + 2, "#ffffff");
  }

  // Colour-pick progress ring around the bubble
  if (pickTarget && !pickTarget.classList.contains("active")) {
    const r = pickTarget.getBoundingClientRect();
    const progress = Math.min((now - pickStart) / COLOUR_PICK_TIME, 1);
    ring(r.left + r.width / 2, r.top + r.height / 2, r.width / 2 + 7, 1, "#ffffff", 3, 0.15);
    ring(r.left + r.width / 2, r.top + r.height / 2, r.width / 2 + 7, progress, pickTarget.dataset.colour, 3, 1);
  }

  // Clear countdown ring on the palm
  if (palmProgress > 0) {
    ring(palm.x, palm.y, 46, 1, "#ffffff", 5, 0.15);
    ring(palm.x, palm.y, 46, palmProgress, "#f87171", 5, 1);
    overlayCtx.save();
    overlayCtx.fillStyle = "#ffffff";
    overlayCtx.font = "600 20px Inter, system-ui, sans-serif";
    overlayCtx.textAlign = "center";
    overlayCtx.textBaseline = "middle";
    overlayCtx.fillText(Math.ceil((1 - palmProgress) * (CLEAR_TIME / 1000)), palm.x, palm.y);
    overlayCtx.font = "500 12px Inter, system-ui, sans-serif";
    overlayCtx.fillText("Clearing…", palm.x, palm.y + 66);
    overlayCtx.restore();
  }
}

// Draws a ring; "progress" (0–1) controls how much of the circle is drawn
function ring(x, y, radius, progress, color, width, alpha) {
  overlayCtx.save();
  overlayCtx.globalAlpha = alpha;
  overlayCtx.strokeStyle = color;
  overlayCtx.lineWidth = width;
  overlayCtx.lineCap = "round";
  overlayCtx.shadowColor = color;
  overlayCtx.shadowBlur = 10;
  overlayCtx.beginPath();
  overlayCtx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  overlayCtx.stroke();
  overlayCtx.restore();
}

function dot(x, y, radius, color) {
  overlayCtx.save();
  overlayCtx.fillStyle = color;
  overlayCtx.globalAlpha = 0.85;
  overlayCtx.shadowColor = currentColour;
  overlayCtx.shadowBlur = 14;
  overlayCtx.beginPath();
  overlayCtx.arc(x, y, radius, 0, Math.PI * 2);
  overlayCtx.fill();
  overlayCtx.restore();
}


/* ---------------------------------------------------------
   12. BUTTONS: undo, brush size, save, guide
   --------------------------------------------------------- */
function undo() {
  finishStroke();
  const last = history.pop();
  if (!last) return showToast("Nothing to undo");
  if (last.type === "stroke") strokes.pop();
  if (last.type === "clear") strokes = last.previous; // bring back what was cleared
  redrawAll();
}

function clearCanvas() {
  finishStroke();
  if (!strokes.length) return;
  history.push({ type: "clear", previous: strokes });
  strokes = [];
  redrawAll();
  showToast("✨ Canvas cleared — Undo brings it back");
}

function updateSizeButton() {
  const size = BRUSH_SIZES[sizeIndex];
  const dotEl = $("sizeDot");
  const px = 6 + size.value;
  dotEl.style.width = dotEl.style.height = `${px}px`;
  dotEl.style.color = currentColour;
  $("sizeLabel").textContent = size.name;
}

function cycleSize() {
  sizeIndex = (sizeIndex + 1) % BRUSH_SIZES.length;
  updateSizeButton();
  showToast(`Brush: ${BRUSH_SIZES[sizeIndex].name}`);
}

// Saves the drawing (on a dark background, without the camera picture) as a PNG
function saveArt() {
  finishStroke();
  if (!strokes.length) return showToast("Draw something first ✏️");
  const out = document.createElement("canvas");
  out.width = paintCanvas.width;
  out.height = paintCanvas.height;
  const ctx = out.getContext("2d");
  ctx.fillStyle = "#06060b";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(paintCanvas, 0, 0);

  out.toBlob((blob) => {
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    link.download = `air-canvas-${stamp}.png`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
    showToast("💾 Saved to your downloads");
  }, "image/png");
}

function setGuide(open) {
  guide.classList.toggle("closed", !open);
  guideBtn.setAttribute("aria-pressed", String(open));
}

$("undoBtn").addEventListener("click", undo);
$("sizeBtn").addEventListener("click", cycleSize);
$("saveBtn").addEventListener("click", saveArt);
guideBtn.addEventListener("click", () => setGuide(guide.classList.contains("closed")));
$("guideClose").addEventListener("click", () => setGuide(false));

// The "?" button replays the tutorial. Drawing pauses until it's closed.
$("helpBtn").addEventListener("click", () => {
  paused = true;
  finishStroke();
  resetPick();
  palmStart = 0;
  hint.classList.remove("show");
  overlayCtx.clearRect(0, 0, screenW, screenH);
  openTutorial(() => { paused = false; });
});

// Keyboard shortcut: Ctrl+Z (or Cmd+Z on Mac) to undo
window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !stage.classList.contains("hidden") && !paused) {
    e.preventDefault();
    undo();
  }
});


/* ---------------------------------------------------------
   13. LITTLE POP-UP MESSAGES
   --------------------------------------------------------- */
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}
