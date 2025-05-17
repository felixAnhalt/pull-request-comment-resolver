/**
 * @file Main application entry point for the PR Comment Resolver.
 * Orchestrates fetching PR comments, generating suggestions, and posting them.
 */
import "dotenv/config";
import { GitHubService } from "./implementations/GitHubService";
import { AzureOpenAiLlmService } from "./implementations/AzureOpenAiLlmService";
import {
  VersionControlService,
  Comment,
  PullRequestDetails,
  FileContent,
} from "./services/VersionControlService";
import { LlmService, LlmPromptPayload } from "./services/LlmService";

// Constants
const MAX_CONTEXT_LINES = 20; // Number of lines before and after a commented line to fetch for context

/**
 * Fetches context lines around a specific line number from file content.
 * @param fileContent - The full content of the file.
 * @param lineNumber - The line number for which context is needed (1-indexed).
 * @param maxLines - The maximum number of lines to fetch before and after the target line.
 * @returns A string containing the context lines, or an empty string if context cannot be determined.
 */
function getCodeContext(
  fileContent: string,
  lineNumber: number,
  maxLines: number
): string {
  if (!fileContent || lineNumber <= 0) {
    return "";
  }
  const lines = fileContent.split("\n");
  const targetLineIndex = lineNumber - 1; // 0-indexed

  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return ""; // Line number out of bounds
  }

  const startLine = Math.max(0, targetLineIndex - maxLines);
  const endLine = Math.min(lines.length - 1, targetLineIndex + maxLines);

  // Include the commented line itself in the context
  return lines.slice(startLine, endLine + 1).join("\n");
}

const getOriginalCode = (startLine: number, endLine: number, fileContent: string) => {
    const lines = fileContent.split("\n");
    const startLineIndex = startLine - 1; // Convert to 0-indexed
    const endLineIndex = endLine - 1; // Convert to 0-indexed

    if (startLineIndex < 0 || endLineIndex >= lines.length) {
        return ""; // Line number out of bounds
    }

    return lines.slice(startLineIndex, endLineIndex + 1).join("\n");
}

/**
 * Processes a single review comment: fetches context, generates a suggestion, and posts it.
 * @param comment - The review comment to process.
 * @param prDetails - Details of the pull request.
 * @param vcsService - Instance of the VersionControlService.
 * @param llmService - Instance of the LlmService.
 */
async function processComment(
  comment: Comment,
  prDetails: PullRequestDetails,
  vcsService: VersionControlService,
  llmService: LlmService
): Promise<void> {
  console.log(
    `\nProcessing comment ID ${comment.id}: "${comment.body.substring(
      0,
      100
    )}..."`
  );
  if (!comment.filePath || !comment.endLineNumber) {
    console.log(
      "Comment does not have a specific file path or line number. Skipping."
    );
    return;
  }

  // 1. Fetch file content for context
  let fileContent: FileContent | null = null;
  let codeContext = "";
  try {
    // Attempt to get file content from the PR's head ref
    fileContent = await vcsService.getFileContent(
      prDetails,
      comment.filePath,
      prDetails.headRef
    );
    if (fileContent) {
      codeContext = getCodeContext(
        fileContent.content,
        comment.endLineNumber,
        MAX_CONTEXT_LINES
      );
    }
  } catch (error: any) {
    console.warn(
      `Could not fetch file content for ${comment.filePath} at ref ${prDetails.headRef}: ${error.message}. Suggestion might lack context.`
    );
    // Potentially try with baseRef if headRef fails or is too different, though headRef is usually what's reviewed.
  }

  if (!codeContext) {
    console.log(
      `Could not retrieve valid code context for comment ${comment.id} on ${comment.filePath}:${comment.endLineNumber}. Skipping suggestion.`
    );
    return;
  }

  const originalCode = getOriginalCode(
    comment.startLineNumber ?? comment.endLineNumber,
    comment.endLineNumber,
    fileContent!.content
  );
  // 2. Prepare payload for LLM
  const llmPayload: LlmPromptPayload = {
    reviewerComment: comment.body,
    codeContext: codeContext,
    filePath: comment.filePath,
    originalCode,
    // language: "typescript", // TODO: Detect language or make configurable
    // projectRules: "Ensure all functions are documented.", // TODO: Make configurable
  };

  // 3. Generate suggestion from LLM
  console.log(`Generating suggestion for comment ID ${comment.id}...`);
  const suggestionResult = await llmService.generateSuggestion(llmPayload);

  if (
    suggestionResult.error ||
    !suggestionResult.suggestionMarkdown.includes("```suggestion")
  ) {
    console.error(
      `Failed to generate a valid suggestion for comment ID ${comment.id}: ${
        suggestionResult.error || "Malformed suggestion"
      }`
    );
    if (suggestionResult.rationale)
      console.log(`LLM Rationale: ${suggestionResult.rationale}`);
    return;
  }

  // 4. Post suggestion back to PR
  try {
    console.log(`Posting suggestion for comment ID ${comment.id}...`);
    await vcsService.postSuggestionComment(
      prDetails,
      comment.id,
      suggestionResult.suggestionMarkdown,
      suggestionResult.rationale
        ? `Rationale: ${suggestionResult.rationale}`
        : undefined
    );
    console.log(`Successfully posted suggestion for comment ID ${comment.id}.`);
  } catch (error: any) {
    console.error(
      `Failed to post suggestion for comment ID ${comment.id}: ${error.message}`
    );
  }
}

