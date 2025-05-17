/**
 * @file Implements the VersionControlService interface for GitHub using @octokit/rest.
 */
import { Octokit } from "@octokit/rest";
import {
  VersionControlService,
  PullRequestDetails,
  Comment,
  FileContent,
} from "../services/VersionControlService";
import "dotenv/config"; // To load GITHUB_TOKEN from .env

/**
 * Implements VersionControlService for interacting with GitHub.
 */
export class GitHubService implements VersionControlService {
  private octokit: Octokit;

  /**
   * Initializes a new instance of the GitHubService.
   * Requires GITHUB_TOKEN to be set in the environment variables.
   * @throws Error if GITHUB_TOKEN is not found in environment variables.
   */
  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error(
        "GITHUB_TOKEN not found in environment variables. Please ensure it is set."
      );
    }
    this.octokit = new Octokit({ auth: token });
  }

  /**
   * Retrieves detailed information about a specific pull request.
   * For MVP, this might take a PR number and assume owner/repo from env or constants.
   * @param prIdentifier - A PR number or an object with owner, repo, and pullNumber.
   * @returns A promise that resolves to the pull request details.
   * @throws Error if owner, repo, or pull_number cannot be determined.
   */
  async getPullRequestDetails(
    prIdentifier:
      | string
      | number
      | { owner: string; repo: string; pullNumber: number }
  ): Promise<PullRequestDetails> {
    let owner: string, repo: string, pull_number: number;

    if (typeof prIdentifier === "object") {
      owner = prIdentifier.owner;
      repo = prIdentifier.repo;
      pull_number = prIdentifier.pullNumber;
    } else if (
      typeof prIdentifier === "number" ||
      (!isNaN(Number(prIdentifier)))
    ) {
      // For MVP, let's assume owner and repo might come from ENV or be hardcoded if only number is passed
      // This part needs to be more robust or clearly defined for MVP scope.
      // For now, we'll throw an error if they are not provided with a number.
      // Consider using environment variables for default owner/repo for MVP.
      owner = process.env.GITHUB_OWNER || ""; // Example: "octocat"
      repo = process.env.GITHUB_REPO || ""; // Example: "Spoon-Knife"
      pull_number = Number(prIdentifier);
      if (!owner || !repo) {
        throw new Error(
          "Owner and Repo must be provided or set in GITHUB_OWNER/GITHUB_REPO env for numeric PR identifier."
        );
      }
    } else {
      // Attempt to parse from URL string "https://github.com/owner/repo/pull/123"
      try {
        const url = new URL(prIdentifier as string);
        const pathParts = url.pathname
          .split("/")
          .filter((part) => part.length > 0);
        if (pathParts.length >= 4 && pathParts[2] === "pull") {
          owner = pathParts[0];
          repo = pathParts[1];
          pull_number = parseInt(pathParts[3], 10);
        } else {
          throw new Error("Invalid GitHub PR URL format.");
        }
      } catch (e) {
        throw new Error(
          "Invalid prIdentifier format. Must be a number, a GitHub PR URL, or an object {owner, repo, pullNumber}."
        );
      }
    }

    if (!owner || !repo || !pull_number) {
      throw new Error(
        "Could not determine owner, repo, or pull_number from prIdentifier."
      );
    }

    try {
      const { data: prData } = await this.octokit.pulls.get({
        owner,
        repo,
        pull_number,
      });

      return {
        owner,
        repo,
        pullNumber: prData.number,
        headRef: prData.head.ref,
        baseRef: prData.base.ref,
        // TODO: Map other relevant fields from prData if needed
      };
    } catch (error: any) {
      console.error(
        `Error fetching PR details for ${owner}/${repo}#${pull_number}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Fetches all review comments associated with a given pull request.
   * @param prDetails - The details of the pull request.
   * @returns A promise that resolves to an array of comments.
   */
  async getPullRequestComments(
    prDetails: PullRequestDetails
  ): Promise<Comment[]> {
    try {
      const { data: reviewComments } =
        await this.octokit.pulls.listReviewComments({
          owner: prDetails.owner,
          repo: prDetails.repo,
          pull_number: prDetails.pullNumber,
        });

      return reviewComments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        filePath: comment.path,
        endLineNumber: comment.line || comment.original_line, // original_line for outdated comments,
        startLineNumber: comment.start_line,
        // TODO: Map other relevant fields like user, created_at
      }));
    } catch (error: any) {
      console.error(
        `Error fetching comments for PR #${prDetails.pullNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Retrieves the content of a specific file from the repository.
   * @param prDetails - The details of the pull request (used for owner/repo context).
   * @param filePath - The path to the file within the repository.
   * @param ref - Optional. The commit SHA, branch name, or tag. Defaults to PR's head ref.
   * @returns A promise that resolves to the file content.
   */
  async getFileContent(
    prDetails: PullRequestDetails,
    filePath: string,
    ref?: string
  ): Promise<FileContent> {
    try {
      const fileRef = ref || prDetails.headRef;
      if (!fileRef) {
        throw new Error(
          "Cannot determine file reference (branch/commit SHA) for getFileContent."
        );
      }
      const { data: contentData } = await this.octokit.repos.getContent({
        owner: prDetails.owner,
        repo: prDetails.repo,
        path: filePath,
        ref: fileRef,
      });

      if (Array.isArray(contentData) || contentData.type !== "file") {
        throw new Error(
          `Path ${filePath} is a directory or not a file type (e.g., symlink, submodule).`
        );
      }
      // At this point, contentData is known to be of the file type.
      // Octokit's types ensure that if type is 'file', 'content' and 'encoding' exist.
      const fileData = contentData as {
        path: string;
        content: string;
        encoding: string;
      };

      return {
        path: fileData.path,
        content: Buffer.from(
          fileData.content,
          fileData.encoding as BufferEncoding
        ).toString("utf-8"),
        encoding: "utf-8", // We always convert to utf-8
      };
    } catch (error: any) {
      console.error(
        `Error fetching file content for ${filePath} in PR #${prDetails.pullNumber}:`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Posts a suggestion as a new comment, replying to an existing review comment.
   * @param prDetails - The details of the pull request.
   * @param replyToCommentId - The ID of the review comment to which this suggestion is a reply.
   * @param suggestion - The formatted suggestion string (GitHub suggestion markdown).
   * @param explanation - An optional explanation to accompany the suggestion.
   * @returns A promise that resolves when the comment has been posted.
   */
  async postSuggestionComment(
    prDetails: PullRequestDetails,
    replyToCommentId: string | number,
    suggestion: string, // This should be the full body, including the ```suggestion block
    explanation?: string
  ): Promise<void> {
    try {
      let body = suggestion;
      if (explanation) {
        body = `${explanation}\n${suggestion}`;
      }

      await this.octokit.pulls.createReplyForReviewComment({
        owner: prDetails.owner,
        repo: prDetails.repo,
        pull_number: prDetails.pullNumber,
        comment_id: Number(replyToCommentId),
        body: body,
      });
      console.log(
        `Successfully posted suggestion in reply to comment ID ${replyToCommentId} on PR #${prDetails.pullNumber}.`
      );
    } catch (error: any) {
      console.error(
        `Error posting suggestion for PR #${prDetails.pullNumber}:`,
        error.message
      );
      // Log the actual error object for more details if available
      if (error.response && error.response.data) {
        console.error("GitHub API Error Details:", error.response.data);
      }
      throw error;
    }
  }
}
