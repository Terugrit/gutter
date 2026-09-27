import { z } from "zod";

export const comicVineVolumeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  start_year: z.string().nullable().optional(),
  publisher: z.object({ name: z.string() }).nullable().optional(),
  deck: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  resource_type: z.string().optional(),
}).passthrough();

export const comicVineResponseSchema = z.object({
  status_code: z.number().int(),
  error: z.string(),
  results: z.array(comicVineVolumeSchema),
}).passthrough();

export const comicVineIssueResponseSchema = z.object({
  status_code: z.number().int(),
  error: z.string(),
  results: z.object({ id: z.number().int(), volume: z.object({ id: z.number().int() }).nullable().optional() }).nullable(),
}).passthrough();

export const comicVineVolumeResponseSchema = z.object({
  status_code: z.number().int(),
  error: z.string(),
  results: comicVineVolumeSchema.nullable(),
}).passthrough();

export type ComicVineVolume = z.infer<typeof comicVineVolumeSchema>;
