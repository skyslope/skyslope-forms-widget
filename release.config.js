module.exports = {
  branches: ['main'],
  plugins: [
    // Analyze commit messages to determine the next version
    '@semantic-release/commit-analyzer',
    // Generate release notes and changelog
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    // Create a GitHub release. The release token has contents access only, so
    // skip the issue and pull request comments and labels.
    ['@semantic-release/github', {
      successComment: false,
      failComment: false,
      releasedLabels: false
    }],
    // Publish to npm
    '@semantic-release/npm',
    // Commit updated changelog and package.json files back to the repository
    ['@semantic-release/git', {
      assets: ['package.json', 'CHANGELOG.md'],
      message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
    }]
  ]
};
