/**
 * @file Implements the VersionControlService interface for GitLab using @gitbeaker/rest.
 */
import {Camelize, DiscussionNotePositionOptions, DiscussionNoteSchema, DiscussionSchema, Gitlab} from "@gitbeaker/rest";
import {
  VersionControlService,
  PullRequestDetails, // GitLab calls these Merge Requests
  Comment,
  FileContent,
} from "../services/VersionControlService";
import "dotenv/config"; // To load GITLAB_TOKEN and GITLAB_HOST from .env

/**
 * Helper to parse GitLab project path and MR IID from a URL.
 * Example URL: https://gitlab.com/gitlab-org/gitlab/-/merge_requests/123
 * @param urlString - The GitLab Merge Request URL.
 * @returns An object with projectPath and mrIid, or null if parsing fails.
 */
function parseGitLabMrUrl(
  urlString: string
): { projectPath: string; mrIid: number } | null {
  try {
    const url = new URL(urlString);
    const pathParts = url.pathname.split("/").filter((part) => part.length > 0);
    // Expected structure: /group/subgroup/project/-/merge_requests/iid
    const mrIndex = pathParts.indexOf("merge_requests");
    if (
      mrIndex > 1 &&
      pathParts[mrIndex - 1] === "-" &&
      pathParts.length > mrIndex + 1
    ) {
      const projectPath = pathParts.slice(0, mrIndex - 1).join("/");
      const mrIid = parseInt(pathParts[mrIndex + 1], 10);
      if (projectPath && !isNaN(mrIid)) {
        return { projectPath, mrIid };
      }
    }
    return null;
  } catch (e) {
    console.error("Error parsing GitLab MR URL:", e);
    return null;
  }
}

/**
 * Implements VersionControlService for interacting with GitLab.
 */
export class GitLabService implements VersionControlService {
  private gitlab: InstanceType<typeof Gitlab>;

  /**
   * Initializes a new instance of the GitLabService.
   * Requires GITLAB_TOKEN to be set in the environment variables.
   * GITLAB_HOST is optional and defaults to 'https://gitlab.com'.
   * @throws Error if GITLAB_TOKEN is not found.
   */
  constructor() {
    const token = process.env.GITLAB_TOKEN;
    const host = process.env.GITLAB_HOST || "https://gitlab.com";

    if (!token) {
      throw new Error(
        "GITLAB_TOKEN not found in environment variables. Please ensure it is set."
      );
    }
    this.gitlab = new Gitlab({
      host: host,
      token: token,
    });
  }

  /**
   * Retrieves detailed information about a specific merge request.
   * @param prIdentifier - A MR IID (number), a GitLab MR URL (string), or an object { owner: string; repo: string; pullNumber: number }.
   * @returns A promise that resolves to the merge request details.
   * @throws Error if projectPath or mrIid cannot be determined.
   */
  async getPullRequestDetails(
    prIdentifier:
      | string
      | number
      | { owner: string; repo: string; pullNumber: number }
  ): Promise<PullRequestDetails> {
    let projectPath: string;
    let merge_request_iid: number;

    if (typeof prIdentifier === "object") {
      projectPath = prIdentifier.repo;
      merge_request_iid = prIdentifier.pullNumber;
    } else if (typeof prIdentifier === "number") {
      projectPath = process.env.GITLAB_PROJECT_PATH || "";
      merge_request_iid = prIdentifier;
      if (!projectPath) {
        throw new Error(
          "GITLAB_PROJECT_PATH env must be set if only MR IID (pullNumber) is provided."
        );
      }
    } else {
      const parsed = parseGitLabMrUrl(prIdentifier);
      if (!parsed) {
        throw new Error(
          "Invalid GitLab MR URL format. Expected format: https://gitlab.com/group/project/-/merge_requests/iid"
        );
      }
      projectPath = parsed.projectPath;
      merge_request_iid = parsed.mrIid;
    }

    projectPath = String(projectPath);

    if (!projectPath || !merge_request_iid) {
      throw new Error(
        "Could not determine projectPath or merge_request_iid from prIdentifier."
      );
    }

    try {
      const mr = await this.gitlab.MergeRequests.show(
        projectPath,
        merge_request_iid
      );
      return {
        owner: String(projectPath).split("/")[0],
        repo: String(projectPath),
        pullNumber: mr.iid,
        headRef: String(mr.source_branch),
        baseRef: String(mr.target_branch),
      };
    } catch (error: any) {
      console.error(
        `Error fetching MR details for ${projectPath} !${merge_request_iid}:`,
        error.message || error
      );
      throw error;
    }
  }

