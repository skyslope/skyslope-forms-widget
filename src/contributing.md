## Contributing

This project uses [stencil.js](https://stenciljs.com/), which is quite a nice compiler and framework for building web components.  

There are a couple gotchas when working with web components, especially when it comes to styling.  The [stencil docs](https://stenciljs.com/docs/styling) are a good place to start.

### Getting Started

1. Clone the repo
2. Run `npm install`
3. Run `npm start` to start the dev server
4. Run `npm test` to run the tests
5. Run `npm run lint:fix` to run the linter and fix any issues
6. Run `npm run build:integ`, `npm run build:staging`, or `npm run build:prod` to build the project for the different environments

### Releasing

We use semantic-release to automate version management and package publishing. The release process is triggered automatically when commits are pushed to the `main` branch.

#### How it works

1. Every commit to `main` triggers our release workflow
2. The process analyzes commit messages following the [Conventional Commits](https://www.conventionalcommits.org/) specification:
   - `feat:` triggers a MINOR version bump (e.g., 1.1.0 → 1.2.0)
   - `fix:` triggers a PATCH version bump (e.g., 1.1.1 → 1.1.2)
   - `BREAKING CHANGE:` in the commit body triggers a MAJOR version bump (e.g., 1.1.1 → 2.0.0)
3. After a successful release, a CI workflow automatically:
   - Builds the package
   - Publishes it to our CDN via Argo
   - Makes the new version available at `cdn.skyslope.com/widget/v{version}`

#### Commit Message Format


```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

To release a new version, just create a pull request to `main` with properly formatted commit messages. The pipeline will automatically:
1. Lint your commit messages
2. Determine the next version number
3. Create a new release
4. Publish the package

### Modifying netlify demo site

See https://bitbucket.org/skyslope/skyslope-widget-demo/