import { GitLabService } from '../implementations/GitLabService';
import { VersionControlService, PullRequestDetails } from '../services/VersionControlService';

import {describe, expect, beforeAll, it} from 'vitest';
import {GitHubService} from "../implementations/GitHubService";

const GITLAB_PROJECT_PATH = process.env.GITLAB_PROJECT_PATH || 'felixAnhalt/pull-request-comment-resolver';
const GITLAB_PR_NUMBER = process.env.GITLAB_PR_NUMBER
    ? parseInt(process.env.GITLAB_PR_NUMBER, 10)
    : 1;

describe('Main Github Integration', () => {
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

    it('fetches merge request details', async () => {
        expect(prDetails).toHaveProperty('repo', GITLAB_PROJECT_PATH);
        expect(prDetails).toHaveProperty('pullNumber', GITLAB_PR_NUMBER);
        expect(prDetails.headRef).toBeTruthy();
        expect(prDetails.baseRef).toBeTruthy();
    });

    it('fetches comments on the merge request', async () => {
        const comments = await gitlab.getPullRequestComments(prDetails);
        expect(Array.isArray(comments)).toBe(true);
        if (comments.length > 0) {
            expect(comments[0]).toHaveProperty('id');
            expect(comments[0]).toHaveProperty('body');
        }
    });

    it('fetches file content from the merge request', async () => {
        const filePath = 'README.md';
        const fileContent = await gitlab.getFileContent(prDetails, filePath);
        expect(fileContent).toHaveProperty('path', filePath);
        expect(typeof fileContent.content).toBe('string');
        expect(fileContent.content.length).toBeGreaterThan(0);
    });
});
