import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, createHmac } from "node:crypto";
import { config } from "@/lib/config";
import type { StorageProvider, StoredObject } from "./types";

/**
 * Local-filesystem storage. Documents are never served from a static path —
 * every read goes through a signed, expiring URL that the route handler
 * authorises and logs. The S3 path is a drop-in replacement for this class.
 *
 * Serverless hosts (Vercel) mount the deployment read-only, with only the OS
 * temp directory writable. So reads and writes are split: seeded evidence ships
 * inside the bundle and is read from there, while anything uploaded at runtime
 * lands in a writable overlay that is searched first. On a normal server both
 * roots are the same directory and this collapses to plain local storage.
 *
 * The overlay is per-instance and does not survive a redeploy — an uploaded
 * document can therefore disappear on a hosted demo. That is a property of the
 * host, not of the model: swapping in S3/R2 removes it without touching a
 * caller. See ASSUMPTIONS.md §3.13.
 */
class LocalStorageProvider implements StorageProvider {
  readonly name = "local-fs";

  /** Ships with the deployment. Read-only when hosted. */
  private readonly bundledRoot = path.resolve(process.cwd(), config.STORAGE_ROOT);

  /** Where new objects go. Same as bundledRoot unless the bundle is read-only. */
  private readonly writeRoot = config.READ_ONLY_FS
    ? path.join(os.tmpdir(), "aqary-storage")
    : path.resolve(process.cwd(), config.STORAGE_ROOT);

  /** Newest first: an object written at runtime shadows a bundled one. */
  private get readRoots(): string[] {
    return this.writeRoot === this.bundledRoot
      ? [this.bundledRoot]
      : [this.writeRoot, this.bundledRoot];
  }

  private safeKey(key: string): string {
    return key.replace(/\\/g, "/").replace(/\.\./g, "");
  }

  private resolve(key: string, root: string): string {
    return path.join(root, this.safeKey(key));
  }

  /** First root that actually holds the key, or null. */
  private async locate(key: string): Promise<string | null> {
    for (const root of this.readRoots) {
      const candidate = this.resolve(key, root);
      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // try the next root
      }
    }
    return null;
  }

  async put(key: string, data: Buffer, mimeType: string): Promise<StoredObject> {
    const target = this.resolve(key, this.writeRoot);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return {
      key,
      sizeBytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      mimeType,
    };
  }

  async get(key: string): Promise<Buffer> {
    const found = await this.locate(key);
    if (!found) {
      // Match fs.readFile's failure shape so callers keep their existing checks.
      const err = new Error(`Storage object not found: ${key}`) as NodeJS.ErrnoException;
      err.code = "ENOENT";
      throw err;
    }
    return fs.readFile(found);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.locate(key)) !== null;
  }

  async delete(key: string): Promise<void> {
    // Only the writable overlay can be mutated; a bundled object is immutable.
    await fs.rm(this.resolve(key, this.writeRoot), { force: true });
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    const sig = signKey(key, expires);
    return `/api/files/${encodeURIComponent(key)}?expires=${expires}&sig=${sig}`;
  }

  publicPath(key: string): string {
    return `/api/files/${encodeURIComponent(key)}`;
  }
}

export function signKey(key: string, expires: number): string {
  return createHmac("sha256", config.AUTH_SECRET).update(`${key}:${expires}`).digest("hex").slice(0, 32);
}

export function verifyKeySignature(key: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  return signKey(key, expires) === sig;
}

let instance: StorageProvider | null = null;

export function storage(): StorageProvider {
  if (!instance) instance = new LocalStorageProvider();
  return instance;
}
