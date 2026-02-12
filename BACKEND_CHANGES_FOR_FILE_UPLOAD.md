# Backend Changes Required for File Upload Feature

## Overview
The frontend now sends file content as text when a user uploads a file. The backend needs to accept, store, and handle these file fields.

## What the Frontend Sends

When a file is uploaded, the frontend sends these additional fields in the request payload:

```typescript
{
  // ... existing survey fields (name, type, language, collectionMode, etc.)
  attachedFileContent: string,  // The file content read as text
  attachedFileName: string       // The original file name (e.g., "document.pdf")
}
```

These fields are **optional** - they only appear when a user has uploaded a file.

## Required Backend Changes

### 1. Update Database Schema

**File:** `shared/schema.ts`

Add two new optional text fields to the `surveys` table:

```typescript
export const surveys = pgTable("surveys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  language: text("language", { enum: ["English", "Arabic", "Bilingual"] }).notNull().default("English"),
  collectionMode: text("collection_mode", { enum: ["field", "web"] }).notNull().default("web"),
  status: text("status", { enum: ["draft", "active", "completed"] }).notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  structure: jsonb("structure").$type<{...}>(),
  
  // NEW FIELDS - Add these:
  attachedFileContent: text("attached_file_content"),  // Store file content as text
  attachedFileName: text("attached_file_name"),         // Store original file name
});
```

**Note:** You'll need to create a database migration to add these columns to existing databases.

### 2. Update API Schema Validation

**File:** `shared/schema.ts`

The `insertSurveySchema` is auto-generated from the table definition, so it should automatically include the new fields. However, you may want to make them explicitly optional in the API contract:

```typescript
export const insertSurveySchema = createInsertSchema(surveys).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true,
  structure: true
}).extend({
  // Explicitly mark file fields as optional
  attachedFileContent: z.string().optional(),
  attachedFileName: z.string().optional(),
});
```

### 3. Update API Routes (Optional - Should Work Automatically)

**File:** `shared/routes.ts`

The existing routes should work automatically since `insertSurveySchema.partial()` is used for updates. However, you can verify that the input schema accepts these fields:

```typescript
// For create endpoint - should already work
create: {
  method: 'POST' as const,
  path: '/api/surveys',
  input: insertSurveySchema,  // Will now include attachedFileContent and attachedFileName
  responses: {
    201: z.custom<typeof surveys.$inferSelect>(),
    400: errorSchemas.validation,
  },
},

// For update endpoint - should already work
update: {
  method: 'PUT' as const,
  path: '/api/surveys/:id',
  input: insertSurveySchema.partial().extend({
    structure: z.custom<any>().optional()
  }),  // .partial() makes all fields optional, so file fields are optional
  responses: {
    200: z.custom<typeof surveys.$inferSelect>(),
    400: errorSchemas.validation,
    404: errorSchemas.notFound,
  },
},
```

### 4. Storage Layer (Should Work Automatically)

**File:** `server/storage.ts`

The storage layer should automatically handle the new fields since it uses the schema types. No changes needed unless you want to add validation or special handling.

### 5. Database Migration

You'll need to create a migration to add the new columns to existing databases:

```sql
-- Example migration SQL (adjust based on your migration system)
ALTER TABLE surveys 
ADD COLUMN attached_file_content TEXT,
ADD COLUMN attached_file_name TEXT;
```

## Summary of Changes

1. ✅ **Database Schema** - Add `attachedFileContent` and `attachedFileName` columns
2. ✅ **API Schema** - Ensure these fields are accepted (should be automatic)
3. ✅ **Database Migration** - Create migration to add columns
4. ✅ **Test** - Verify file content is saved and retrieved correctly

## Testing

After making these changes, test that:
1. Creating a survey with a file upload saves the file content
2. Updating a survey with a file upload updates the file content
3. Retrieving a survey includes the file fields
4. Surveys without files work normally (fields are null/undefined)

## Notes

- The file content is sent as **plain text**, so binary files (images, PDFs, etc.) will be base64-encoded or converted to text by the browser's `file.text()` method
- For large files, consider adding file size limits on the backend
- You may want to add validation to limit file size or file types if needed
- Consider storing files in a file system or cloud storage instead of the database for very large files

