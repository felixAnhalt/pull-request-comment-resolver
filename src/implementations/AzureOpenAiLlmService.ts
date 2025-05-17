/**
 * @file Implements the LlmService interface for Azure OpenAI using Langchain.
 */
import { AzureChatOpenAI } from "@langchain/openai";
import {
  LlmService,
  LlmPromptPayload,
  LlmSuggestion,
} from "../services/LlmService";
import "dotenv/config";

/**
 * Implements LlmService for interacting with Azure OpenAI via Langchain.
 */
export class AzureOpenAiLlmService implements LlmService {
  private llm: AzureChatOpenAI;

  /**
   * Initializes a new instance of the AzureOpenAiLlmService.
   * Requires AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_INSTANCE_NAME,
   * AZURE_OPENAI_API_DEPLOYMENT_NAME, and AZURE_OPENAI_API_VERSION
   * to be set in the environment variables.
   * @throws Error if any required Azure OpenAI environment variables are not found.
   */
  constructor() {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    const modelName = process.env.AZURE_OPENAI_API_MODEL_NAME;
    const deploymentName = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT_NAME;
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION;


    // AZURE_OPENAI_API_INSTANCE_NAME="gpt-4.1-mini-test" # e.g., my-openai-resource

    if (!apiKey || !modelName || !deploymentName || !apiVersion || !endpoint) {
      throw new Error(
        "Missing one or more Azure OpenAI environment variables (AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_INSTANCE_NAME, AZURE_OPENAI_API_DEPLOYMENT_NAME, AZURE_OPENAI_API_VERSION, AZURE_OPENAI_ENDPOINT_NAME). Please ensure they are set."
      );
    }

    this.llm = new AzureChatOpenAI({
      azureOpenAIApiKey: apiKey,
      azureOpenAIApiVersion: apiVersion,
      azureOpenAIApiDeploymentName: deploymentName,
      azureOpenAIEndpoint: endpoint,
      model: modelName,
      // Optional parameters:
      // temperature: 0.7,
      // maxTokens: 1000,
    });
  }

  /**
   * Generates a code suggestion based on the provided payload using Azure OpenAI.
   * @param payload - The input data required by the LLM to generate a suggestion.
   * @returns A promise that resolves to the LLM-generated suggestion.
   */
  async generateSuggestion(payload: LlmPromptPayload): Promise<LlmSuggestion> {
    const { reviewerComment, codeContext, projectRules, language, filePath, originalCode } =
      payload;

    const systemPrompt = `You are an expert software developer assisting with code reviews. Your task is to provide a code suggestion to address a reviewer's comment.
Respond ONLY with a GitHub commit suggestion markdown block and a one-line rationale for the change.

The suggestion block should look like:
\`\`\`suggestion
<new_code_here>
\`\`\`
Rationale: <Your one-line rationale here>

If you cannot provide a suggestion or the request is unclear, respond with:
\`\`\`suggestion
// No suggestion could be generated for this comment.
\`\`\`
Rationale: <Brief reason why no suggestion could be made>
`;

    let humanPromptContent = `A reviewer has made the following comment:
"${reviewerComment}"

Here is the relevant code context`;
    if (filePath) {
      humanPromptContent += ` from file \`${filePath}\``;
    }
    if (language) {
      humanPromptContent += ` (language: ${language})`;
    }
    humanPromptContent += `:
--- start of extended code context ---
${codeContext}
--- end of extended code context ---
Here is the original code:
--- start of exact original code lines ---
${originalCode}
--- end of exact original code lines ---
`;

    if (projectRules) {
      humanPromptContent += `
Please ensure your suggestion complies with the following project rules:
${projectRules}
`;
    }

    humanPromptContent += `
Based on the comment and the code, please provide a GitHub commit suggestion markdown block and a one-line rationale.`;

    try {
      const fullPrompt = `${systemPrompt}\n\n${humanPromptContent}`;
      const response = await this.llm.invoke(fullPrompt);
      const responseText = response.content as string;

      const suggestionMatch = responseText.match(
        /```suggestion\n([\s\S]*?)\n```/
      );
      const rationaleMatch = responseText.match(/Rationale: (.*)/);

      if (suggestionMatch && suggestionMatch[0]) {
        return {
          suggestionMarkdown: suggestionMatch[0],
          rationale: rationaleMatch
            ? rationaleMatch[1].trim()
            : "No rationale provided.",
        };
      } else {
        console.warn(
          "LLM response did not contain a valid suggestion block. Response:",
          responseText
        );
        return {
          suggestionMarkdown:
            "```suggestion\n// LLM response was not in the expected format.\n```",
          rationale: "Could not parse suggestion from LLM response.",
          error: "LLM response parsing failed.",
        };
      }
    } catch (error: any) {
      console.error(
        "Error generating suggestion from Azure OpenAI:",
        error.message
      );
      if (error.response && error.response.data) {
        console.error("Azure OpenAI API Error Details:", error.response.data);
      }
      return {
        suggestionMarkdown:
          "```suggestion\n// Error occurred while generating suggestion.\n```",
        rationale: "Failed to generate suggestion due to an internal error.",
        error:
          error.message || "Unknown error during LLM suggestion generation.",
      };
    }
  }
}
