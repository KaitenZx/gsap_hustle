# ✨ Glitchy Pixels Interactive Portfolio ✨

This project is my deep-dive into the world of high-performance, animation-driven web experiences. It's a playground where I've pushed the boundaries of creative coding to build a portfolio that's as visually compelling as the art it showcases.

[![React 19](https://img.shields.io/badge/React-19-blue?style=flat-square&logo=react)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/) [![GSAP](https://img.shields.io/badge/GSAP-Club-green?style=flat-square&logo=greensock)](https://gsap.com/) [![Vite](https://img.shields.io/badge/Vite-6-purple?style=flat-square&logo=vite)](https://vitejs.dev/) [![SCSS Modules](https://img.shields.io/badge/SCSS-Modules-pink?style=flat-square&logo=sass)](https://sass-lang.com/)

**➡️ Explore the live experience:** **[https://glitchypixels.me](https://glitchypixels.me)**

---

## 🛠️ Tech Choices & Architectural Philosophy

This project was built with a specific philosophy: to blend artistic expression with robust, performance-first engineering. Here are the key architectural patterns and technologies that brought it to life.

### Key Architectural Patterns

- **The "Conductor-Orchestra" Hook Model:** Instead of monolithic components, all complex logic is deconstructed into specialized, single-responsibility custom hooks. Main components like `InfiniteGallery` act as "conductors," orchestrating these hooks. This keeps the component's JSX clean and declarative while isolating complex state management and side effects.

- **Custom Physics-Based Interaction:** I threw out native browser scrolling for the gallery. Instead, a custom interaction model built with **`GSAP Observer`** and **`InertiaPlugin`** provides a fluid, physics-based experience. This gives me absolute control over the feel of the scroll and enables a seamless, looping 2D grid.

- **Performance-First Rendering:** Every animation is built with performance as a core requirement.

  - **Main-Thread Offloading:** Heavy procedural animations are exiled to **Web Workers** with **`OffscreenCanvas`**, ensuring the main thread stays buttery smooth for user interactions.
  - **Adaptive Animation:** The background canvas animations are "smart." They self-throttle their own FPS and dynamically reduce their complexity (a technique I call "sparsity") during heavy user interaction, freeing up CPU resources when they're needed most.

- **Procedural Visuals with SDF:** The ASCII background effect in the "About Me" section isn't a video or a GIF. It's generated in real-time using **Signed Distance Fields (SDF)**, a mathematical technique that allows for creating and manipulating complex, organic shapes with code, producing a unique visual on every visit.

### Core Technologies

- **React 19:** The project is built on React 19. While the codebase currently employs manual memoization (`useCallback`, `useMemo`) typical of React 18 paradigms, it is fully configured with the **new React Compiler**. This makes the project forward-compatible and primes the complex, hook-heavy architecture for significant simplification in future refactoring.

- **GSAP (GreenSock Animation Platform):** GSAP is the heart of all motion on the site. It's used for everything from orchestrating complex, scroll-based timelines with `ScrollTrigger` to implementing the custom physics model.

- **TypeScript:** End-to-end type safety for a more reliable and maintainable codebase.

- **Vite & SCSS Modules:** A fast, modern build setup with component-scoped styling to keep the CSS manageable and conflict-free.

---

## 🚀 Run Locally

**Prerequisites:** Node.js (v20+), pnpm (v10+), Git.

1.  **Clone & Install:**

    ```bash
    git clone https://github.com/KaitenZx/gsap_hustle.git
    cd gsap_hustle
    pnpm install
    ```

2.  **Run the Development Server:**
    ```bash
    pnpm dev
    ```
    The project will be available at `http://localhost:5173`.

---

## 👋 Connect

Yura Shakhov

- LinkedIn: [https://www.linkedin.com/in/yura-sh](https://www.linkedin.com/in/yura-sh)
- GitHub: [https://github.com/KaitenZx](https://github.com/KaitenZx)
- Telegram: `@KTNNTN`
