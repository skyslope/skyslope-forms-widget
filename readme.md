# SkySlope Forms Widget

The SkySlope Forms Widget is a tool that lets users embed SkySlope forms into their own web applications, providing easy access to SkySlope's real estate transaction management features. It is available as a JavaScript library and can be integrated into a variety of web applications.  
Internally, the widget is built using [StencilJS](https://stenciljs.com/), a web component compiler. The widget injects an iframe into the DOM of the host application, which loads the SkySlope Forms application. The widget then communicates with the iframe to provide a seamless user experience.

Demo Site: <https://skyslope-widget-demo.netlify.app/>
<br/>
Github: <https://github.com/skyslope/skyslope-forms-widget/>

## Implementation

_Before starting: Please contact SkySlope Engineering to whitelist your site for framing. If using SSO, please contact SkySlope engineering to configure SSO for your company._

To implement the SkySlope Forms Widget using npm, follow these steps:

### Installation with npm

Install the package using npm:

```bash
npm i @skyslope/forms-widget
```

Or with Yarn:

```bash
yarn add @skyslope/forms-widget
```

In your index.js (or a similar entry file), import or require the @skyslope/forms-widget package and initialize the widget:

```javascript
// ES6 import
import { defineCustomElements } from '@skyslope/forms-widget/loader/';

// CommonJS require
const { defineCustomElements } = require('@skyslope/forms-widget/loader/');

// Define all custom elements on the custom elements registry
defineCustomElements();

// Initialize the widget
const init = () =>
  window.skyslope.widget.initialize({
    idp: 'myIDP', // the idp for SSO, if using
  });
window.skyslope?.widget ? init() : (window.skyslope = { onLoad: () => init() });
```

Web components from the @skyslope/forms-widget package can now be used in your application. For example:

```html
<ss-button-create-listing id="create-listing-btn">Write a Listing</ss-button-create-listing>
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

Web components from the @skyslope/forms-widget package can now be used in your application. For example:

```html
<ss-button-create-listing id="create-listing-btn">Write a Listing</ss-button-create-listing>
```

#### Implementing a specific version of the widget via CDN

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

A pre-made modal is available for use with the widget. To open the modal, call the openModal function:

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

First, add the `openInline: true` option to the initialize() function, as shown below:

```javascript
const init = () =>
  window.skyslope.widget.initialize({
    openInline: true,
  });
```

This parameter will instruct the widget to avoid opening a modal and instead render the widget inline. You can also optionally pass the `headerVariant: 'focused'` parameter, which controls hiding navigation & settings elements in the header of any `file-details` page in Forms and the Build UI in DigiSign:

```javascript
const init = () =>
  window.skyslope.widget.initialize({
    openInline: true,
    headerVariant: 'focused',
  });
```

Next, you will need to add the following ss-container-inline web component to your HTML or JSX:

```html
<ss-container-inline style="height: 1000px; /*... add any other styling here*/" />
```

The widget will be rendered inside the ss-container-inline web component. The ss-container-inline web component can be styled as desired.

To interact programmatically with the ss-container-inline component, see [API for custom implementations](#api-for-custom-implementations).

## Pre-made buttons

There are pre-made button web components that you can use to interact with the Forms widget:

```javascript
<ss-button-create-listing>
<ss-button-write-offer>
<ss-button-start-buyer-agreement>
<ss-button-browse-libraries>
<ss-button-view-all-files>
```

</br>
By using these pre-made buttons, you can easily integrate SkySlope Forms functionality into your application without having to build your own UI components.
</br>
</br>

- `<ss-button-create-listing>` opens the "Create Listing" page when clicked.
- `<ss-button-write-offer>` opens the "Create Transaction" page when clicked.
- `<ss-button-start-buyer-agreement>` Starts a Buyer Agreement.
- `<ss-button-browse-libraries>` opens the "Browse Libraries" page when clicked.
- `<ss-button-view-all-files>` opens the "View All Files" page when clicked.

</br>

To use these buttons, you can add them anywhere in your HTML like so:

```javascript
<ss-button-create-listing id="create-listing-btn">Write a Listing</ss-button-create-listing>
<ss-button-write-offer id="write-offer-btn">Write an Offer</ss-button-write-offer>
<ss-button-start-buyer-agreement id="create-buyer-agreement">Buyer Agreement</ss-button-start-buyer-agreement>
<ss-button-browse-libraries id="browse-libraries-btn">Browse Libraries</ss-button-browse-libraries>
<ss-button-view-all-files id="view-all-files-btn">View All Files</ss-button-view-all-files>
```

<!--
<div style="margin-top: 16px">
    <div class="cards-solo">
        <div class="card">
            <div class="cards">
                <ss-button-create-listing>Write a Listing</ss-button-create-listing>
                <ss-button-write-offer>Write an Offer</ss-button-write-offer>
                <ss-button-start-buyer-agreement>Buyer Agreement</ss-button-start-buyer-agreement>
                <ss-button-browse-libraries>Browse Libraries</ss-button-browse-libraries>
                <ss-button-view-all-files>View All Files</ss-button-view-all-files>
            </div>
        </div>
    </div>
</div>
-->

You can also customize the way the modal is displayed by adding a custom function and assigning one of the three available props:

- `roundedEdges: false`
- `showOverlay: false`
- `showHeaderButtons: false`

<!--
<div style="margin-top: 16px">
    <div class="cards-solo">
        <div class="card">
            <div class="cards">
                <button id="square">Square Edges</button>
                <button id="backdrop" onclick="openNoBD()">No Backdrop</button>
                <button id="custom-close" onclick="openCustomClose()">Custom Close button</button>
                <button id="position-manually" onclick="openPositioned()">Positioned Manually</button>
            </div>
        </div>
    </div>
</div>
-->

```javascript
function openSquare() {
  window.skyslope.widget.openModal({
    roundedEdges: false,
  });
}
```

For the fourth option, you can add all three and include an override for the modal style to position it manually:

```javascript
window.skyslope.widget.openModal({
  roundedEdges: false,
  showHeaderButtons: false,
  showOverlay: false,
  styleOverrides: {
    modalWrapper: {
      top: '70px',
      left: '300px',
      right: 0,
      bottom: 0,
      zIndex: 9,
    },
    modalHeader: {},
    modalOverlay: {},
    modalContent: {
      boxShadow: 'none',
      margin: 0,
      height: '100%',
      width: 'calc(100%-300px)',
      border: '1px solid #e1e7f1',
    },
    maxWidthContainer: {
      maxWidth: '100%',
    },
  },
});
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

</br>

Then, in your HTML, you can use the ss-button-create-listing component with the unstyled prop set to true and the class attribute set to custom-button:

```html
<ss-button-create-listing id="create-listing-btn" unstyled="true" class="custom-button"> Write a Listing </ss-button-create-listing>
```

</br>

This will render a blue button with white text and rounded corners, with the custom styles applied. When the button is hovered over, it will turn dark blue.

<!--
<div class="cards-solo">
    <div class="card card-solo">
        <ss-button-create-listing unstyled="true" class="button1">Write a Listing</ss-button-create-listing>
        <ss-button-write-offer unstyled="true" class="button2">Offer Time!</ss-button-write-offer>
        <ss-button-view-all-files unstyled="true" class="custom-button">SkySlope Forms</ss-button-view-all-files>
    </div>
</div>
-->

## Pre-made widget

Additionally, if you would like to skip the custom styling and would just like a quick all-in-one solution, we have a pre-made widget available to use.

To use the widget, you can add it anywhere in your HTML like so:

```html
<ss-contained-widget class="contained-widget" />
```

</br>

This will result in the contained widget being rendered:

<!--
<div class="cards-solo">
    <div class="card">
        <ss-contained-widget class="contained-widget" />
    </div>
</div>
-->

## Support for browsers with third-party cookies disabled

Some browsers block the cookies the embedded Forms app normally uses to sign the user in. Safari
does this by default, as do Chrome incognito and Firefox strict mode. In these browsers the user
sees a "third-party cookies are disabled" message instead of Forms.

To support them, pass a `getToken` callback that returns a SkySlope access token for the signed-in
user. It may return the token or a promise of it, and should return `null` when there is no
signed-in user. The widget calls it only when it needs a token, so browsers where the normal
sign-in works never call it.

```javascript
window.skyslope.widget.initialize({
  // Return a SkySlope access token for the currently signed-in user, or null.
  getToken: async () => await myApp.getSkySlopeAccessToken(),
});
```

What `getToken` should do:

- Answer within 30 seconds.
- Return a token that is valid for at least the next 5 minutes. A cached token is fine while it
  has that much life left.
- Expect to be called more than once. The widget keeps the session signed in on its own, including
  inside the DigiSign envelope builder, and asks for a new token when it needs one.

When you get a new token for the same user before the old one expires, you can call
`await window.skyslope.widget.refreshToken()` to hand it over right away. To sign out or switch
users, call `clearToken()` (see below).

No new Content-Security-Policy or Referrer-Policy settings are needed on your page.

### Signing out or switching users

The Forms session can outlast your own sign-out, even across a reload of your page. On sign-out or
a user switch, call `await window.skyslope.widget.clearToken()` while the widget is still mounted.
It ends the Forms session and reloads Forms without the old user.

Order matters: sign the user out of your app (or switch to the new user) first, so that
`getToken` returns `null` (or the new user's token) by the time you call `clearToken()`. If it
still returns the old user's token, that user is signed straight back in. After a sign-out the
widget raises an `authError` (`iframe-auth-failed`), which you can ignore.

```javascript
async function signOut() {
  await myApp.signOut(); // from here getToken returns null
  await window.skyslope.widget.clearToken(); // the widget must still be mounted
  myApp.showSignedOutPage();
}
```

### Call `initialize()` before each open

When the widget's container leaves the page (including when `closeModal()` closes the modal),
every `initialize()` setting, `getToken` included, is dropped. Call `initialize()` again before
each `openModal()` and each time you add `ss-container-inline` to the page, and always go through
`window.skyslope.widget` rather than a saved reference. Without this, users in browsers with
third-party cookies disabled cannot sign in on the second open while other browsers work, so test
a second open in Safari.

```javascript
function openForms() {
  window.skyslope.widget.initialize({ getToken: myApp.getSkySlopeAccessToken });
  window.skyslope.widget.openModal();
}
```

### The `authError` event

When sign-in cannot be established or kept, `ss-container-inline` emits an `authError` event. It
bubbles out of `ss-container-modal`, so you can listen on either element (in typed JSX,
`onAuthError` is declared on `ss-container-inline`). `event.detail.reason` is one of:

- `token-callback-failed`: `getToken` threw or did not answer within 30 seconds. The error is in
  `event.detail.error`. If this happened while signing in, `iframe-auth-failed` follows.
- `iframe-auth-failed`: Forms or DigiSign could not sign the user in, for example because
  `getToken` returned `null` or is not configured.
- `token-renewal-failed`: the widget could not get a new token to keep the session signed in. The
  current session keeps working until it expires.
- `signed-out`: the user signed out inside Forms or DigiSign. The widget has stopped renewing; sign
  the user out of your app or close the widget.

```javascript
document.querySelector('ss-container-modal')
  .addEventListener('authError', event => {
    console.warn('Forms widget auth failed:', event.detail.reason);
  });
```

## API for custom implementations

The SkySlope Forms Widget provides the following API on the `window.skyslope.widget` object.  
All of these functions are used internally by the web-components and are exposed for use in custom implementations.

- `openModal` opens a modal with SkySlope Forms loaded inside an iframe. This injects a modal [web component](https://developer.mozilla.org/en-US/docs/Web/Web_Components) into the body of the page.
- `closeModal` closes the modal.
- `reload` reloads the widgets internal iframe.
- `refreshToken()` renews a token session at once. See [Support for browsers with third-party cookies disabled](#support-for-browsers-with-third-party-cookies-disabled).
- `clearToken()` drops the token session on sign-out or a user switch. See [Signing out or switching users](#signing-out-or-switching-users).
- `navigateTo(path: string)` navigates to a different path within the Forms app.
- `navigateToCreateTransaction` navigates to the Create Transaction page. Returns newly created ID for data fetching. See section on [Listening for Events](#listening-for-events).
- `navigateToCreateListing` navigates to the Create Listing page. Returns newly created ID for data fetching. See section on [Listening for Events](#listening-for-events).
- `navigateToStartBuyerAgreement`: navigates to start buyer agreement page.
- `navigateToBrowseLibraries` navigates to the Browse Libraries page.
- `navigateToViewAllFiles` navigates to the View All Files page.
- `navigateToEnvelope(envelopeId: integer)` navigates to the Envelope Bulk Fill page.

---

### Example Usage

This query parameter can be applied to the following routes in each respective application:

#### Forms

```html
https://forms.skyslope.com/file-details/{fileId}/{route}?headerVariant=focused
```

#### DigiSign

```html
https://send.skyslope.com/envelopes/{envelopeId}?headerVariant=focused
```

## Listening for Events

Depending on the function selected, the SkySlope Forms Widget can post a message containing information relevant to further data querying. For example, after calling `navigateToCreateTransaction`:

```typescript
interface SkySlopeMessage {
  status:
    | 'forms-onboarding-complete'
    | 'forms-user-ready'
    | 'forms-create-file' // metadata.fileId
    | 'forms-download-document'; // metadata.formsDocumentIds
  metadata?: {
    fileId?: number;
    formsDocumentIds?: number[];
  };
}

// event.origin includes the scheme, so compare against the full origin.
const FORMS_ORIGIN = 'https://forms.skyslope.com';

window.addEventListener('message', event => {
  // Ignore messages from other sites
  if (event.origin !== FORMS_ORIGIN) return;
  // Ignore windows that are not framed directly in this page, such as a tab or popup this page opened
  const source = event.source;
  if (!source || !('parent' in source) || source.parent !== window) return;
  // Widget messages are JSON strings. Forms also sends some plain-text messages meant for other
  // SkySlope apps; skip those.
  if (typeof event.data !== 'string') return;
  let data;
  try {
    data = JSON.parse(event.data);
  } catch {
    return;
  }
  const { status, metadata } = data ?? {};

  if (status === 'forms-create-file') {
    console.log(metadata?.fileId); // ID of the newly created transaction or listing, eg. 123
  }
});
```

Ignore any status you don't handle. The widget uses some messages for its own sign-in, and new
statuses may be added.

The listener above uses the production origin. For testing in other SkySlope environments, use
`https://integ-forms.skyslope.com` or `https://staging-forms.skyslope.com`.
