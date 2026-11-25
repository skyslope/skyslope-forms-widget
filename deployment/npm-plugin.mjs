import { execFileSync } from 'node:child_process';

const registry = 'https://registry.npmjs.org';

function npm(args, { cwd, env }) {
  execFileSync('npm', [...args, '--registry', registry], { cwd, env, stdio: 'inherit' });
}

export function verifyConditions(_config, context) {
  npm(['whoami'], context);
}

export function prepare(_config, context) {
  npm(['version', context.nextRelease.version, '--no-git-tag-version'], context);
}

export function publish(_config, context) {
  npm(['publish', '--tag', 'latest'], context);
  return { name: 'npm package', url: 'https://www.npmjs.com/package/@skyslope/forms-widget' };
}
