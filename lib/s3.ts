import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createS3Client, getBucketConfig } from "./aws-config";

const s3 = createS3Client();

export async function generatePresignedUploadUrl(
  fileName: string,
  contentType: string,
  isPublic = false
) {
  const { bucketName, folderPrefix } = getBucketConfig();
  const prefix = isPublic ? `${folderPrefix}public/uploads` : `${folderPrefix}uploads`;
  const cloud_storage_path = `${prefix}/${Date.now()}-${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ContentType: contentType,
    ContentDisposition: isPublic ? "attachment" : undefined,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
  return { uploadUrl, cloud_storage_path };
}

export async function getFileUrl(cloud_storage_path: string, isPublic: boolean) {
  const { bucketName } = getBucketConfig();
  if (isPublic) {
    const region = process.env.AWS_REGION || "us-east-1";
    return `https://${bucketName}.s3.${region}.amazonaws.com/${cloud_storage_path}`;
  }
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
    ResponseContentDisposition: "attachment",
  });
  return getSignedUrl(s3, command, { expiresIn: 3600 });
}

export async function getFileBuffer(cloud_storage_path: string): Promise<Buffer> {
  const { bucketName } = getBucketConfig();
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });
  const response = await s3.send(command);
  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function deleteFile(cloud_storage_path: string) {
  const { bucketName } = getBucketConfig();
  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: cloud_storage_path,
  });
  await s3.send(command);
}
