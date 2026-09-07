# TDD Guide — DMRXAI

Panduan Test-Driven Development untuk project DMRXAI.

---

## Quick Start

```bash
# Install dependencies (activates husky hooks)
npm install

# Run all tests
npm test

# Run tests in watch mode (vitest native)
npm run test:watch

# Run TDD watcher (auto test + lint on file change)
npm run tdd:watch

# Check coverage
npm run test:coverage

# Validate TDD compliance
npm run check-tdd
```

---

## Project Test Structure

```
tests/
├── setup.ts                    # Global test setup
├── __mocks__/
│   └── server-only.ts          # Mock for server-only imports
├── hooks/
│   ├── useTheme.test.ts
│   ├── useSettings.test.ts
│   ├── useChat.test.ts
│   ├── useImageGenerator.test.ts
│   └── useBuilderSession.test.ts
├── agent-tools.test.ts
├── auto-mode.test.ts
├── build-intent.test.ts
├── builder-storage.test.ts
├── chat-db.test.ts
├── e2b-sandbox.test.ts
├── image-gen-db.test.ts
├── migrate-local.test.ts
├── model-categories.test.ts
├── sandbox-interface.test.ts
├── server-config.test.ts
├── storage.test.ts
├── supabase-projects.test.ts
├── auth-server.test.ts
├── auth-session.test.ts
└── user-settings-db.test.ts
```

---

## Adding a New File (TDD Workflow)

### Step 1: Create the test first

Tulis test sebelum menulis implementasi. Ini memastikan kamu memikirkan behavior yang diharapkan terlebih dahulu.

```typescript
// tests/my-module.test.ts
import { describe, it, expect } from "vitest";
import { myFunction } from "@/lib/my-module";

describe("myFunction", () => {
  it("should return expected result for valid input", () => {
    const result = myFunction("input");
    expect(result).toBe("expected output");
  });

  it("should throw error for invalid input", () => {
    expect(() => myFunction("")).toThrow("Input is required");
  });
});
```

Jalankan test — pastikan GAGAL (Red phase):

```bash
npx vitest run tests/my-module.test.ts
```

### Step 2: Create the source file

Tulis implementasi minimal yang membuat test pass (Green phase):

```typescript
// app/lib/my-module.ts
export function myFunction(input: string): string {
  if (!input) throw new Error("Input is required");
  return "expected output";
}
```

### Step 3: Run and verify

```bash
# Run the specific test
npx vitest run tests/my-module.test.ts

# Run all tests to make sure nothing broke
npm test

# Check TDD compliance
npm run check-tdd
```

Setelah test pass, refactor jika perlu (Refactor phase) — pastikan test tetap pass setelah refactor.

### Step 4: Commit

Commit seperti biasa. Pre-commit hook akan otomatis:
1. Menjalankan `check-tdd.js --staged` untuk memastikan setiap source file punya test
2. Menjalankan `lint-staged` untuk lint file yang di-stage

```bash
git add app/lib/my-module.ts tests/my-module.test.ts
git commit -m "feat: add myFunction with tests"
```

---

## File Naming Convention

| Source File | Test File |
|-------------|-----------|
| `app/lib/my-module.ts` | `tests/my-module.test.ts` |
| `app/lib/chat-db.ts` | `tests/chat-db.test.ts` |
| `app/hooks/useMyHook.ts` | `tests/hooks/useMyHook.test.ts` |
| `app/hooks/useChat.ts` | `tests/hooks/useChat.test.ts` |

Script `check-tdd.js` mencari test file berdasarkan basename. Jadi `app/lib/storage.ts` akan dicari di:
- `tests/storage.test.ts`
- `tests/storage.test.tsx`

Dan `app/hooks/useTheme.ts` akan dicari di:
- `tests/hooks/useTheme.test.ts`
- `tests/hooks/useTheme.test.tsx`
- `tests/useTheme.test.ts`
- `tests/useTheme.test.tsx`

---

## Pre-commit Hook

File `.husky/pre-commit` menjalankan dua validasi:

1. **TDD Compliance Check** (`node scripts/check-tdd.js --staged`)
   - Memeriksa semua file staged di `app/lib/` dan `app/hooks/`
   - Memastikan setiap file punya corresponding test di `tests/`
   - Commit akan DITOLAK jika ada source file tanpa test

2. **Lint Staged** (`npx lint-staged`)
   - Menjalankan `next lint --fix` pada file `app/**/*.{ts,tsx}` yang di-stage

**File yang dikecualikan dari TDD check:**
- `*.d.ts` (type declarations)
- `types.ts`
- `*.css`
- `layout.tsx`, `page.tsx`, `route.ts`
- `logger.ts`