/**
 * Main function to run the PR comment resolver.
 */
export async function main() {
  console.log("Starting PR Comment Resolver...");

  const prIdentifierEnv =
    process.env.PULL_REQUEST_URL || process.env.PULL_REQUEST_NUMBER;
  if (!prIdentifierEnv) {
    console.error(
      "PULL_REQUEST_URL or PULL_REQUEST_NUMBER environment variable not set."
    );
    process.exit(1);
  }

  let prIdentifier:
    | string
    | number
    | { owner: string; repo: string; pullNumber: number } = prIdentifierEnv;

  // Basic check if it's a number (string or actual number)
  if (!isNaN(Number(prIdentifierEnv))) {
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (owner && repo) {
      prIdentifier = { owner, repo, pullNumber: Number(prIdentifierEnv) };
      console.log(
        `Using PR number ${prIdentifierEnv} for repository ${owner}/${repo}`
      );
    } else {
      console.log(
        `Using PR number ${prIdentifierEnv}. Owner/Repo will be inferred by GitHubService if not part of a URL.`
      );
      prIdentifier = Number(prIdentifierEnv); // Let GitHubService handle it or throw error
    }
  } else if (prIdentifierEnv.includes("github.com")) {
    console.log(`Processing PR from URL: ${prIdentifierEnv}`);
    // GitHubService will parse the URL
  } else {
    console.error("Invalid PULL_REQUEST_URL or PULL_REQUEST_NUMBER format.");
    process.exit(1);
  }

  try {
    const vcsService: VersionControlService = new GitHubService();
    const llmService: LlmService = new AzureOpenAiLlmService();

    // 1. Get PR Details
    console.log("Fetching PR details...");
    const prDetails = await vcsService.getPullRequestDetails(prIdentifier);
    console.log(
      `Fetched details for PR #${prDetails.pullNumber} in ${prDetails.owner}/${prDetails.repo}`
    );
    console.log(
      `Head ref: ${prDetails.headRef}, Base ref: ${prDetails.baseRef}`
    );

    // 2. Get PR Comments
    console.log("Fetching PR comments...");
    const comments = await vcsService.getPullRequestComments(prDetails);
    console.log(`Found ${comments.length} review comments.`);

    if (comments.length === 0) {
      console.log("No comments to process. Exiting.");
      return;
    }

    // 3. Process each comment
    // For MVP, process all comments. Later, might filter for specific keywords or unanswered comments.
    for (const comment of comments) {
      // For now, process all comments that are on a file/line.
      if (comment.filePath && comment.endLineNumber) {
        await processComment(comment, prDetails, vcsService, llmService);
      } else {
        console.log(
          `Skipping comment ID ${comment.id} as it's not attached to a specific file/line.`
        );
      }
    }

    console.log("\nPR Comment Resolver finished.");
  } catch (error: any) {
    console.error("An error occurred in the main process:", error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
