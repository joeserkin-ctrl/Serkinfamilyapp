# Family Pulse

Family Pulse is a local-first family dashboard MVP that combines shared memory capture with a daily mood-based activity engine.

## MVP included

- A top-level family container with seeded members across adult, child, and proxy roles
- Shared hub mode with larger touch targets, quick member switching, and browser voice input for memory capture
- Direct media upload support for photos, voice notes, and short video snippets from desktop or mobile
- In-app voice and video recording via browser media APIs on supported devices
- Daily mood check-ins with a family mood aggregation layer
- Rule-based activity suggestions tied to the current family mood state
- Family Lore timeline for text plus image/audio/video attachments with inline preview playback
- Weekly recap generation with a weekly hero, participation streak, points, and badge progress
- Local persistence through browser storage with backend-ready typed domain models

## Stack

- React 19
- TypeScript
- Vite 8
- Tailwind CSS via `@tailwindcss/vite`
- Context + reducer state management

## Scripts

- `npm run dev` starts the local development server.
- `npm run build` creates a production build in `dist`.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint.

## Project shape

- `src/types` holds the domain model.
- `src/data` seeds family members, mood options, badges, prompts, and activities.
- `src/lib` contains mood aggregation, activity suggestion, streak, scoring, and recap logic.
- `src/state` manages the local-first app store.
- `src/components` renders the core screens and voice input control.

## Next build steps

1. Replace the seeded data with real onboarding flows and family creation.
2. Split the local store behind an API client so cloud sync can be introduced without rewriting UI logic.
3. Add media upload and authentication once the MVP loop is stable.
