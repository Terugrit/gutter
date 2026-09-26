import { z } from "zod";

export const kapowarrEnvelopeSchema = <T extends z.ZodTypeAny>(result: T) => z.object({ error: z.string().nullable(), result }).passthrough();
export const kapowarrRootFolderSchema = z.object({ id: z.number().int() }).passthrough();
export const kapowarrVolumeSchema = z.object({ id: z.number().int(), comicvine_id: z.number().int() }).passthrough();
