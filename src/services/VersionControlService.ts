/**
 * @file Defines the interface for a version control service.
 * This allows for abstraction over different version control systems like GitHub or GitLab.
 */

/**
 * Represents a comment made on a pull/merge request.
 */
export interface Comment {
  /** Unique identifier for the comment. */
  id: string | number;
  /** The main text content of the comment. */
  body: string;
  /** Path to the file the comment refers to, if applicable. */
  filePath?: string;
  /** Line number in the file the comment refers to, if applicable. */
  lineNumber?: number;
  // TODO: Add other relevant comment properties as needed, e.g., author, created_at.
}

/**
 * Contains essential details of a pull/merge request.
 */
export interface PullRequestDetails {
  /** The owner of the repository (e.g., username or organization name). */
  owner: string;
  /** The name of the repository. */
  repo: string;
  /** The number identifying the pull/merge request. */
  pullNumber: number;
  /** The source branch of the pull request. */
  headRef?: string;
  /** The base (target) branch of the pull request. */
  baseRef?: string;
  // TODO: Add other relevant PR properties as needed, e.g., title, description, author.
}

/**
 * Represents the content of a file.
 */
export interface FileContent {
  /** The path to the file within the repository. */
  path: string;
  /** The actual content of the file. */
  content: string;
  /** The encoding of the file content (e.g., "base64" or "utf-8"). */
  encoding?: "base64" | "utf-8";
}

/**
 * Defines the contract for interacting with a version control system.
 */
export interface VersionControlService {
  /**
   * Retrieves detailed information about a specific pull/merge request.
   * @param prIdentifier - An identifier for the pull request (e.g., PR number, or an object with owner/repo/pullNumber).
   *                     For MVP, this might be a simple string or number.
   * @returns A promise that resolves to the pull request details.
   */
  getPullRequestDetails(
    prIdentifier:
      | string
      | number
      | { owner: string; repo: string; pullNumber: number }
  ): Promise<PullRequestDetails>;

  /**
   * Fetches all comments associated with a given pull/merge request.
   * @param prDetails - The details of the pull request.
   * @returns A promise that resolves to an array of comments.
   */
  getPullRequestComments(prDetails: PullRequestDetails): Promise<Comment[]>;

  /**
   * Retrieves the content of a specific file from the repository, optionally at a specific commit or branch.
   * @param prDetails - The details of the pull request (used for context like owner/repo).
   * @param filePath - The path to the file within the repository.
   * @param ref - Optional. The commit SHA, branch name, or tag to get the file content from.
   *              If not provided, typically defaults to the PR's head commit or the repository's default branch.
   * @returns A promise that resolves to the file content.
   */
  getFileContent(
    prDetails: PullRequestDetails,
    filePath: string,
    ref?: string
  ): Promise<FileContent>;

  /**
   * Posts a suggestion as a new comment, typically in reply to an existing review comment.
   * @param prDetails - The details of the pull request.
   * @param replyToCommentId - The ID of the comment to which this suggestion is a reply.
   * @param suggestion - The formatted suggestion string (e.g., GitHub suggestion markdown).
   * @param explanation - An optional explanation to accompany the suggestion.
   * @returns A promise that resolves when the comment has been posted.
   */
  postSuggestionComment(
    prDetails: PullRequestDetails,
    replyToCommentId: string | number,
    suggestion: string,
    explanation?: string
  ): Promise<void>;

  /**
   * Retrieves the diff of a pull/merge request.
   * This can be useful for providing more context to the LLM.
   * @param prDetails - The details of the pull request.
   * @returns A promise that resolves to the diff content as a string.
   */
  // getPullRequestDiff(prDetails: PullRequestDetails): Promise<string>; // Uncomment if needed for future phases
}
