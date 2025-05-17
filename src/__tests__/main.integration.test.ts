import { VersionControlService } from '../services/VersionControlService';
import { main } from '../main';

import {describe, expect, beforeAll, it, vitest} from 'vitest';
import {GitHubService} from "../implementations/GitHubService";

const GITHUB_OWNER = process.env.GITHUB_OWNER || 'felixAnhalt';
const GITHUB_REPO = process.env.GITHUB_REPO || 'pull-request-comment-resolver';
const GITHUB_PR_NUMBER = process.env.GITHUB_PR_NUMBER
    ? parseInt(process.env.GITHUB_PR_NUMBER, 10)
    : 1;

describe('GitLabService Integration', () => {
    let github: VersionControlService;

    beforeAll(async () => {
        github = new GitHubService();
    });

    it('fetches merge request details', async () => {
        await main()
    }, {
        timeout: 600 * 1000,
    });
});
