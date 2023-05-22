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

If you are a SkySlope engineer, you'll be able to access our release pipeline in CF.
To release a new version, just bump the version in `package.json` and create a pull request to `main`.  The pipeline will take care of the rest. 

### Modifying netlify demo site

The netlify site is a static site that is built from the `www` folder. It is purposefully on a separate domain as `skyslope.com` to prove cross domain framing works.  The site is hosted on netlify and is automatically built and deployed when changes are pushed to the `main` branch.
The build configuration is located in `netlify.toml` and can be modified as needed to change the deployed environment or build process.