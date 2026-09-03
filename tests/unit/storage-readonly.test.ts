import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Hosted deployments mount the bundle read-only, so storage splits into a
 * bundled read root and a writable temp overlay. These tests pin that split:
 * seeded evidence stays readable, new objects land somewhere writable, and the
 * overlay shadows the bundle rather than corrupting it.
 */

const BUNDLE = path.resolve(process.cwd(), "storage");
const OVERLAY = path.join(os.tmpdir(), "aqary-storage");

async function loadStorage(readOnly: boolean) {
  vi.resetModules();
  if (readOnly) process.env.READ_ONLY_FS = "true";
  else delete process.env.READ_ONLY_FS;
  const mod = await import("@/lib/providers/storage");
  return mod.storage();
}

/** Any key the seed actually produced, so we test a real bundled read. */
async function aSeededKey(): Promise<string> {
  const listings = path.join(BUNDLE, "listings");
  const [listing] = await fs.readdir(listings);
  const docsDir = path.join(listings, listing, "documents");
  const [doc] = await fs.readdir(docsDir);
  const [file] = await fs.readdir(path.join(docsDir, doc));
  return `listings/${listing}/documents/${doc}/${file}`;
}

beforeEach(async () => {
  await fs.rm(OVERLAY, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(OVERLAY, { recursive: true, force: true });
  delete process.env.READ_ONLY_FS;
});

describe("storage on a read-only filesystem", () => {
  it("still reads seeded evidence out of the bundle", async () => {
    const key = await aSeededKey();
    const store = await loadStorage(true);
    await expect(store.exists(key)).resolves.toBe(true);
    const buf = await store.get(key);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("writes new objects to the overlay, never into the bundle", async () => {
    const store = await loadStorage(true);
    const key = "listings/_test/documents/probe/upload.bin";
    await store.put(key, Buffer.from("uploaded at runtime"), "application/octet-stream");

    await expect(fs.access(path.join(OVERLAY, key))).resolves.toBeUndefined();
    await expect(fs.access(path.join(BUNDLE, key))).rejects.toThrow();
    expect((await store.get(key)).toString()).toBe("uploaded at runtime");
  });

  it("returns ENOENT for a key in neither root", async () => {
    const store = await loadStorage(true);
    await expect(store.exists("listings/nope/missing.webp")).resolves.toBe(false);
    await expect(store.get("listings/nope/missing.webp")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("lets the overlay shadow a bundled object without mutating it", async () => {
    const key = await aSeededKey();
    const original = await fs.readFile(path.join(BUNDLE, key));
    const store = await loadStorage(true);

    await store.put(key, Buffer.from("shadowed"), "application/octet-stream");
    expect((await store.get(key)).toString()).toBe("shadowed");
    // The bundled original is untouched — evidence is never silently overwritten.
    expect(await fs.readFile(path.join(BUNDLE, key))).toEqual(original);

    // Deleting removes only the overlay copy; the bundled truth comes back.
    await store.delete(key);
    expect(await store.get(key)).toEqual(original);
  });

  it("collapses to a single root on a writable host", async () => {
    const store = await loadStorage(false);
    const key = "listings/_test/documents/probe/local.bin";
    await store.put(key, Buffer.from("local"), "application/octet-stream");
    const written = path.join(BUNDLE, key);
    await expect(fs.access(written)).resolves.toBeUndefined();
    await fs.rm(path.join(BUNDLE, "listings/_test"), { recursive: true, force: true });
  });
});
