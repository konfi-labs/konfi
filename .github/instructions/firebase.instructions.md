---
applyTo: "**/lib/firebase/**/*.{ts,js}"
description: "Firestore database interaction patterns and service layer guidelines"
---

# Firebase Function Instructions

## Function Structure

- Export all functions from `@konfi/firebase`
- Import Firebase functions from 'firebase/firestore' and 'firebase/auth'

## Error Handling

- Wrap all Firebase operations in try/catch blocks
- Provide meaningful error messages for users
- Log errors with context: `console.error('Error context:', error)`
- Throw errors with user-friendly messages

## Authentication Checks

- Use `getCurrentUser()` for auth-required operations
- Check user permissions before write operations
- Throw authentication errors when user is null

## Data Validation

- Validate required parameters at function start
- Use TypeScript for compile-time type checking
- Validate data structure before Firestore operations
- Sanitize user input data
- Undefined fields should be omitted from Firestore writes

## Firestore Patterns

- Use collection references: `collection(db, 'posts')`
- Use proper queries with orderBy, where, limit
- Use predefined typed functions available at `@konfi/firebase`
- Handle pagination with startAfter cursors
- Use transactions for multi-document operations
