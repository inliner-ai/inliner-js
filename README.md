# @inliner/js

The official JavaScript/TypeScript client for [Inliner.ai](https://inliner.ai). Easily manage image tagging, multi-tag filtering, project namespaces, and more from your Node.js or browser applications.

## Installation

```bash
npm install @inliner/js
```

## Quick Start

```typescript
import { InlinerClient } from '@inliner/js';

// Initialize with your API key
const client = new InlinerClient({
  apiKey: 'YOUR_INLINER_API_KEY'
});

// 1. Generate an Inliner image URL
const url = client.buildImageUrl('marketing', 'happy-team-meeting', 1200, 600, 'jpg');
// Result: https://img.inliner.ai/marketing/happy-team-meeting_1200x600.jpg

// 2. Add tags to existing images
await client.addTags(['uuid-abc-123'], ['office', 'startup', 'culture']);

// 3. Search with multi-tag filtering (AND logic)
const images = await client.search({
  expression: 'tags:office AND tags:startup',
  max_results: 10
});
```

## Core Features

### Image Tagging & Management
Manage tags for better organization and searchability across your Inliner assets.

```typescript
// Get all tags with usage counts
const tags = await client.getAllTags();
// Returns: [{ tag: 'nature', count: 42 }, { tag: 'urban', count: 12 }, ...]

// Remove specific tags
await client.removeTags(['uuid-123'], ['old-tag']);

// Replace all tags on a set of images
await client.replaceTags(['uuid-123', 'uuid-456'], ['new-vibe', 'modern']);
```

### Advanced Search
Utilize the Inliner search expression engine to filter assets precisely.

```typescript
// Find PNG images with both 'wildlife' and 'winter' tags
const results = await client.search({
  expression: 'tags:wildlife AND tags:winter AND format:png',
  sort_by: 'createdTs',
  direction: 'desc'
});
```

### Project Management
Programmatically manage project namespaces.

```typescript
// List all projects
const { projects } = await client.listProjects();

// Create a new project
const newProject = await client.createProject({
  project: 'new-campaign',
  displayName: 'New Q1 Campaign',
  description: 'Marketing assets for the 2026 launch'
});
```

## API Reference

### `InlinerClient` Constructor
- `apiKey`: (Required) Your Inliner.ai API key.
- `apiUrl`: (Optional) Custom API endpoint.
- `imageUrl`: (Optional) Custom image CDN endpoint.

### `client.buildImageUrl(project, description, width, height, format)`
Returns a properly formatted string for the Inliner CDN.

### `client.addTags(contentIds[], tags[])`
Adds tags to the specified content items.

### `client.removeTags(contentIds[], tags[])`
Removes tags from the specified content items.

### `client.search(options)`
Performs a search using the `expression` parser. Supports `AND`, `OR`, `tags:X`, `format:X`, etc.

## Requirements
- Node.js 18+ (uses native `fetch`) or any modern browser.

## License
MIT
