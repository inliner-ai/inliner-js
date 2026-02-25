/**
 * Inliner API Client for Node.js and TypeScript
 * Supports image tagging, generation, editing, and project management.
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

export interface GenerateOptions {
  project: string;
  prompt: string;
  width?: number;
  height?: number;
  format?: 'png' | 'jpg';
  /** Use smart URL recommendation (default: true) */
  smartUrl?: boolean;
}

export interface EditOptions {
  /** Project namespace (required when editing local files) */
  project?: string;
  instruction: string;
  format?: 'png' | 'jpg';
  width?: number;
  height?: number;
}

export interface ImageResult {
  data: Uint8Array;
  url: string;
  contentPath: string;
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

  // --- Generation & Editing Methods ---

  /**
   * Generate an image from a text prompt.
   */
  async generateImage(options: GenerateOptions): Promise<ImageResult> {
    const { project, prompt, width, height, format = 'png', smartUrl = true } = options;

    if (smartUrl) {
      // Step 1: Recommend smart slug
      let recommendedSlug: string;
      try {
        const recommendation = await this.apiFetch<any>('url/recommend', {
          method: 'POST',
          body: JSON.stringify({ prompt, project, width, height, extension: format }),
        });
        recommendedSlug = recommendation.recommendedSlug;
      } catch {
        recommendedSlug = this.slugify(prompt);
      }

      // Step 2: Generate with slug
      const result = await this.apiFetch<any>('content/generate', {
        method: 'POST',
        body: JSON.stringify({ prompt, project, slug: recommendedSlug, width, height, extension: format }),
      });

      const contentPath = result.prompt?.replace(/^\//, '') || `${project}/${recommendedSlug}.${format}`;
      
      // If we got the data back immediately, return it
      if (result.mediaAsset?.data) {
        const [, base64] = result.mediaAsset.data.split(',');
        return {
          data: this.base64ToUint8Array(base64),
          url: `${this.imageUrl}/${contentPath}`,
          contentPath
        };
      }

      // Otherwise poll
      return this.pollImage(contentPath, 'Generating');
    } else {
      // Legacy behavior: poll by derived slug
      const slug = this.slugify(prompt);
      const contentPath = width && height
        ? `${project}/${slug}_${width}x${height}.${format}`
        : `${project}/${slug}.${format}`;
      return this.pollImage(contentPath, 'Generating');
    }
  }

  /**
   * Edit an existing image or a local file.
   * @param source - Inliner URL or image file (Buffer/Blob/File)
   * @param options - Edit options (instruction is required)
   */
  async editImage(
    source: string | Buffer | Blob | File,
    options: EditOptions
  ): Promise<ImageResult> {
    const { instruction, format = 'png', project, width, height } = options;
    const editSlug = this.slugify(instruction);
    const dimsSuffix = width && height ? `_${width}x${height}` : '';

    if (typeof source === 'string' && (source.startsWith('http://') || source.startsWith('https://'))) {
      // Edit an existing URL via chaining
      let urlPath: string;
      try {
        urlPath = new URL(source).pathname;
      } catch {
        throw new Error(`Invalid source URL: ${source}`);
      }
      const basePath = urlPath.replace(/^\//, '');
      // If basePath already has dimensions, we might want to replace them if width/height provided, 
      // but URL chaining usually inherits or appends.
      // The CLI pattern is: {basePath}/{editSlug}.{format}
      const contentPath = `${basePath}/${editSlug}${dimsSuffix}.${format}`;
      return this.pollImage(contentPath, 'Editing');
    } else {
      // Edit a local file: Upload first, then edit
      if (!project) {
        throw new Error('Project namespace is required when editing local files');
      }

      const uploadName = this.slugify(`edit-source-${Date.now()}`);
      const uploadResult = await this.uploadImage(source as any, `${uploadName}.png`, { project, slug: uploadName });
      
      const uploadedPath = uploadResult.content.prompt.replace(/^\//, '');
      const contentPath = `${uploadedPath}/${editSlug}${dimsSuffix}.${format}`;
      
      return this.pollImage(contentPath, 'Editing');
    }
  }

  private async pollImage(contentPath: string, label: string, maxSeconds = 180): Promise<ImageResult> {
    const jsonPath = `content/request-json/${contentPath}`;
    const imgUrl = `${this.imageUrl}/${contentPath}`;
    const maxAttempts = Math.ceil(maxSeconds / 3);

    for (let i = 0; i < maxAttempts; i++) {
      const url = `${this.apiUrl}/${jsonPath}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` }
      });

      if (res.status === 200) {
        const json = await res.json();
        if (json.mediaAsset?.data) {
          const [, base64] = json.mediaAsset.data.split(',');
          return {
            data: this.base64ToUint8Array(base64),
            url: imgUrl,
            contentPath
          };
        }
        
        // Fallback: try fetching from CDN
        const cdnRes = await fetch(imgUrl, {
          headers: { 'Authorization': `Bearer ${this.apiKey}` }
        });
        if (cdnRes.ok) {
          return {
            data: new Uint8Array(await cdnRes.arrayBuffer()),
            url: imgUrl,
            contentPath
          };
        }
      }

      if (res.status !== 200 && res.status !== 202) {
        const body = await res.text().catch(() => '');
        throw new Error(`${label} failed (${res.status}): ${body}`);
      }

      // 202 - Accepted/Processing, wait and retry
      await new Promise(r => setTimeout(r, 3000));
    }

    throw new Error(`${label} timed out after ${maxSeconds}s. URL: ${imgUrl}`);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 100);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
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
   * 
   * This method uses a GET request to the backend. The expression is parsed
   * securely on the server using parameterized SQL queries to prevent injection.
   */
  async search(options: SearchOptions): Promise<any[]> {
    const params = new URLSearchParams();
    params.append('expression', options.expression);
    if (options.sort_by) params.append('sort_by', options.sort_by);
    if (options.direction) params.append('direction', options.direction);
    if (options.max_results) params.append('max_results', options.max_results.toString());
    
    return this.apiFetch<any[]>(`content/search?${params.toString()}`);
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

  /**
   * Delete one or more images by their content IDs
   */
  async deleteImages(contentIds: string[]): Promise<{ message: string }> {
    return this.apiFetch<{ message: string }>('content/delete', {
      method: 'POST',
      body: JSON.stringify({ contentIds }),
    });
  }

  /**
   * Rename an image (update its URL slug and project)
   * @param contentId UUID of the content
   * @param newUrl New path in "project/slug" format (e.g. "marketing/new-hero")
   */
  async renameImage(contentId: string, newUrl: string): Promise<{ success: true; message: string }> {
    return this.apiFetch<{ success: true; message: string }>(`content/rename/${contentId}`, {
      method: 'POST',
      body: JSON.stringify({ newUrl }),
    });
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

  // --- Helpers ---

  /**
   * Build an Inliner image URL
   */
  buildImageUrl(project: string, description: string, width: number, height: number, format: 'png' | 'jpg' = 'png'): string {
    const slug = this.slugify(description);
    return `${this.imageUrl}/${project}/${slug}_${width}x${height}.${format}`;
  }
}
