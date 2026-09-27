import { z } from "zod";

export const metronPublisherSchema = z.object({ id: z.number().int(), name: z.string() }).passthrough();
export const metronCreatorSchema = z.object({ id: z.number().int(), name: z.string() }).passthrough();
export const metronSeriesSchema = z.object({
  id: z.number().int(),
  series: z.string(),
  year_began: z.number().int().nullable().optional(),
  issue_count: z.number().int().nonnegative().nullable().optional(),
  publisher: metronPublisherSchema.nullable().optional(),
  cv_id: z.number().int().nullable().optional(),
  language: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  genres: z.array(z.object({ id: z.number().int().optional(), name: z.string() }).passthrough()).optional(),
}).passthrough();
export const metronSeriesDetailSchema = metronSeriesSchema.extend({ series: z.string().optional(), name: z.string().optional() })
  .refine((value) => Boolean(value.name || value.series), "Series title is required")
  .transform((value) => ({ ...value, series: value.name ?? value.series! }));
export const metronIssueSchema = z.object({
  id: z.number().int(),
  series: z.object({
    id: z.number().int(),
    name: z.string(),
    volume: z.number().int().nullable().optional(),
    year_began: z.number().int().nullable().optional(),
    language: z.string().nullable().optional(),
  }).passthrough().optional(),
  number: z.string(),
  issue: z.string().nullable().optional(),
  store_date: z.string().nullable().optional(),
  image: z.string().url().nullable().optional(),
  desc: z.string().nullable().optional(),
  credits: z.array(z.unknown()).optional(),
  modified: z.string().optional(),
}).passthrough();
export const metronPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({
  count: z.number().int().nonnegative(), next: z.string().nullable(), previous: z.string().nullable().optional(), results: z.array(item),
}).passthrough();
export type MetronSeries = z.infer<typeof metronSeriesSchema>;
export type MetronIssue = z.infer<typeof metronIssueSchema>;
export type MetronCreator = z.infer<typeof metronCreatorSchema>;
