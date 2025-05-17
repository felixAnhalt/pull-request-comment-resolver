import { GitHubService } from '../implementations/GitHubService';
import { VersionControlService, PullRequestDetails } from '../services/VersionControlService';

import {describe, expect, beforeAll, it} from 'vitest';

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'felixAnhalt';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pull-request-comment-resolver';
const GITHUB_PR_NUMBER = process.env.GITHUB_PR_NUMBER
    ? parseInt(process.env.GITHUB_PR_NUMBER, 10)
    : 1;

describe('GitHubService Integration', () => {
    let github: VersionControlService;
    let prDetails: PullRequestDetails;

    beforeAll(async () => {
        github = new GitHubService();
        prDetails = await github.getPullRequestDetails({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            pullNumber: GITHUB_PR_NUMBER,
        });
    });

    it('fetches pull request details', async () => {
        expect(prDetails).toHaveProperty('owner', GITHUB_OWNER);
        expect(prDetails).toHaveProperty('repo', GITHUB_REPO);
        expect(prDetails).toHaveProperty('pullNumber', GITHUB_PR_NUMBER);
        expect(prDetails.headRef).toBeTruthy();
        expect(prDetails.baseRef).toBeTruthy();
    });

    it('fetches comments on the pull request', async () => {
        const comments = await github.getPullRequestComments(prDetails);
        expect(Array.isArray(comments)).toBe(true);
        if (comments.length > 0) {
            expect(comments[0]).toHaveProperty('id');
            expect(comments[0]).toHaveProperty('body');
        }
    });

    it('fetches file content from the pull request', async () => {
        const filePath = 'README.md';
        const fileContent = await github.getFileContent(prDetails, filePath);
        expect(fileContent).toHaveProperty('path', filePath);
        expect(typeof fileContent.content).toBe('string');
        expect(fileContent.content.length).toBeGreaterThan(0);
    });

});
