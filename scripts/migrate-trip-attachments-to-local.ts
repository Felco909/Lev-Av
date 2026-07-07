import fs from 'fs/promises';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  isLegacyS3StoragePath,
  isLocalStoragePath,
  readStoredAttachmentFile,
  saveBufferToStorage,
  verifyStoredAttachmentReadable,
} from '../lib/attachment-service';
import { getFileBuffer } from '../lib/s3';
import { detectTripAttachmentSection } from '../lib/trip-attachment-section';
import { tripSectionToStorageCategory } from '../lib/trip-attachment-service';

type FailureRecord = {
  attachmentId: string;
  tripId: string;
  tripNumber: string | null;
  fileName: string;
  cloudStoragePath: string;
  reason: string;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function readLegacySource(cloudStoragePath: string): Promise<Buffer> {
  if (isLocalStoragePath(cloudStoragePath)) {
    return readStoredAttachmentFile(cloudStoragePath);
  }
  return getFileBuffer(cloudStoragePath);
}

async function main() {
  const prisma = new PrismaClient();
  const attachments = await prisma.tripAttachment.findMany({
    orderBy: { uploadedAt: 'asc' },
    select: {
      id: true,
      tripId: true,
      fileName: true,
      description: true,
      cloudStoragePath: true,
    },
  });

  const tripIds = [...new Set(attachments.map((attachment) => attachment.tripId))];
  const trips = await prisma.trip.findMany({
    where: { id: { in: tripIds } },
    select: { id: true, tripNumber: true },
  });
  const tripNumberById = new Map(trips.map((trip) => [trip.id, trip.tripNumber]));

  const summary = {
    total: attachments.length,
    alreadyLocal: 0,
    migrated: 0,
    failed: 0,
  };
  const failures: FailureRecord[] = [];

  for (const attachment of attachments) {
    const currentPath = attachment.cloudStoragePath;
    const tripNumber = tripNumberById.get(attachment.tripId) ?? null;

    if (currentPath.startsWith('local://uploads/') && await verifyStoredAttachmentReadable(currentPath)) {
      summary.alreadyLocal += 1;
      continue;
    }

    const section = detectTripAttachmentSection(attachment);
    const category = tripSectionToStorageCategory(section);

    try {
      const buffer = await readLegacySource(currentPath);
      const imported = await saveBufferToStorage(attachment.fileName, buffer, category);
      const readable = await verifyStoredAttachmentReadable(imported.cloudStoragePath);
      if (!readable) {
        throw new Error('Файл не найден в storage/uploads после переноса');
      }

      await prisma.tripAttachment.update({
        where: { id: attachment.id },
        data: { cloudStoragePath: imported.cloudStoragePath },
      });
      summary.migrated += 1;
      console.log(`[ok] ${attachment.id} ${tripNumber ?? attachment.tripId} -> ${imported.cloudStoragePath}`);
    } catch (error) {
      summary.failed += 1;
      const reason = errorMessage(error);
      failures.push({
        attachmentId: attachment.id,
        tripId: attachment.tripId,
        tripNumber,
        fileName: attachment.fileName,
        cloudStoragePath: currentPath,
        reason,
      });
      console.error(`[fail] ${attachment.id} ${tripNumber ?? attachment.tripId} ${currentPath} ${reason}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    aws: {
      profile: process.env.AWS_PROFILE ?? null,
      region: process.env.AWS_REGION ?? null,
      bucket: process.env.AWS_BUCKET_NAME ?? null,
      folderPrefix: process.env.AWS_FOLDER_PREFIX ?? null,
      hasAccessKey: Boolean(process.env.AWS_ACCESS_KEY_ID),
      hasSecretKey: Boolean(process.env.AWS_SECRET_ACCESS_KEY),
    },
    summary,
    failures,
    s3Remaining: failures.filter((item) => isLegacyS3StoragePath(item.cloudStoragePath)).length,
  };

  const reportPath = path.join(process.cwd(), '.runtime', 's3-migration-report.json');
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({ summary, reportPath, failureCount: failures.length }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
