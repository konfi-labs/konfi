---
name: add-changes
description: Add new version changes to the What's New feature in the admin app. Use when asked to "add changes", "add new feature", "add release notes", or similar requests for documenting new features or updates.
---

# Add Changes Skill

This skill helps you add new entries to the What's New feature in the admin app by updating the `changes.json` file.

## Objectives
- Add new change entries to the admin app's What's New feature
- Maintain proper JSON structure and ordering
- Ensure bilingual content (English and Polish)
- Follow existing patterns and conventions

## File Location

The changes are stored in: `apps/admin/public/changes.json`

## Data Structure

Each change entry follows this structure:

```json
{
  "id": "unique-id-string",
  "timestamp": "ISO-8601-date-string",
  "title": {
    "en": "English title",
    "pl": "Polish title"
  },
  "description": {
    "en": "English description",
    "pl": "Polish description"
  },
  "imageUrl": "optional-image-url",
  "highlightFeatures": [
    {
      "en": "Feature 1",
      "pl": "Funkcja 1",
      "imageUrl": "optional-feature-image-url"
    },
    {
      "en": "Feature 2",
      "pl": "Funkcja 2"
    },
    {
      "en": "Feature 3",
      "pl": "Funkcja 3"
    }
  ]
}
```

## Field Requirements

### Required Fields:
- **id**: A unique identifier (can be semantic version, date-based, or descriptive)
- **timestamp**: ISO 8601 formatted date string (e.g., "2026-01-30T00:00:00.000Z")
- **title**: Object with `en` and `pl` keys containing localized titles
- **description**: Object with `en` and `pl` keys containing localized descriptions

### Optional Fields:
- **imageUrl**: URL to a screenshot or image (leave out if not provided)
- **highlightFeatures**: Array of feature highlights (use English for simplicity)

## Implementation Workflow

### 1. Parse User Input
When user provides changes like:
```
using add changes skill add:
1. new feature
2. bug fixes
3. etc.
```

Extract the list of features/changes.

### 2. Generate Change Entry
Create a new change object with:
- **id**: Use current date-based ID (e.g., "2026-01-30" or semantic version like "2.2.0")
- **timestamp**: Current date in ISO format
- **title**: 
  - en: "What's New in [App Name]" or "Updates for [Date/Version]"
  - pl: "Co nowego w [App Name]" or "Aktualizacje z [Date/Version]"
- **description**: 
  - en: Brief summary of updates (1-2 sentences)
  - pl: Polish translation of description
- **highlightFeatures**: The list provided by the user

### 3. Translation Guidelines

For Polish translations:
- "new feature" → "nowa funkcja"
- "bug fixes" → "naprawy błędów"
- "improvements" → "ulepszenia"
- "updates" → "aktualizacje"
- "performance" → "wydajność"

### 4. Add to File
- Read current `changes.json`
- Add new entry at the **beginning** of the array (newest first)
- Ensure valid JSON syntax
- Keep proper formatting (2-space indentation)

### 5. Example User Requests

**Request**: "using add changes skill add: 1. new dashboard, 2. faster loading, 3. bug fixes"

**Result**:
```json
{
  "id": "2026-01-30",
  "timestamp": "2026-01-30T00:00:00.000Z",
  "title": {
    "en": "January 2026 Updates",
    "pl": "Aktualizacje styczeń 2026"
  },
  "description": {
    "en": "New features and improvements to enhance your experience.",
    "pl": "Nowe funkcje i ulepszenia poprawiające Twoje doświadczenie."
  },
  "highlightFeatures": [
    "New dashboard",
    "Faster loading",
    "Bug fixes"
  ]
}
```

## Validation Checklist

Before committing changes:
1. ✅ Valid JSON syntax (no trailing commas, proper quotes)
2. ✅ New entry added at the beginning of the array
3. ✅ All required fields present (id, timestamp, title, description)
4. ✅ Both English and Polish translations provided
5. ✅ Timestamp in ISO 8601 format
6. ✅ Proper 2-space indentation maintained
7. ✅ Unique ID (not conflicting with existing entries)

## Tips

- Keep titles concise (5-10 words max)
- Descriptions should be 1-2 sentences
- Highlight features should be actionable/specific
- Use current date for timestamp unless user specifies otherwise
- For semantic versioning, increment appropriately (major.minor.patch)
- If user doesn't specify details, generate sensible defaults

## Common Patterns

### Version-based ID:
```json
{
  "id": "2.2.0",
  "timestamp": "2026-01-30T00:00:00.000Z",
  "title": {
    "en": "Version 2.2.0 Release",
    "pl": "Wydanie wersji 2.2.0"
  }
}
```

### Date-based ID:
```json
{
  "id": "2026-01-30",
  "timestamp": "2026-01-30T00:00:00.000Z",
  "title": {
    "en": "January 30, 2026 Updates",
    "pl": "Aktualizacje z 30 stycznia 2026"
  }
}
```

### Feature-based ID:
```json
{
  "id": "dashboard-redesign",
  "timestamp": "2026-01-30T00:00:00.000Z",
  "title": {
    "en": "Dashboard Redesign",
    "pl": "Przeprojektowanie pulpitu"
  }
}
```
