import type { S3Handler } from "aws-lambda";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { ulid } from "ulid";
import { parseStatementText } from "./parse-statement.js";
import * as repo from "./repo.js";

const s3 = new S3Client({});

/**
 * S3 trigger: statements/{userId}/{uploadId}/{filename}
 * Updates an existing upload record and writes proposed transactions.
 */
export const handler: S3Handler = async (event) => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, " "));
    const parts = key.split("/");
    // uploads/{userId}/{uploadId}/{filename}
    const userId = parts[1] ?? "me";
    const uploadId = parts[2];
    const filename = parts.slice(3).join("/") || key;

    const upload = uploadId ? await repo.getUpload(uploadId, userId) : undefined;
    if (!upload) {
      console.warn("No upload record for", key);
      continue;
    }

    const obj = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = (await obj.Body?.transformToString()) ?? "";

    try {
      upload.status = "parsing";
      await repo.updateUpload(upload, userId);
      const rows = parseStatementText(text, filename);
      for (const row of rows) {
        const dup = await repo.findDuplicate(
          upload.accountId,
          row.date,
          row.amount,
          row.description,
          userId,
        );
        await repo.putProposed(
          {
            id: ulid(),
            uploadId: upload.id,
            accountId: upload.accountId,
            date: row.date,
            description: row.description,
            amount: row.amount,
            status: dup ? "merged" : "pending",
            duplicateOf: dup?.id,
            createdAt: new Date().toISOString(),
          },
          userId,
        );
      }
      upload.status = "ready";
      upload.proposedCount = rows.length;
      await repo.updateUpload(upload, userId);
    } catch (err) {
      upload.status = "failed";
      upload.error = err instanceof Error ? err.message : String(err);
      await repo.updateUpload(upload, userId);
      throw err;
    }
  }
};
