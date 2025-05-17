# pull-request-comment-resolver

Automatically scans GitHub or GitLab Pull Request comments and suggests commit changes that resolve reviewer feedback using LLM-powered code suggestions (e.g., GitHub suggestion syntax).

## Overview

This tool fetches PR comments, generates code suggestions using an LLM, and posts them back to the PR for easy application. It supports both GitHub and GitLab, and is designed for automation in CI/CD or developer workflows.

## Source Structure

```
src/
├── __tests__/                # Integration tests for core flows and services
├── implementations/          # Platform-specific implementations:
│   ├── GitHubService.ts      # GitHub API integration
│   ├── GitLabService.ts      # GitLab API integration
│   └── AzureOpenAiLlmService.ts # Azure OpenAI LLM integration
├── index.ts                  # Entrypoint: runs main()
├── main.ts                   # Main orchestration logic
└── services/                 # Abstract service interfaces:
    ├── VersionControlService.ts # Version control abstraction
    └── LlmService.ts             # LLM abstraction
```

## File Responsibilities

- [`src/index.ts`](src/index.ts:1): Application entrypoint. Calls [`main()`](src/main.ts:235) and handles top-level errors.
- [`src/main.ts`](src/main.ts:1): Main orchestration logic. Loads environment, selects platform, fetches PR details and comments, aggregates context, generates suggestions, and posts them.
  - Uses:
    - [`GitHubService`](src/implementations/GitHubService.ts:1) / [`GitLabService`](src/implementations/GitLabService.ts:1) for platform integration
    - [`AzureOpenAiLlmService`](src/implementations/AzureOpenAiLlmService.ts:1) for LLM suggestions
    - [`VersionControlService`](src/services/VersionControlService.ts:1) and [`LlmService`](src/services/LlmService.ts:1) as abstractions
- [`src/implementations/`](src/implementations/): Concrete implementations for version control and LLM providers.
- [`src/services/`](src/services/): Abstract service interfaces for version control and LLMs.
- [`src/__tests__/`](src/__tests__/): Integration tests for main flows and service implementations.

## Usage

1. Set environment variables:
   - `PULL_REQUEST_URL` or `PULL_REQUEST_NUMBER`
   - Platform credentials (see `.env.example`)
2. Install dependencies:
   ```sh
   npm install
   ```
3. Run the resolver:
   ```sh
   npm start
   ```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values for your platform and LLM provider.

## Supported Platforms

- GitHub
- GitLab

## LLM Provider

- Azure OpenAI (see [`src/implementations/AzureOpenAiLlmService.ts`](src/implementations/AzureOpenAiLlmService.ts:1))

## Testing

Run integration tests:

```sh
npm test
```
