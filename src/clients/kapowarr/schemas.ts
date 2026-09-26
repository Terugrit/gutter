import { z } from "zod";

export const kapowarrEnvelopeSchema = <T extends z.ZodTypeAny>(result: T) => z.object({ error: z.string().nullable(), result }).passthrough();
export const kapowarrRootFolderSchema = z.object({ id: z.number().int() }).passthrough();
export const kapowarrVolumeSchema = z.object({ id: z.number().int(), comicvine_id: z.number().int() }).passthrough();
export const kapowarrVolumeDetailSchema = kapowarrVolumeSchema.extend({ issue_count: z.number().int().nonnegative(), issues_downloaded: z.number().int().nonnegative(), issues: z.array(z.object({ id: z.number().int(), files: z.array(z.object({ id: z.number().int() }).passthrough()) }).passthrough()) }).passthrough();
export const kapowarrQueueEntrySchema = z.object({ volume_id: z.number().int() }).passthrough();
