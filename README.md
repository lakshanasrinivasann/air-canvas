# ☝️ Air Canvas

Draw in the air with your hand. Your webcam follows your fingertip and paints glowing neon lines on the screen.

**100% private:** everything runs in your browser. Your camera video is never uploaded, recorded or saved.

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger up | Draw |
| ✌️ Index + middle finger up | Move without drawing |
| Hover over a colour bubble for 1 second | Pick that colour |
| 🖐️ Open palm held for 2 seconds | Clear the canvas (Undo brings it back) |

Buttons: **Undo** (or Ctrl+Z), **Brush size**, **Save** (downloads a PNG), **Guide** (show/hide the gesture help), **Tutorial** (replay the walkthrough).

On the first visit, a 4-step animated tutorial appears after clicking Start. The browser remembers that it's been seen (in `localStorage`, on that device only), so it won't show again automatically.

## Files

- `index.html`: the page layout
- `style.css`: the look and the animations
- `app.js`: camera, hand tracking, gestures and drawing
- `tutorial.js`: the step-by-step tutorial and its animated hand pictures

