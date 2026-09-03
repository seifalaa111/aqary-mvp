-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('SELLER', 'BUYER', 'ANALYST', 'ADMIN', 'DEVELOPER_PARTNER');

-- CreateEnum
CREATE TYPE "public"."KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."BuyerTier" AS ENUM ('BROWSER', 'VERIFIED', 'PRIORITY');

-- CreateEnum
CREATE TYPE "public"."RelationshipToContract" AS ENUM ('OWNER', 'AUTHORIZED_REPRESENTATIVE', 'HEIR');

-- CreateEnum
CREATE TYPE "public"."UnitType" AS ENUM ('APARTMENT', 'DUPLEX', 'PENTHOUSE', 'STUDIO', 'TOWNHOUSE', 'TWIN_HOUSE', 'STANDALONE_VILLA', 'CHALET', 'OFFICE', 'CLINIC', 'RETAIL', 'LAND');

-- CreateEnum
CREATE TYPE "public"."FinishingStatus" AS ENUM ('CORE_AND_SHELL', 'SEMI_FINISHED', 'FULLY_FINISHED', 'FINISHED_WITH_AC', 'FURNISHED');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('NOT_DELIVERED', 'DELIVERED', 'DELAYED');

-- CreateEnum
CREATE TYPE "public"."PaymentFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "public"."AssignmentPermission" AS ENUM ('ALLOWED', 'NOT_ALLOWED', 'CONDITIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."FeeType" AS ENUM ('NONE', 'PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "public"."ContractFieldKey" AS ENUM ('TOTAL_PRICE', 'DOWN_PAYMENT', 'AMOUNT_PAID', 'OUTSTANDING_BALANCE', 'INSTALLMENT_AMOUNT', 'INSTALLMENT_FREQUENCY', 'NUMBER_OF_INSTALLMENTS', 'MAINTENANCE_DEPOSIT', 'CLUB_FEE', 'ASSIGNMENT_FEE', 'CANCELLATION_PENALTY_PCT', 'CONTRACT_SIGNING_DATE', 'PLAN_START_DATE', 'NEXT_DUE_DATE', 'DELIVERY_DATE');

-- CreateEnum
CREATE TYPE "public"."ValueKind" AS ENUM ('MONEY', 'DATE', 'COUNT', 'PERCENT', 'ENUM', 'TEXT');

-- CreateEnum
CREATE TYPE "public"."ValueSource" AS ENUM ('SELLER_DECLARED', 'AI_EXTRACTED', 'RECEIPT_VERIFIED', 'DEVELOPER_CONFIRMED', 'ANALYST_OVERRIDE');

