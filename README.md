# IronTrack — Unified Training Portal

A technical/brutalist training management system for coaches and trainees. Built with React (Vite), TypeScript, Tailwind CSS, Framer Motion, and Lucide Icons.

---

## Project Structure

```
irontrack/
├── src/
│   ├── App.tsx                          # Root: routing, auth state, shell
│   ├── main.tsx                         # React entry point
│   ├── index.css                        # Tailwind + CSS custom properties
│   ├── types.ts                         # Shared TypeScript interfaces
│   ├── constants/
│   │   └── mockData.ts                  # DEFAULT_COLUMNS, MOCK_PROGRAM, INITIAL_CLIENTS
│   ├── lib/
│   │   └── utils.ts                     # cn() utility (clsx + tailwind-merge)
│   ├── hooks/
│   │   ├── useAuth.ts                   # Login/logout state machine
│   │   └── useProgramData.ts            # localStorage persistence + client CRUD
│   └── components/
│       ├── ui/
│       │   ├── TechnicalCard.tsx        # Base card primitive
│       │   ├── TechnicalInput.tsx       # Borderless mono input
│       │   └── Modal.tsx                # Animated overlay modal
│       ├── admin/
│       │   ├── AdminView.tsx            # Client selector + program editor layout
│       │   ├── ColumnModal.tsx          # Add / edit column dialog
│       │   └── ProgramEditor.tsx        # Full week/day/exercise editor with column sync
│       └── trainee/
│           ├── ClientDashboard.tsx      # Week selector + day cards
│           └── WorkoutGridLogger.tsx    # Horizontal grid for logging actual values
├── tests/
│   ├── requirements.txt                 # Python dependencies
│   ├── conftest.py                      # Shared fixtures and login helper
│   └── test_workout.py                  # E2E tests: login, add column, log set
├── index.html
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

---

## React App Setup

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5173)
npm run dev

# Type-check + production build
npm run build

# Lint (zero warnings enforced)
npm run lint
```

### Seed Accounts

The following accounts are seeded on first launch. Passwords are stored as SHA-256 hashes — never in plaintext.

| Role    | Email                | Seed password |
|---------|----------------------|---------------|
| Coach   | coach@example.com    | `123`         |
| Trainee | noammrks@gmail.com   | `123`         |
| Trainee | sarah.c@example.com  | `123`         |

> **Note:** These seed credentials are for local development only. Change or remove them before deploying to a shared environment. New accounts created via the UI require a password of at least 8 characters with at least one letter and one number.

### State Persistence

All client and program data is stored in `localStorage` under the key `irontrack_clients`. Clearing localStorage resets to the built-in seed data. On each load, `useProgramData` automatically migrates any legacy plaintext passwords to SHA-256 hashes.

---

## Python E2E Test Suite

Tests use [Playwright for Python](https://playwright.dev/python/) with `pytest-playwright`.

### Prerequisites

- Python 3.9+
- The React dev server running on `http://localhost:5173`

### Setup

```bash
cd tests

# Create a virtual environment
python -m venv .venv

# Activate it
# Windows:
.venv\Scripts\activate
# macOS / Linux:
source .venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers (Chromium only for speed)
playwright install chromium
```

### Run Tests

```bash
# From the tests/ directory (dev server must be running)
pytest test_workout.py -v

# Run against a specific browser
pytest test_workout.py -v --browser firefox

# Run in headed mode (see the browser)
pytest test_workout.py -v --headed

# Run a single test class
pytest test_workout.py::TestLogin -v
```

### Test Coverage

| Test Class              | What it covers                                      |
|-------------------------|-----------------------------------------------------|
| `TestLogin`             | Coach login, trainee login, invalid credentials     |
| `TestAdminColumnManagement` | Add Plan column, add Actual column in Admin panel |
| `TestWorkoutLogging`    | Log actual load, log RPE, save returns to dashboard |

---

## Key Design Decisions

- **Column sync**: Adding/deleting an exercise or day propagates across all weeks by matching on `dayNumber` and exercise index — not ID — so structural edits stay coherent across the entire training block.
- **Dynamic columns**: `ProgramColumn[]` is stored on each `Program`. Plan columns render as read-only in the logger; Actual columns render as editable inputs.
- **`data-testid` attributes**: All interactive elements relevant to E2E testing carry explicit `data-testid` props so tests are resilient to style changes.
- **localStorage migration**: `useProgramData` runs a migration pass on load to backfill `role`, `password`, `columns`, and `values` fields added in later versions.
- **Password hashing**: Passwords are SHA-256 hashed (Web Crypto API) before being written to `localStorage`. Login hashes the submitted value and compares digests. New accounts require ≥8 chars, ≥1 letter, ≥1 number.
- **Bootstrap gate**: The login button is disabled until the async localStorage migration completes, preventing a race condition where a login attempt against an empty client list would always fail.
