# StarWave

Real-time hand gesture controlled 3D particle system powered by Three.js and MediaPipe.

## Features

- 6 particle patterns: heart, cube, sphere, torus, galaxy, wave
- Real-time hand gesture recognition using MediaPipe Hands
- Scale control via hand pinch gesture
- Rotation control via hand position
- Real-time color customization
- Fullscreen mode support
- Smooth particle animations with custom shaders

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation

```bash
npm install
```

## Development

Run the development server:

```bash
npm run dev
```

The app will automatically open in your browser at `http://localhost:3000`

## Build

Create a production build:

```bash
npm run build
```

## Preview Production Build

Preview the production build locally:

```bash
npm run preview
```

## Usage

1. Select a particle pattern from the control panel
2. Customize particle color with the color picker
3. Click "Start Camera" to enable hand gesture control
4. Control the particles:
   - **Scale**: Pinch your thumb and index finger together/apart
   - **Rotation**: Move your hand left/right for Y-axis rotation, up/down for X-axis rotation
5. Toggle fullscreen for an immersive experience

## Tech Stack

- **Frontend**: React 18
- **3D Graphics**: Three.js with custom GLSL shaders
- **Hand Tracking**: MediaPipe Hands (loaded via CDN)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS

## Browser Requirements

- Modern browser with WebGL support
- Webcam access for hand gesture control
- Recommended: Chrome or Edge for best MediaPipe performance