-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('SALE_CONTRACT', 'CONTRACT_ANNEX', 'PAYMENT_SCHEDULE_ANNEX', 'RESERVATION_FORM', 'PAYMENT_RECEIPT', 'BANK_TRANSFER_STATEMENT', 'CHEQUE_COPY', 'DEVELOPER_ACCOUNT_STATEMENT', 'DELIVERY_CERTIFICATE', 'NATIONAL_ID_FRONT', 'NATIONAL_ID_BACK', 'PASSPORT', 'POWER_OF_ATTORNEY', 'CO_OWNER_CONSENT', 'DEVELOPER_NOC', 'MAINTENANCE_RECEIPT', 'PROOF_OF_FUNDS', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('UPLOADED', 'SCANNING', 'PROCESSING', 'PROCESSED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."MediaKind" AS ENUM ('PHOTO', 'RENDER', 'FLOOR_PLAN', 'MASTER_PLAN', 'PROGRESS');

-- CreateEnum
CREATE TYPE "public"."RoomTag" AS ENUM ('EXTERIOR', 'ENTRANCE', 'LIVING', 'BEDROOM', 'KITCHEN', 'BATHROOM', 'BALCONY', 'GARDEN', 'VIEW', 'COMPOUND', 'AMENITY', 'PLAN');

-- CreateEnum
CREATE TYPE "public"."ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'FLAGGED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."Severity" AS ENUM ('INFO', 'MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."DiscrepancyStatus" AS ENUM ('OPEN', 'RESOLVED', 'WAIVED');

-- CreateEnum
CREATE TYPE "public"."FraudSignalType" AS ENUM ('DUPLICATE_RECEIPT_EXACT', 'DUPLICATE_RECEIPT_PERCEPTUAL', 'IMAGE_MANIPULATION', 'EXIF_ANOMALY', 'DATE_SEQUENCE_ANOMALY', 'ARITHMETIC_IMPOSSIBILITY', 'DOCUMENT_REUSED_ACROSS_LISTINGS', 'ID_NAME_MISMATCH', 'RECEIPT_TOTAL_MISMATCH');

-- CreateEnum
CREATE TYPE "public"."FraudSignalStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONFIRMED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "public"."ListingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AI_PROCESSING', 'PENDING_REVIEW', 'INFO_REQUESTED', 'VERIFIED', 'LISTED', 'UNDER_OFFER', 'RESERVED', 'ASSIGNMENT_IN_PROGRESS', 'COMPLETED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."Urgency" AS ENUM ('IMMEDIATE', 'ONE_TO_THREE_MONTHS', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "public"."ExitReason" AS ENUM ('JOB_CHANGE', 'BUSINESS_DIFFICULTY', 'INCREASED_OBLIGATIONS', 'FAMILY_CIRCUMSTANCES', 'LIQUIDITY_NEED', 'STRATEGY_CHANGE', 'CANNOT_CONTINUE_INSTALLMENTS', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."InstallmentKind" AS ENUM ('DOWN_PAYMENT', 'REGULAR', 'BALLOON', 'DELIVERY', 'MAINTENANCE', 'CLUB');

-- CreateEnum
CREATE TYPE "public"."InstallmentStatus" AS ENUM ('PAID', 'DUE', 'UPCOMING', 'OVERDUE');

-- CreateEnum
CREATE TYPE "public"."ScheduleSource" AS ENUM ('SELLER_DECLARED', 'AI_REBUILT', 'RECEIPT_RECONCILED', 'ANALYST_VERIFIED');

-- CreateEnum
CREATE TYPE "public"."ReceiptStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."OfferDirection" AS ENUM ('BUYER_TO_SELLER', 'SELLER_TO_BUYER');

-- CreateEnum
CREATE TYPE "public"."OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'COUNTERED', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."DealStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."MilestoneKey" AS ENUM ('OFFER_ACCEPTED', 'RESERVATION_DEPOSIT', 'DEVELOPER_NOC_REQUESTED', 'ASSIGNMENT_APPOINTMENT', 'DOCUMENTS_SIGNED', 'ASSIGNMENT_REGISTERED', 'CASH_RELEASED_TO_SELLER', 'PLATFORM_FEE_COLLECTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."MilestoneStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'AT_RISK', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."PaymentKind" AS ENUM ('RESERVATION_DEPOSIT', 'PLATFORM_FEE', 'DEVELOPER_ASSIGNMENT_FEE', 'SELLER_RELEASE');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('INITIATED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('LISTING_SUBMITTED', 'LISTING_INFO_REQUESTED', 'LISTING_VERIFIED', 'LISTING_PUBLISHED', 'LISTING_REJECTED', 'NEW_MATCH', 'SAVED_SEARCH_HIT', 'OFFER_RECEIVED', 'OFFER_COUNTERED', 'OFFER_ACCEPTED', 'OFFER_DECLINED', 'OFFER_EXPIRED', 'DEAL_CREATED', 'MILESTONE_ADVANCED', 'PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'DEAL_COMPLETED', 'MESSAGE_RECEIVED', 'EXTRACTION_READY');

-- CreateEnum
CREATE TYPE "public"."ConsentType" AS ENUM ('DEVELOPER_VERIFICATION_AUTHORIZATION', 'LISTING_AGREEMENT', 'TERMS_OF_SERVICE', 'PRIVACY_AND_DATA_PROCESSING', 'DISPLAY_REDACTED_CONTRACT', 'BUYER_CONFIDENTIALITY');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "public"."ValuationConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "public"."ProviderMode" AS ENUM ('MOCK', 'LIVE');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullNameEn" TEXT NOT NULL,
    "fullNameAr" TEXT,
    "nationalId" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "governorate" TEXT,
    "roles" "public"."Role"[] DEFAULT ARRAY[]::"public"."Role"[],
    "kycStatus" "public"."KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "avatarColor" TEXT NOT NULL DEFAULT '#1F4B43',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeRole" "public"."Role" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'LOGIN',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SellerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relationshipToContract" "public"."RelationshipToContract" NOT NULL DEFAULT 'OWNER',
    "coOwnerCount" INTEGER NOT NULL DEFAULT 0,
    "coOwnerNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredContactWindow" TEXT,
    "whatsappOptIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BuyerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "public"."BuyerTier" NOT NULL DEFAULT 'BROWSER',
    "availableCash" DECIMAL(18,2),
    "maxInstallment" DECIMAL(18,2),
    "installmentFrequency" "public"."PaymentFrequency" NOT NULL DEFAULT 'QUARTERLY',
    "incomeRange" TEXT,
    "employmentType" TEXT,
    "purchasePurpose" TEXT,
    "readiness" TEXT,
    "prefCities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefDeveloperIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prefUnitTypes" "public"."UnitType"[] DEFAULT ARRAY[]::"public"."UnitType"[],
    "prefBedroomsMin" INTEGER,
    "prefBuaMin" INTEGER,
    "prefDeliveryByYear" INTEGER,
    "prefFinishing" "public"."FinishingStatus"[] DEFAULT ARRAY[]::"public"."FinishingStatus"[],
    "freeTextPriorities" TEXT,
    "proofOfFundsDocumentId" TEXT,
    "proofOfFundsVerifiedAt" TIMESTAMP(3),
    "proofOfFundsVerifiedBy" TEXT,
    "onboardingCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Developer" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeveloperAssignmentPolicy" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "assignmentAllowed" "public"."AssignmentPermission" NOT NULL DEFAULT 'CONDITIONAL',
    "feeType" "public"."FeeType" NOT NULL DEFAULT 'PERCENT',
    "feePercentBps" INTEGER,
    "feeFixedAmount" DECIMAL(18,2),
    "feeBasis" TEXT NOT NULL DEFAULT 'TOTAL_CONTRACT_PRICE',
    "minPercentPaidBps" INTEGER,
    "minMonthsElapsed" INTEGER,
    "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "typicalNocDays" INTEGER,
    "waitingPeriodDays" INTEGER,
    "conditionsEn" TEXT,
    "conditionsAr" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeveloperAssignmentPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "developerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "descriptionEn" TEXT,
    "descriptionAr" TEXT,
    "masterPlanKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectPriceBenchmark" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitType" "public"."UnitType" NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "pricePerSqm" DECIMAL(18,2) NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectPriceBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Unit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "phase" TEXT,
    "unitType" "public"."UnitType" NOT NULL,
    "buaSqm" DECIMAL(10,2) NOT NULL,
    "gardenSqm" DECIMAL(10,2),
    "roofSqm" DECIMAL(10,2),
    "terraceSqm" DECIMAL(10,2),
    "floor" INTEGER,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" INTEGER NOT NULL,
    "view" TEXT,
    "finishing" "public"."FinishingStatus" NOT NULL DEFAULT 'SEMI_FINISHED',
    "contractualDeliveryDate" TIMESTAMP(3) NOT NULL,
    "deliveryStatus" "public"."DeliveryStatus" NOT NULL DEFAULT 'NOT_DELIVERED',
    "currentDeveloperPrice" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Contract" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "contractNumber" TEXT,
    "assignmentPermitted" "public"."AssignmentPermission" NOT NULL DEFAULT 'UNKNOWN',
    "assignmentConditionsNote" TEXT,
    "cancellationPenaltyNote" TEXT,
    "hasArrears" BOOLEAN NOT NULL DEFAULT false,
    "arrearsAmount" DECIMAL(18,2),
    "hasBankFinance" BOOLEAN NOT NULL DEFAULT false,
    "lienNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContractField" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "key" "public"."ContractFieldKey" NOT NULL,
    "kind" "public"."ValueKind" NOT NULL,
    "declaredNum" DECIMAL(18,2),
    "declaredDate" TIMESTAMP(3),
    "declaredText" TEXT,
    "extractedNum" DECIMAL(18,2),
    "extractedDate" TIMESTAMP(3),
    "extractedText" TEXT,
    "extractedConfidence" DOUBLE PRECISION,
    "extractedDocumentId" TEXT,
    "extractedPage" INTEGER,
    "extractedBbox" JSONB,
    "extractionId" TEXT,
    "receiptDerivedNum" DECIMAL(18,2),
    "receiptDerivedDate" TIMESTAMP(3),
    "receiptDerivedNote" TEXT,
    "developerStatedNum" DECIMAL(18,2),
    "developerStatedDate" TIMESTAMP(3),
    "developerStatedText" TEXT,
    "developerStatedDocumentId" TEXT,
    "verifiedNum" DECIMAL(18,2),
    "verifiedDate" TIMESTAMP(3),
    "verifiedText" TEXT,
    "verifiedSource" "public"."ValueSource",
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "overrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Installment" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "kind" "public"."InstallmentKind" NOT NULL DEFAULT 'REGULAR',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" "public"."InstallmentStatus" NOT NULL DEFAULT 'UPCOMING',
    "paidAmount" DECIMAL(18,2),
    "paidDate" TIMESTAMP(3),
    "receiptId" TEXT,
    "runningBalance" DECIMAL(18,2) NOT NULL,
    "source" "public"."ScheduleSource" NOT NULL DEFAULT 'SELLER_DECLARED',
    "label" TEXT,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Receipt" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT,
    "declaredAmount" DECIMAL(18,2),
    "extractedAmount" DECIMAL(18,2),
    "verifiedAmount" DECIMAL(18,2),
    "declaredDate" TIMESTAMP(3),
    "extractedDate" TIMESTAMP(3),
    "verifiedDate" TIMESTAMP(3),
    "method" "public"."PaymentMethod" NOT NULL DEFAULT 'UNKNOWN',
    "reference" TEXT,
    "status" "public"."ReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION,
    "sha256" TEXT,
    "perceptualHash" TEXT,
    "verifiedBy" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "rejectionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "listingId" TEXT,
    "type" "public"."DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "perceptualHash" TEXT,
    "pageCount" INTEGER NOT NULL DEFAULT 1,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "blurScore" DOUBLE PRECISION,
    "exifStripped" BOOLEAN NOT NULL DEFAULT false,
    "hasExif" BOOLEAN NOT NULL DEFAULT true,
    "softwareTag" TEXT,
    "virusScanned" BOOLEAN NOT NULL DEFAULT false,
    "redactedKey" TEXT,
    "watermarkedKey" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentPage" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "imageKey" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "textSnippet" TEXT,

    CONSTRAINT "DocumentPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentAccessLog" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MediaAsset" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "kind" "public"."MediaKind" NOT NULL,
    "roomTag" "public"."RoomTag",
    "caption" TEXT,
    "altEn" TEXT NOT NULL,
    "altAr" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "storageKey" TEXT NOT NULL,
    "variants" JSONB NOT NULL,
    "blurhash" TEXT,
    "dominantColor" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "moderationStatus" "public"."ModerationStatus" NOT NULL DEFAULT 'PENDING',
    "moderationNote" TEXT,
    "attribution" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Extraction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "documentId" TEXT,
    "mode" "public"."ProviderMode" NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCEEDED',
    "latencyMs" INTEGER NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL,
    "promptHash" TEXT NOT NULL,
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExtractionField" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "key" "public"."ContractFieldKey" NOT NULL,
    "valueNum" DECIMAL(18,2),
    "valueDate" TIMESTAMP(3),
    "valueText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "documentId" TEXT,
    "page" INTEGER,
    "bbox" JSONB,
    "clauseText" TEXT,

    CONSTRAINT "ExtractionField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Discrepancy" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fieldKey" "public"."ContractFieldKey" NOT NULL,
    "sourceA" "public"."ValueSource" NOT NULL,
    "valueA" DECIMAL(18,2),
    "valueAText" TEXT,
    "sourceB" "public"."ValueSource" NOT NULL,
    "valueB" DECIMAL(18,2),
    "valueBText" TEXT,
    "delta" DECIMAL(18,2),
    "deltaPct" DOUBLE PRECISION,
    "severity" "public"."Severity" NOT NULL,
    "status" "public"."DiscrepancyStatus" NOT NULL DEFAULT 'OPEN',
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT,
    "evidence" JSONB NOT NULL,
    "resolution" TEXT,
    "resolvedTo" "public"."ValueSource",
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FraudSignal" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "type" "public"."FraudSignalType" NOT NULL,
    "severity" "public"."Severity" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT,
    "description" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "status" "public"."FraudSignalStatus" NOT NULL DEFAULT 'OPEN',
    "disposition" TEXT,
    "dispositionBy" TEXT,
    "dispositionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Valuation" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "low" DECIMAL(18,2) NOT NULL,
    "mid" DECIMAL(18,2) NOT NULL,
    "high" DECIMAL(18,2) NOT NULL,
    "confidence" "public"."ValuationConfidence" NOT NULL,
    "method" TEXT NOT NULL,
    "drivers" JSONB NOT NULL,
    "overrideLow" DECIMAL(18,2),
    "overrideMid" DECIMAL(18,2),
    "overrideHigh" DECIMAL(18,2),
    "overrideReason" TEXT,
    "overrideBy" TEXT,
    "overrideAt" TIMESTAMP(3),
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Valuation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ValuationComparable" (
    "id" TEXT NOT NULL,
    "valuationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "unitType" "public"."UnitType" NOT NULL,
    "buaSqm" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(18,2) NOT NULL,
    "pricePerSqm" DECIMAL(18,2) NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ValuationComparable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Listing" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" "public"."ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "askingCash" DECIMAL(18,2),
    "flexibilityPct" INTEGER NOT NULL DEFAULT 0,
    "minAcceptableCash" DECIMAL(18,2),
    "urgency" "public"."Urgency",
    "exitReason" "public"."ExitReason",
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "exclusivityUntil" TIMESTAMP(3),
    "totalContractPrice" DECIMAL(18,2),
    "verifiedAmountPaid" DECIMAL(18,2),
    "outstandingBalance" DECIMAL(18,2),
    "installmentAmount" DECIMAL(18,2),
    "installmentFrequency" "public"."PaymentFrequency",
    "remainingInstallments" INTEGER,
    "nextDueDate" TIMESTAMP(3),
    "deliveryDate" TIMESTAMP(3),
    "developerAssignmentFee" DECIMAL(18,2),
    "discountPctBps" INTEGER,
    "verificationScore" INTEGER,
    "verificationScoreBreakdown" JSONB,
    "humanVerifiedBy" TEXT,
    "humanVerifiedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "infoRequestItems" JSONB,
    "infoRequestedAt" TIMESTAMP(3),
    "assignedAnalystId" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "wizardStep" INTEGER NOT NULL DEFAULT 1,
    "wizardCompleted" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Match" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" JSONB NOT NULL,
    "blockers" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavedListing" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SavedSearch" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastResultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "parentOfferId" TEXT,
    "direction" "public"."OfferDirection" NOT NULL DEFAULT 'BUYER_TO_SELLER',
    "amount" DECIMAL(18,2) NOT NULL,
    "message" TEXT,
    "proposedCompletionDays" INTEGER NOT NULL DEFAULT 45,
    "proofOfFundsDocumentId" TEXT,
    "status" "public"."OfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Deal" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "coordinatorId" TEXT,
    "status" "public"."DealStatus" NOT NULL DEFAULT 'ACTIVE',
    "cashToSeller" DECIMAL(18,2) NOT NULL,
    "platformFee" DECIMAL(18,2) NOT NULL,
    "developerAssignmentFee" DECIMAL(18,2) NOT NULL,
    "reservationDeposit" DECIMAL(18,2) NOT NULL,
    "contactUnmasked" BOOLEAN NOT NULL DEFAULT false,
    "buyerRating" INTEGER,
    "sellerRating" INTEGER,
    "outcomeNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Milestone" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "key" "public"."MilestoneKey" NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "public"."MilestoneStatus" NOT NULL DEFAULT 'PENDING',
    "ownerRole" "public"."Role" NOT NULL,
    "dueDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "blockedReason" TEXT,
    "requiredDocuments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,

    CONSTRAINT "Milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "kind" "public"."PaymentKind" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "instructionRef" TEXT NOT NULL,
    "failureCode" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "initiatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "senderId" TEXT,
    "body" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "attachmentDocumentId" TEXT,
    "readBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "linkHref" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'DELIVERED',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "textVersion" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" "public"."Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "ip" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "public"."User"("phone");

-- CreateIndex
CREATE INDEX "User_kycStatus_idx" ON "public"."User"("kycStatus");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "public"."User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- CreateIndex
CREATE INDEX "OtpCode_phone_purpose_idx" ON "public"."OtpCode"("phone", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_userId_key" ON "public"."SellerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BuyerProfile_userId_key" ON "public"."BuyerProfile"("userId");

-- CreateIndex
CREATE INDEX "BuyerProfile_tier_idx" ON "public"."BuyerProfile"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "Developer_slug_key" ON "public"."Developer"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "DeveloperAssignmentPolicy_developerId_key" ON "public"."DeveloperAssignmentPolicy"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "public"."Project"("slug");

-- CreateIndex
CREATE INDEX "Project_city_idx" ON "public"."Project"("city");

-- CreateIndex
CREATE INDEX "Project_developerId_idx" ON "public"."Project"("developerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectPriceBenchmark_projectId_unitType_year_quarter_key" ON "public"."ProjectPriceBenchmark"("projectId", "unitType", "year", "quarter");

-- CreateIndex
CREATE INDEX "Unit_unitType_idx" ON "public"."Unit"("unitType");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_projectId_unitCode_key" ON "public"."Unit"("projectId", "unitCode");

-- CreateIndex
CREATE INDEX "Contract_sellerId_idx" ON "public"."Contract"("sellerId");

-- CreateIndex
CREATE INDEX "ContractField_contractId_idx" ON "public"."ContractField"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractField_contractId_key_key" ON "public"."ContractField"("contractId", "key");

-- CreateIndex
CREATE INDEX "Installment_contractId_dueDate_idx" ON "public"."Installment"("contractId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_contractId_source_sequence_key" ON "public"."Installment"("contractId", "source", "sequence");

-- CreateIndex
CREATE INDEX "Receipt_contractId_idx" ON "public"."Receipt"("contractId");

-- CreateIndex
CREATE INDEX "Receipt_sha256_idx" ON "public"."Receipt"("sha256");

-- CreateIndex
CREATE INDEX "Document_listingId_type_idx" ON "public"."Document"("listingId", "type");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "public"."Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentPage_documentId_pageNumber_key" ON "public"."DocumentPage"("documentId", "pageNumber");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_documentId_at_idx" ON "public"."DocumentAccessLog"("documentId", "at");

-- CreateIndex
CREATE INDEX "MediaAsset_listingId_kind_order_idx" ON "public"."MediaAsset"("listingId", "kind", "order");

-- CreateIndex
CREATE INDEX "Extraction_listingId_idx" ON "public"."Extraction"("listingId");

-- CreateIndex
CREATE INDEX "ExtractionField_extractionId_idx" ON "public"."ExtractionField"("extractionId");

-- CreateIndex
CREATE INDEX "Discrepancy_listingId_status_idx" ON "public"."Discrepancy"("listingId", "status");

-- CreateIndex
CREATE INDEX "FraudSignal_listingId_status_idx" ON "public"."FraudSignal"("listingId", "status");

-- CreateIndex
CREATE INDEX "Valuation_listingId_idx" ON "public"."Valuation"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_reference_key" ON "public"."Listing"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_contractId_key" ON "public"."Listing"("contractId");

-- CreateIndex
CREATE INDEX "Listing_status_publishedAt_idx" ON "public"."Listing"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Listing_sellerId_idx" ON "public"."Listing"("sellerId");

-- CreateIndex
CREATE INDEX "Listing_assignedAnalystId_status_idx" ON "public"."Listing"("assignedAnalystId", "status");

-- CreateIndex
CREATE INDEX "Listing_askingCash_idx" ON "public"."Listing"("askingCash");

-- CreateIndex
CREATE INDEX "Listing_installmentAmount_idx" ON "public"."Listing"("installmentAmount");

-- CreateIndex
CREATE INDEX "Listing_deliveryDate_idx" ON "public"."Listing"("deliveryDate");

-- CreateIndex
CREATE INDEX "Match_buyerId_score_idx" ON "public"."Match"("buyerId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Match_listingId_buyerId_key" ON "public"."Match"("listingId", "buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedListing_buyerId_listingId_key" ON "public"."SavedListing"("buyerId", "listingId");

-- CreateIndex
CREATE INDEX "SavedSearch_buyerId_idx" ON "public"."SavedSearch"("buyerId");

-- CreateIndex
CREATE INDEX "Offer_listingId_status_idx" ON "public"."Offer"("listingId", "status");

-- CreateIndex
CREATE INDEX "Offer_buyerId_status_idx" ON "public"."Offer"("buyerId", "status");

-- CreateIndex
CREATE INDEX "Offer_status_expiresAt_idx" ON "public"."Offer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_reference_key" ON "public"."Deal"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_listingId_key" ON "public"."Deal"("listingId");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_offerId_key" ON "public"."Deal"("offerId");

-- CreateIndex
CREATE INDEX "Deal_status_idx" ON "public"."Deal"("status");

-- CreateIndex
CREATE INDEX "Milestone_dealId_order_idx" ON "public"."Milestone"("dealId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Milestone_dealId_key_key" ON "public"."Milestone"("dealId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "public"."Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_dealId_kind_idx" ON "public"."Payment"("dealId", "kind");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_at_idx" ON "public"."PaymentEvent"("paymentId", "at");

-- CreateIndex
CREATE INDEX "Message_dealId_createdAt_idx" ON "public"."Message"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Consent_userId_type_idx" ON "public"."Consent"("userId", "type");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_at_idx" ON "public"."AuditEvent"("entityType", "entityId", "at");

-- CreateIndex
CREATE INDEX "AuditEvent_actorId_at_idx" ON "public"."AuditEvent"("actorId", "at");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "public"."Job"("status", "runAt");

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SellerProfile" ADD CONSTRAINT "SellerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BuyerProfile" ADD CONSTRAINT "BuyerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DeveloperAssignmentPolicy" ADD CONSTRAINT "DeveloperAssignmentPolicy_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "public"."Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_developerId_fkey" FOREIGN KEY ("developerId") REFERENCES "public"."Developer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectPriceBenchmark" ADD CONSTRAINT "ProjectPriceBenchmark_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Unit" ADD CONSTRAINT "Unit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Contract" ADD CONSTRAINT "Contract_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "public"."Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContractField" ADD CONSTRAINT "ContractField_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Installment" ADD CONSTRAINT "Installment_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentPage" ADD CONSTRAINT "DocumentPage_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentAccessLog" ADD CONSTRAINT "DocumentAccessLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MediaAsset" ADD CONSTRAINT "MediaAsset_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Extraction" ADD CONSTRAINT "Extraction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExtractionField" ADD CONSTRAINT "ExtractionField_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "public"."Extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Discrepancy" ADD CONSTRAINT "Discrepancy_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FraudSignal" ADD CONSTRAINT "FraudSignal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Valuation" ADD CONSTRAINT "Valuation_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValuationComparable" ADD CONSTRAINT "ValuationComparable_valuationId_fkey" FOREIGN KEY ("valuationId") REFERENCES "public"."Valuation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Listing" ADD CONSTRAINT "Listing_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Listing" ADD CONSTRAINT "Listing_assignedAnalystId_fkey" FOREIGN KEY ("assignedAnalystId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedListing" ADD CONSTRAINT "SavedListing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedListing" ADD CONSTRAINT "SavedListing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SavedSearch" ADD CONSTRAINT "SavedSearch_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Offer" ADD CONSTRAINT "Offer_parentOfferId_fkey" FOREIGN KEY ("parentOfferId") REFERENCES "public"."Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deal" ADD CONSTRAINT "Deal_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Milestone" ADD CONSTRAINT "Milestone_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "public"."Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "public"."Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "public"."Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