  /**
   * Fetches all discussion comments (notes) associated with a given merge request.
   * @param prDetails - The details of the merge request.
   * @returns A promise that resolves to an array of comments.
   */
  async getPullRequestComments(
    prDetails: PullRequestDetails
  ): Promise<Comment[]> {
    try {
      const notes = await this.gitlab.MergeRequestNotes.all(
        prDetails.repo,
        prDetails.pullNumber
      );

      return notes
        .filter((note) => note.type === "DiffNote" && note.resolvable)
        .map((note) => {
          let filePath: string | undefined = undefined;
          let lineNumber: number | undefined = undefined;

          if (note.position) {
            const position = note.position as any; // Best-effort mapping
            filePath = position.new_path || position.old_path;
            lineNumber = position.new_line || position.old_line;
          }

          return {
            id: note.id,
            body: note.body,
            filePath: filePath,
            endLineNumber: lineNumber,
          };
        });
    } catch (error: any) {
      console.error(
        `Error fetching comments for MR !${prDetails.pullNumber} in ${prDetails.repo}:`,
        error.message || error
      );
      throw error;
    }
  }

  /**
   * Retrieves the content of a specific file from the repository.
   * @param prDetails - The details of the merge request.
   * @param filePath - The path to the file within the repository.
   * @param ref - The commit SHA, branch name, or tag. Defaults to MR's head ref.
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
      const fileData = await this.gitlab.RepositoryFiles.show(
        prDetails.repo,
        filePath,
        fileRef
      );

      if (
        typeof fileData.content !== "string" ||
        fileData.encoding !== "base64"
      ) {
        if (
          typeof (fileData as any).content === "string" &&
          !(fileData as any).encoding
        ) {
          return {
            path: filePath,
            content: (fileData as any).content,
            encoding: "utf-8",
          };
        }
        throw new Error(
          `File content for ${filePath} is not in expected base64 format or is unavailable.`
        );
      }

      return {
        path: (fileData as any).file_path || filePath,
        content: Buffer.from(fileData.content, "base64").toString("utf-8"),
        encoding: "utf-8",
      };
    } catch (error: any) {
      console.error(
        `Error fetching file content for ${filePath} in MR !${prDetails.pullNumber}:`,
        error.message || error
      );
      throw error;
    }
  }

  /**
   * Posts a suggestion as a new discussion on a merge request.
   * If the original comment (note) being replied to had a position, the new discussion
   * will be linked to that same position. Otherwise, it will be a general discussion on the MR.
   * GitLab suggestion format:
   * ```suggestion:-0+0
   * replacement code
   * ```
   * @param prDetails - The details of the merge request.
   * @param replyToCommentId - The ID of the note (comment) to which this suggestion is conceptually a reply.
   * @param suggestion - The formatted suggestion string (GitLab suggestion markdown).
   * @param explanation - An optional explanation to accompany the suggestion.
   * @returns A promise that resolves when the discussion has been posted.
   */
  async postSuggestionComment(
    prDetails: PullRequestDetails,
    replyToCommentId: string | number, // This is note_id in GitLab
    suggestion: string, // This should be the full body, including the ```suggestion block
    explanation?: string
  ): Promise<void> {
    let discussionBody = suggestion;
    if (explanation) {
      discussionBody = `${explanation}\n${suggestion}`;
    }

    try {
      // Fetch the original note to determine if we can use its position.
      // This helps decide if the new discussion should be linked to a specific diff line.
      const originalDiscussionThread = await this.gitlab.MergeRequestDiscussions.show(
          prDetails.repo,
          prDetails.pullNumber,
          "" + replyToCommentId
      )
      const firstThreadNote = originalDiscussionThread.notes && originalDiscussionThread.notes[0];

      if (!firstThreadNote) {
        throw new Error(
          `No original discussion thread found for comment ID ${replyToCommentId}.`
        );
      }

      const newDiscussionNote: Partial<DiscussionNoteSchema | Camelize<DiscussionNoteSchema>> = {
        ...firstThreadNote,
      }

      if (originalDiscussionThread) {
        // If the original note had a position, use it for the new discussion.
        newDiscussionNote.position = firstThreadNote.position;
        console.log(
          `Original comment ${replyToCommentId} has a position. Creating new discussion with this position.`
        );
      } else {
        // If no position on the original note, create a general discussion on the MR.
        // We'll prepend a reference to the original comment ID in the body for context.
        newDiscussionNote.body = `Replying to (or inspired by) comment ID ${replyToCommentId}:\n${discussionBody}`;
        console.log(
          `Original comment ${replyToCommentId} has no position. Creating new general discussion on MR, referencing the original comment.`
        );
      }

      // Create a new discussion with the suggestion.
      // The third argument to MergeRequestDiscussions.create is the options object.
      await this.gitlab.MergeRequestDiscussions.create(
        prDetails.repo,
        prDetails.pullNumber,
          newDiscussionNote.body!,
          {
            position: firstThreadNote.position as DiscussionNotePositionOptions,
          }
      );

      console.log(
        `Successfully posted suggestion as new discussion (related to comment ID ${replyToCommentId}) on MR !${prDetails.pullNumber}.`
      );
    } catch (error: any) {
      console.error(
        `Error posting suggestion (as new discussion) for MR !${prDetails.pullNumber} (related to comment ID ${replyToCommentId}):`,
        error.message || error
      );
      if (error.response && error.response.data) {
        console.error("GitLab API Error Details:", error.response.data);
      }
      throw error;
    }
  }
}
