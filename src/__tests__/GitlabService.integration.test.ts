import { GitLabService } from '../implementations/GitLabService';
import { VersionControlService, PullRequestDetails } from '../services/VersionControlService';

import {describe, expect, beforeAll, it} from 'vitest';

const GITLAB_PROJECT_PATH = process.env.GITLAB_PROJECT_PATH || 'projekte-oev-berlin/digital-campus-360/funpoints-dapp/dapp-frontend';
const GITLAB_PR_NUMBER = process.env.GITLAB_PR_NUMBER
    ? parseInt(process.env.GITLAB_PR_NUMBER, 10)
    : 520;

describe('GitLabService Integration', () => {
    let gitlab: VersionControlService;
    let prDetails: PullRequestDetails;

    beforeAll(async () => {
        gitlab = new GitLabService();
        prDetails = await gitlab.getPullRequestDetails({
            owner: '',
            repo: GITLAB_PROJECT_PATH,
            pullNumber: GITLAB_PR_NUMBER,
        });
    });

    it('fetches merge request details', async () => {

        expect(prDetails).toHaveProperty('repo', GITLAB_PROJECT_PATH);
        expect(prDetails).toHaveProperty('pullNumber', GITLAB_PR_NUMBER);
        expect(prDetails.headRef).toBeTruthy();
        expect(prDetails.baseRef).toBeTruthy();
    }, {
        timeout: 600 * 1000,
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
