import semanticRelease, { getLogger, resolveConfig, resolveEnvCi } from '@semantic-release/core';

if (import.meta.main) {
  const { stdout, stderr } = process;
  const cwd = process.cwd();
  const env = { ...process.env };
  const envCi = resolveEnvCi({ cwd, env });

  if (!envCi.isCi || envCi.isPr || envCi.branch !== 'main') {
    throw new Error('Run the release from CI on main.');
  }

  const context = { cwd, env, envCi, stdout, stderr, logger: getLogger({ stdout, stderr }) };
  const { options, plugins } = await resolveConfig(context, {}, { buildPlugins: true });
  await semanticRelease({ context: { ...context, options }, plugins });
}
