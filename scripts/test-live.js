// Runs the website smoke tests against the deployed site: `npm run test:live [url]`.
import { spawnSync } from 'node:child_process';

const url = process.argv[2] ?? 'https://nexus-arcade-os.onrender.com';
const result = spawnSync('npx', ['playwright', 'test', '--project=web', '--project=web-mobile'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXUS_BASE_URL: url },
});
process.exit(result.status ?? 1);
