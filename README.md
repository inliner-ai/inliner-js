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

// 5. Generate a new image
const generation = await client.generateImage({
  project: 'marketing',
  prompt: 'a futuristic city with flying cars',
  width: 1200,
  height: 600
});
console.log('Generated URL:', generation.url);
// generation.data contains the binary Uint8Array of the image

// 6. Edit an existing image
const edit = await client.editImage(generation.url, {
  instruction: 'make it sunset time'
});
console.log('Edited URL:', edit.url);
```

## Core Features

### Image Generation
Generate high-quality AI images using natural language prompts.

```typescript
const result = await client.generateImage({
  project: 'my-site',
  prompt: 'minimalist workspace with a laptop and a plant',
  format: 'jpg',
  width: 1920,
  height: 1080,
  smartUrl: true // Use AI-optimized short URLs
});
```

### Image Editing
Apply AI instructions to existing images by URL or by uploading a local file.

```typescript
// Edit by URL
const edited = await client.editImage('https://img.inliner.ai/proj/img_800x600.png', {
  instruction: 'add a coffee mug on the desk',
  width: 800,
  height: 600
});

// Edit local file (Node.js example)
const buffer = await fs.readFile('photo.png');
const result = await client.editImage(buffer, {
  project: 'my-site',
  instruction: 'remove the background'
});
```

### Image Upload & AI Auto-Detection
Upload images and let Inliner's AI (Gemini) automatically generate titles, descriptions, and tags. Or provide your own to skip the AI analysis.

```typescript
// Full control — no AI analysis triggered for provided fields
await client.uploadImage(fileBuffer, 'hero.png', {
  project: 'my-site',
  slug: 'custom-slug',
  title: 'Hero Banner',
  description: 'A wide banner image for the homepage hero section.',
  tags: ['hero', 'banner'],
});
```

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

// Delete images
await client.deleteImages(['uuid-123', 'uuid-456']);

// Rename an image (update its URL slug/project)
await client.renameImage('uuid-123', 'marketing/brand-new-hero');
```

### Advanced Search & Infinite Scroll
Utilize the Inliner search expression engine with cursor-based pagination for large libraries.

```typescript
// Find PNG images with both 'wildlife' and 'winter' tags
const results = await client.search({
  expression: 'tags:wildlife AND tags:winter AND format:png',
  sort_by: 'created_at',
  max_results: 50
});

// To fetch the next page (infinite scroll), use the next_cursor from the result
const nextPage = await client.search({
  expression: 'tags:wildlife AND tags:winter AND format:png',
  next_cursor: results.next_cursor
});
```

### Listing & Iterating Assets
Fetch and render a gallery of images with support for pagination and search.

```typescript
// List images from the 'marketing' project with pagination
const items = await client.listImages({
  projectId: 'marketing',
  page: 1,
  pageSize: 20,
  search: 'sunset' // Optional keyword search
});

// Example: Rendering in a hypothetical React component
return (
  <div className="gallery">
    {items.map(image => (
      <div key={image.contentId} className="image-card">
        <img src={image.url} alt={image.title} />
        <h3>{image.title}</h3>
        <p>{image.description}</p>
        <div className="tags">
          {image.tags?.map(tag => (
            <span key={tag} className="tag-pill">{tag}</span>
          ))}
        </div>
      </div>
    ))}
  </div>
);
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
