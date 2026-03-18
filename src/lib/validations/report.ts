import { z } from "zod"

/**
 * Zod schema for POST /api/reports/generate request body.
 *
 * Validates store_ids as UUID array, dates as YYYY-MM-DD strings.
 * When period is 'custom', start_date and end_date are required.
 */
export const GenerateReportSchema = z
  .object({
    store_ids: z
      .array(z.string().uuid("Each store_id must be a valid UUID"))
      .min(1, "At least one store_id is required")
      .max(100, "Maximum 100 stores per job"),
    period: z.string().min(1, "Period is required"),
    start_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "start_date must be YYYY-MM-DD format")
      .optional(),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "end_date must be YYYY-MM-DD format")
      .optional(),
  })
  .refine(
    (data) => {
      if (data.period === "custom") {
        return !!data.start_date && !!data.end_date
      }
      return true
    },
    {
      message: "start_date and end_date are required when period is 'custom'",
      path: ["start_date"],
    }
  )
  .refine(
    (data) => {
      if (data.start_date && data.end_date) {
        return data.start_date <= data.end_date
      }
      return true
    },
    {
      message: "start_date must be before or equal to end_date",
      path: ["end_date"],
    }
  )

export type GenerateReportInput = z.infer<typeof GenerateReportSchema>

/**
 * Zod schema for PATCH /api/reports/[id] (cancel job).
 */
export const CancelJobSchema = z.object({
  status: z.literal("cancelled", {
    error: "Only 'cancelled' status is accepted",
  }),
}).strict()

export type CancelJobInput = z.infer<typeof CancelJobSchema>

/**
 * Zod schema for PATCH /api/reports/[id] (mark as viewed).
 */
export const MarkViewedSchema = z.object({
  viewed_at: z.string().datetime({ message: "viewed_at must be a valid ISO 8601 datetime" }),
}).strict()

export type MarkViewedInput = z.infer<typeof MarkViewedSchema>

/**
 * Discriminated union for PATCH body — either cancel or mark-viewed.
 */
export const PatchJobSchema = z.union([CancelJobSchema, MarkViewedSchema])

/**
 * UUID validation for path params.
 */
export const UUIDSchema = z.string().uuid("Invalid UUID format")
