import { vi } from "vitest";

// Every module under test imports `new PrismaClient()` at module scope
// (standard practice), which normally requires a generated client tied to a
// real DATABASE_URL. For pure-logic unit tests, that's unrelated noise —
// this stubs the constructor so importing those modules doesn't require a
// live database at all. Integration tests that actually need real Prisma
// behavior are a separate, larger effort (a test database, seeded fixtures)
// and aren't faked here — see docs/ARCHITECTURE.md for that as a follow-up.
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor() {
      return new Proxy(this, {
        get() {
          throw new Error("PrismaClient is stubbed in unit tests — this test hit real DB-touching code, which needs an integration test instead.");
        },
      });
    }
  },
}));
