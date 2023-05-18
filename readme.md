# SkySlope Forms Widget  

The Skyslope Forms Widget is a tool that lets users embed Skyslope forms into their own web applications, providing easy access to SkySlope's real estate transaction management features. It is available as a JavaScript library and can be integrated into a variety of web applications.

Demo Site: https://skyslope-widget-demo.netlify.app/

## Implementation

_Before starting: Please contact SkySlope Engineering to whitelist your site for framing. If using SSO, please contact SkySlope engineering to configure SSO for your company._

To implement the SkySlope Forms Widget using npm, follow these steps:

### Installation with npm
Install the package using npm:
```bash
npm i @skyslope/forms-widget
````
Or with Yarn:
```bash
yarn add @skyslope/forms-widget
````

In your index.js (or a similar entry file), import or require the @skyslope/forms-widget package and initialize the widget:
```javascript
// ES6 import
import '@skyslope/forms-widget';

// CommonJS require
require('@skyslope/forms-widget');

// Initialize the widget
const init = () => window.skyslope.widget.initialize({
  idp: 'myIDP' // the idp for SSO, if using
})
window.skyslope?.widget ? init() : window.skyslope = { onLoad: () => init() };
```

### Installation with CDN

To implement the SkySlope Forms Widget without usage of npm or yarn, add the following script tags to your index.html:

```javascript
<script type="module" src="https://cdn.skyslope.com/skyslope-forms-widget/latest/skyslope-forms-widget/skyslope-forms-widget.esm.js"></script>  
<script nomodule src="https://cdn.skyslope.com/skyslope-forms-widget/latest/esm/skyslope-forms-widgetcomponents.js"></script>
```

Then, in your app or in your index.html, add the following script:  
```javascript
<script>
  const init = () => window.skyslope.widget.initialize({
    idp: 'myIDP' // the idp for SSO, if using
  })
  window.skyslope?.widget ? init() : window.skyslope = { onLoad: () => init() };
</script>
```

### Version-based implementation with CDN
If you would like to use a specific version of the widget, you can specify the version in the script tag. For example:
```javascript
<script type="module" src="https://cdn.skyslope.com/skyslope-forms-widget/{version-from-package.json}/skyslope-forms-widget/skyslope-forms-widget.esm.js"></script>  
<script nomodule src="https://cdn.skyslope.com/skyslope-forms-widget/latest/{version-from-package.json}/skyslope-forms-widgetcomponents.js"></script>
```

### Non SSO Implementation
If you are not using SSO, you can initialize the widget without an IDP:
```javascript
<script>
  const init = () => window.skyslope.widget.initialize();
  window.skyslope?.widget ? init() : window.skyslope = { onLoad: () => init() };
</script>
```

## Usage with Modal

The modal is configurable through the openModal function. For example:
```javascript
window.skyslope.widget.openModal();
``` 
or with arguments, as shown below:
```javascript
window.skyslope.widget.openModal({
  open: true,
  roundedEdges: true,
  shouldConstrainMaxWidth: true,
  showHeaderButtons: true,
  showOverlay: true,
  styleOverrides: {
    modalWrapper: {
      backgroundColor: 'black',
      color: 'white',
    },
    modalHeader: {},
    modalOverlay: {},
    modalContent: {},
    maxWidthContainer: {},
  },
});
```

## Custom Usage with Inline Container
If you do not want to open a modal in your app and would instead like to customize the placement of the widget, follow the instructions below:

To use the inline component instead of the openModal() function, you will need to add the following ss-container-inline web component to your HTML:
```html
<ss-container-inline style="height: 1000px; /*... add any other styling here*/"/>
```

Add the `openInline: true` option to the initialize() function, as shown below:

```javascript
const init = () => window.skyslope.widget.initialize({
  idp: 'myIdp', // the idp for SSO
  openInline: true
})
```

This will display the Skyslope Forms widget within your application, without opening a modal.

Additionally, all navigation and refresh functions work as expected.

## Pre-made buttons
There are four pre-made button web components that you can use to interact with the Skyslope Forms widget:  
By using these pre-made buttons, you can easily integrate Skyslope Forms functionality into your application without having to build your own UI components.

- `<ss-button-create-listing>`: Opens the "Create Listing" page when clicked.
- `<ss-button-write-offer>`: Opens the "Create Transaction" page when clicked.
- `<ss-button-browse-libraries>`: Opens the "Browse Libraries" page when clicked.
- `<ss-button-view-all-files>`: Opens the "View All Files" page when clicked.

To use these buttons, you can add them anywhere in your HTML like so:
```javascript
<ss-button-create-listing id="create-listing-btn">Write a Listing</ss-button-create-listing>
<ss-button-write-offer id="write-offer-btn">Write an Offer</ss-button-write-offer>
<ss-button-browse-libraries id="browse-libraries-btn">Browse Libraries</ss-button-browse-libraries>
<ss-button-view-all-files id="view-all-files-btn">View All Files</ss-button-view-all-files>
```

### Unstyled Prop
The unstyled prop is an optional prop that can be passed to the button web components. When this prop is set to true, the button will be rendered without any default styles applied. This allows developers to fully customize the appearance of the button using their own CSS styles.

For example, to create a custom styled ss-button-create-listing component, you could define the following CSS rules:
```css
.custom-button {
  background-color: blue;
  color: white;
  border-radius: 5px;
  padding: 10px;
  font-size: 16px;
}

.custom-button:hover {
  background-color: darkblue;
}
```

Then, in your HTML, you can use the ss-button-create-listing component with the unstyled prop set to true and the class attribute set to custom-button:
```
<ss-button-create-listing id="create-listing-btn" unstyled="true" class="custom-button">Write a Listing</ss-button-create-listing>
```
This will render a blue button with white text and rounded corners, with the custom styles applied. When the button is hovered over, it will turn dark blue.

## API for custom implementations 
The SkySlope Forms Widget provides the following API on the `window.skyslope.widget` object.  
All of these functions are used internally by the web-components and are exposed for use in custom implementations.

- `openModal`: opens a modal with SkySlope Forms loaded inside an iframe. This injects a modal [web component](https://developer.mozilla.org/en-US/docs/Web/Web_Components) into the body of the page.
- `closeModal`: closes the modal.
- `reload`: reloads the iframe.
- `navigateTo(path: string)`: navigates to a different path within the Forms app.
- `navigateToCreateTransaction`: navigates to the Create Transaction page.
- `navigateToCreateListing`: navigates to the Create Listing page.
- `navigateToBrowseLibraries`: navigates to the Browse Libraries page.
- `navigateToViewAllFiles`: navigates to the View All Files page.


