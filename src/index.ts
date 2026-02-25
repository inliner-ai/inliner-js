/**
 * Inliner API Client for Node.js and TypeScript
 * Supports image tagging, generation, and project management.
 */

export interface InlinerOptions {
  /** Inliner.ai API Key */
  apiKey: string;
  /** Custom API base URL (default: https://api.inliner.ai) */
  apiUrl?: string;
  /** Custom image base URL (default: https://img.inliner.ai) */
  imageUrl?: string;
}

export interface ContentTag {
  contentTagId: string;
  contentId: string;
  accountId: string;
  tag: string;
  createdTs: string;
}

export interface TagWithCount {
  tag: string;
  count: number;
}

export interface SearchOptions {
  expression: string;
  sort_by?: string;
  direction?: 'asc' | 'desc';
  max_results?: number;
}

export interface Project {
  project: string;
  displayName: string;
  description?: string;
  isDefault?: boolean;
}

export interface UploadOptions {
  /** Project namespace to upload into */
  project: string;
  /** URL slug for the image (without extension). If omitted, derived from filename. */
  slug?: string;
  /** Optional title override. If omitted, AI-generated automatically. */
  title?: string;
  /** Optional description override. If omitted, AI-generated automatically. */
  description?: string;
  /** Optional tags override. If omitted, AI-generated automatically. */
  tags?: string[];
  /** Optional collection ID to assign the image to */
  collectionId?: string;
}

export interface UploadResult {
  success: boolean;
  message: string;
  content: {
    contentId: string;
    prompt: string;
    originalRequestedUrl: string | null;
    mediaAssetId: string;
    thumbnailAssetId: string | null;
    assignedCollectionId: string | null;
  };
}

export class InlinerClient {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly imageUrl: string;

  constructor(options: InlinerOptions) {
    this.apiKey = options.apiKey;
    this.apiUrl = (options.apiUrl || 'https://api.inliner.ai').replace(/\/$/, '');
    this.imageUrl = (options.imageUrl || 'https://img.inliner.ai').replace(/\/$/, '');
  }

  private async apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${this.apiUrl}/${path.replace(/^\//, '')}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      const body = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(body);
      } catch {
        errorData = { message: body };
      }
      throw new Error(`Inliner API error ${res.status}: ${errorData.message || body}`);
    }