**Bypass dalam keadaan darurat:**

```bash
git commit --no-verify -m "hotfix: urgent production fix"
```

> ⚠️ Gunakan `--no-verify` hanya untuk hotfix darurat. Segera tambahkan test setelahnya.

---

## TDD Watcher

Jalankan dengan:

```bash
npm run tdd:watch
```

**Behavior:**
- Memantau perubahan file `.ts` dan `.tsx` di direktori:
  - `app/lib/`
  - `app/hooks/`
  - `app/components/`
  - `app/api/`
  - `tests/`
- Saat file berubah, watcher akan:
  1. Mencari test file yang terkait (berdasarkan nama file)
  2. Menjalankan test tersebut dengan `vitest run`
  3. Menjalankan `next lint` pada source file (bukan test file)
- Menggunakan debounce 500ms untuk menghindari multiple triggers
- Jika tidak ada test ditemukan untuk file yang berubah, akan menampilkan warning

**Contoh output:**

```
👀 TDD Watcher started. Watching for file changes...

Watched directories:
  📂 app/lib/
  📂 app/hooks/
  📂 app/components/
  📂 app/api/
  📂 tests/

📁 Changed: app/lib/storage.ts
🧪 Running test: tests/storage.test.ts
✅ Test passed: tests/storage.test.ts
🔍 Linting: app/lib/storage.ts
✅ Lint passed: app/lib/storage.ts
```

---

## Writing Tests

### Mocking Supabase

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase client
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: "1", name: "test" }, error: null })),
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null })),
    },
  })),
}));

describe("myDbModule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch data from supabase", async () => {
    const result = await fetchData("1");
    expect(result).toEqual({ id: "1", name: "test" });
  });
});
```

### Mocking fetch

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("API calls", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle successful response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ data: "result" }),
    });

    const result = await myApiCall();
    expect(result).toEqual({ data: "result" });
    expect(global.fetch).toHaveBeenCalledWith("/api/endpoint", expect.any(Object));
  });

  it("should handle error response", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(myApiCall()).rejects.toThrow("Internal Server Error");
  });
});
```

### Testing React Hooks

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMyHook } from "@/hooks/useMyHook";

describe("useMyHook", () => {
  it("should initialize with default state", () => {
    const { result } = renderHook(() => useMyHook());

    expect(result.current.value).toBe("");
    expect(result.current.isLoading).toBe(false);
  });

  it("should update value on setValue call", () => {
    const { result } = renderHook(() => useMyHook());

    act(() => {
      result.current.setValue("new value");
    });

    expect(result.current.value).toBe("new value");
  });

  it("should handle async operations", async () => {
    const { result } = renderHook(() => useMyHook());

    await act(async () => {
      await result.current.fetchData();
    });

    expect(result.current.data).toBeDefined();
    expect(result.current.isLoading).toBe(false);
  });
});
```

---

## Coverage Target

- **Minimum:** 80% line coverage untuk `app/lib/**` dan `app/hooks/**`
- Run `npm run test:coverage` untuk memeriksa
- Coverage report di-generate di `coverage/` directory (HTML + text)
- Coverage dikonfigurasi di `vitest.config.ts` pada field `test.coverage`

---

## Troubleshooting

### Pre-commit hook not running

Pastikan husky sudah ter-install:

```bash
# Re-install husky
npm run prepare

# Verify hook file exists and is executable
ls -la .husky/pre-commit
chmod +x .husky/pre-commit
```

Jika masih tidak jalan, pastikan git version >= 2.9 dan cek `.husky/` directory ada di root project.

### Test fails with "Cannot find module"

Project ini menggunakan path alias `@` yang di-resolve ke `./app`. Pastikan import menggunakan alias yang benar:

```typescript
// ✅ Correct
import { myFunction } from "@/lib/my-module";

// ❌ Wrong — will fail in test
import { myFunction } from "../../app/lib/my-module";
```

Alias dikonfigurasi di `vitest.config.ts`:

```typescript
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./app"),
  },
},
```

Jika menambahkan alias baru, update juga di `vitest.config.ts` selain di `tsconfig.json`.

### Server-only import errors in tests

Module `server-only` dari Next.js akan throw error di environment test. Project ini sudah menyediakan mock di `tests/__mocks__/server-only.ts`.

Mock ini otomatis di-resolve via alias di `vitest.config.ts`:

```typescript
resolve: {
  alias: {
    "server-only": path.resolve(__dirname, "./tests/__mocks__/server-only.ts"),
  },
},
```

Jika kamu membuat module baru yang import `server-only`, tidak perlu setup tambahan — mock sudah aktif secara global untuk semua test.
