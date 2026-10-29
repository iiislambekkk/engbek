import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import path from "node:path"

let client: S3Client | undefined

function safeStorageError(error: unknown) {
  const metadata = typeof error === "object" && error !== null && "$metadata" in error
    ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    : undefined
  const safeError = new Error("Object storage request failed.")
  if (error instanceof Error && error.name === "NoSuchKey") safeError.name = "NoSuchKey"
  Object.defineProperty(safeError, "$metadata", { value: { httpStatusCode: metadata?.httpStatusCode } })
  return safeError
}

function getStorage() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("Object storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME.")
  }
  client ??= new S3Client({
    endpoint,
    region: "auto",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { client, bucket }
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  const storage = getStorage()
  try {
    await storage.client.send(new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }))
  } catch (error) { throw safeStorageError(error) }
}

export async function getObject(key: string) {
  const storage = getStorage()
  let result: GetObjectCommandOutput
  try {
    result = await storage.client.send(new GetObjectCommand({ Bucket: storage.bucket, Key: key }))
  } catch (error) { throw safeStorageError(error) }
  if (!result.Body) throw new Error("Stored object has no content.")
  return {
    body: await result.Body.transformToByteArray(),
    contentType: result.ContentType,
  }
}

export async function deleteObject(key: string) {
  const storage = getStorage()
  try {
    await storage.client.send(new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }))
  } catch (error) { throw safeStorageError(error) }
}

export function getLegacyLocalPath(key: string) {
  // Legacy Read uploads were stored under .private/read-documents before R2 was added.
  const root = path.resolve(process.cwd(), ".private", "read-documents")
  const fullPath = path.resolve(root, key)
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error("Invalid stored file key.")
  return fullPath
}