    return res.json() as Promise<T>;
  }

  private async apiFormFetch<T>(path: string, formData: FormData): Promise<T> {
    const url = `${this.apiUrl}/${path.replace(/^\//, '')}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const body = await res.text();
      let errorData;
      try {
        errorData = JSON.parse(body);
      } catch {
        errorData = { message: body };
      }
      throw new Error(`Inliner API error ${res.status}: ${errorData.message || body}`);
    }

    return res.json() as Promise<T>;
  }

  // --- Upload Methods ---

  /**
   * Upload an image file.
   *
   * By default, the system auto-generates a title, description, and tags
   * using AI vision analysis. You can override any or all of these fields.
   *
   * @param file - File content as Buffer (Node.js), Blob, or File (Browser)
   * @param filename - Original filename (e.g., "photo.png") — used for extension detection and default slug
   * @param options - Upload options (project is required)
   *
   * @example
   * ```ts
   * // Auto-detect everything (title, description, tags)
   * await client.uploadImage(buffer, 'hero-banner.png', { project: 'my-site' });
   *
   * // Override title and tags, let AI generate description
   * await client.uploadImage(buffer, 'hero-banner.png', {
   *   project: 'my-site',
   *   title: 'Hero Banner',
   *   tags: ['hero', 'banner', 'homepage'],
   * });
   * ```
   */
  async uploadImage(
    file: Buffer | Blob | File,
    filename: string,
    options: UploadOptions
  ): Promise<UploadResult> {
    const formData = new FormData();

    // Handle Buffer (Node.js) vs Blob/File (browser)
    if (typeof file === 'object' && 'constructor' in file && file.constructor.name === 'Buffer') {
      formData.append('file', new Blob([new Uint8Array(file as Buffer)]), filename);
    } else {
      formData.append('file', file as Blob, filename);
    }

    // Derive slug from filename if not provided
    const slug = options.slug || this.slugifyFilename(filename);
    formData.append('project', options.project);
    formData.append('prompt', slug);

    if (options.collectionId) formData.append('collectionId', options.collectionId);
    if (options.title) formData.append('title', options.title);
    if (options.description) formData.append('description', options.description);
    
    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        formData.append('tags[]', tag);
      }
    }

    return this.apiFormFetch<UploadResult>('content/upload', formData);
  }

  private slugifyFilename(name: string): string {
    const withoutExt = name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
    return withoutExt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'image';
  }

  // --- Tagging Methods ---

  /**
   * Get all tags for the account with usage counts
   */
  async getAllTags(): Promise<TagWithCount[]> {
    return this.apiFetch<TagWithCount[]>('content/tags');
  }

  /**
   * Add tags to one or more content items
   * @param contentIds Array of content UUIDs
   * @param tags Array of tag strings
   */
  async addTags(contentIds: string[], tags: string[]): Promise<{ success: true }> {
    return this.apiFetch<{ success: true }>('content/tags', {
      method: 'POST',
      body: JSON.stringify({ contentIds, tags }),
    });
  }

  /**
   * Remove tags from one or more content items
   * @param contentIds Array of content UUIDs
   * @param tags Array of tag strings to remove
   */
  async removeTags(contentIds: string[], tags: string[]): Promise<{ success: true }> {
    return this.apiFetch<{ success: true }>('content/tags/remove', {
      method: 'POST',
      body: JSON.stringify({ contentIds, tags }),
    });
  }

  /**
   * Replace all tags on one or more content items
   * @param contentIds Array of content UUIDs
   * @param tags New array of tags
   */
  async replaceTags(contentIds: string[], tags: string[]): Promise<{ success: true }> {
    return this.apiFetch<{ success: true }>('content/tags/replace', {
      method: 'POST',
      body: JSON.stringify({ contentIds, tags }),
    });
  }

  /**
   * Get all images with a specific tag
   */
  async getImagesByTag(tag: string): Promise<any[]> {
    return this.apiFetch<any[]>(`content/tags/${encodeURIComponent(tag)}`);
  }

  /**
   * Search content with expressions (e.g., "tags:lion AND tags:snow")
   */
  async search(options: SearchOptions): Promise<any[]> {
    return this.apiFetch<any[]>('content/search', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  /**
   * List all images for the account or a specific project
   */
  async listImages(options: { projectId?: string; limit?: number } = {}): Promise<any[]> {
    let path = 'content/images';
    const params = new URLSearchParams();
    if (options.projectId) params.append('projectId', options.projectId);
    if (options.limit) params.append('limit', options.limit.toString());
    
    const queryString = params.toString();
    if (queryString) path += `?${queryString}`;
    
    return this.apiFetch<any[]>(path);
  }

  // --- Project Methods ---

  /**
   * List all projects for the account
   */
  async listProjects(): Promise<{ projects: Project[] }> {
    return this.apiFetch<{ projects: Project[] }>('account/projects');
  }

  /**
   * Get detailed configuration for a specific project
   */
  async getProjectDetails(projectId: string): Promise<Project> {
    return this.apiFetch<Project>(`account/projects/${projectId}`);
  }

  /**
   * Create a new project namespace
   */
  async createProject(project: Project): Promise<{ success: true; project: Project }> {
    return this.apiFetch<{ success: true; project: Project }>('account/projects', {
      method: 'POST',
      body: JSON.stringify(project),
    });
  }

  // --- Generation & Metadata Helpers ---

  /**
   * Build an Inliner image URL
   */
  buildImageUrl(project: string, description: string, width: number, height: number, format: 'png' | 'jpg' = 'png'): string {
    const slug = description
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return `${this.imageUrl}/${project}/${slug}_${width}x${height}.${format}`;
  }
}
