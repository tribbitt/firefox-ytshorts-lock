# YT Shorts Lock

Firefox extension that locks YouTube Shorts to a single short. Disables scroll, arrow keys, swipes, and next/previous navigation.

## Install (temporary)

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json`

## Install (permanent)

1. Make an Mozilla Addons account and get an API key
2. Install web-ext and use it to create a signed .xpi
3. Open it in Firefox

## Build

```
web-ext build
```

Output goes to `web-ext-artifacts/`.
