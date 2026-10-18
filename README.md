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

Hand tracking uses [Google MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker). The page downloads it from a CDN, so there's nothing to install.

## Run it on your computer

Browsers only allow the camera on `https://` pages or on `localhost`, so double-clicking `index.html` may not work. Use a local server instead:

1. Open this folder in **VS Code**.
2. Install the **Live Server** extension (by Ritwick Dey).
3. Right-click `index.html` and choose **Open with Live Server**.

## Put it online for free (GitHub Pages)

1. Create a new public repository on GitHub, for example `air-canvas`.
2. Upload these files to it (drag and drop them on the repo page, or use `git push`).
3. In the repo, go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, then pick `main` and `/ (root)`, and click Save.
4. After about a minute your site is live at `https://<your-username>.github.io/air-canvas/`.
