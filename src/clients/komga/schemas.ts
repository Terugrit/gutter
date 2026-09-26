import { z } from "zod";
const metadata = z.object({ title: z.string().nullable().optional(), publisher: z.string().nullable().optional(), number: z.string().nullable().optional(), authors: z.array(z.object({ name: z.string(), role: z.string().optional() })).optional() }).passthrough();
export const komgaSeriesSchema = z.object({ id: z.string(), name: z.string(), metadata: metadata.optional() }).passthrough();
export const komgaBookSchema = z.object({ id: z.string(), seriesId: z.string(), name: z.string().optional(), metadata: metadata.optional(), readProgress: z.object({ completed: z.boolean(), readDate: z.string().nullable().optional() }).nullable().optional() }).passthrough();
export const komgaLibrarySchema = z.object({ id: z.string(), name: z.string() }).passthrough();
export const komgaPageSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ content: z.array(item), totalPages: z.number().int().nonnegative().optional(), last: z.boolean().optional() }).passthrough();
export type KomgaSeries = z.infer<typeof komgaSeriesSchema>;
export type KomgaBook = z.infer<typeof komgaBookSchema>;
export type KomgaLibrary = z.infer<typeof komgaLibrarySchema>;
