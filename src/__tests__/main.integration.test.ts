import { main } from '../main';

import {describe, it} from 'vitest';

describe('GitLabService Integration', () => {

    it('fetches merge request details', async () => {
        await main()
    }, {
        timeout: 600 * 1000,
    });
});
