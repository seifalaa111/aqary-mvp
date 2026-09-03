import "server-only";
import { randomUUID } from "node:crypto";
import { parseNationalId } from "@/lib/domain/national-id";
import type { KycProvider } from "../types";

/**
 * MockKycProvider. The identity-bureau call is simulated; the checks that can be
 * done locally (national-ID checksum, date-of-birth derivation, document
 * presence, name shape) are real, and the resulting KYC state is a real record.
 */
export class MockKycProvider implements KycProvider {
  readonly name = "mock-kyc";

  async verifyIdentity(req: {
    userId: string;
    nationalId: string;
    fullNameAr: string;
    frontDocumentId?: string;
    backDocumentId?: string;
  }) {
    const parsed = parseNationalId(req.nationalId);

    const checks = [
      { name: "National ID format", passed: parsed.valid, note: parsed.error },
      {
        name: "Date of birth derived",
        passed: Boolean(parsed.dateOfBirth),
        note: parsed.dateOfBirth?.toISOString().slice(0, 10),
      },
      { name: "Governorate recognised", passed: Boolean(parsed.governorate), note: parsed.governorate ?? undefined },
      { name: "ID front image supplied", passed: Boolean(req.frontDocumentId) },
      { name: "ID back image supplied", passed: Boolean(req.backDocumentId) },
      {
        name: "Arabic name present",
        passed: /[؀-ۿ]/.test(req.fullNameAr) && req.fullNameAr.trim().split(/\s+/).length >= 2,
      },
      // Simulated: a real bureau lookup would happen here.
      { name: "Civil registry match (simulated)", passed: parsed.valid, note: "Mocked — no bureau connected" },
    ];

    await new Promise((r) => setTimeout(r, 450));

    const hardFail = !parsed.valid;
    const missingDocs = !req.frontDocumentId || !req.backDocumentId;

    return {
      status: hardFail ? ("REJECTED" as const) : missingDocs ? ("PENDING" as const) : ("VERIFIED" as const),
      checks,
      reference: `MOCKKYC_${randomUUID().slice(0, 8).toUpperCase()}`,
    };
  }
}
