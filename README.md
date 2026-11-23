# Wikipedia for LearnHarness

Enable **Wikipedia** in the paperclip menu before sending a message. LearnHarness’s configured **Cheap** model turns your request into search phrases. The plugin looks up relevant English Wikipedia articles and attaches their plain text as regular local Markdown files. The tutor can read them alongside files you attach yourself.

## Install

1. Open **Settings → Community plugins** in LearnHarness desktop 0.7.0 and find the plugins directory.
2. Download `learnharness-wikipedia.zip` from the [latest release](https://github.com/GGabrielDev/learnharness-wikipedia/releases/latest) and extract it into that directory. Check that the manifest is at `plugins/learnharness-wikipedia/dist/manifest.json`.
3. Refresh the plugin list and enable **Wikipedia**. Restart LearnHarness when updating an already-loaded version. Preserve the plugin’s `data/` directory when updating.

Or build from source with Node.js 22 or later:

```sh
git clone https://github.com/GGabrielDev/learnharness-wikipedia.git "<plugins-directory>/learnharness-wikipedia"
cd "<plugins-directory>/learnharness-wikipedia"
npm ci
npm run build
```

## Use

- In a new-session or free-text composer, click **Attach files → Wikipedia…**. In the dialog, turn on **Enable Wikipedia**. The paperclip highlight indicates it’s armed for the next message.
- **Minimum searches** and **Maximum searches** control how many distinct phrases the model plans (default **1–3**, configurable up to **10**). **Articles per search** controls how many different pages to pull for each phrase (default **1**, configurable up to **5**). Duplicate pages are skipped and the next-ranked match is tried; fewer usable articles may be available.
- **Deconstruct files** is on by default. Each article’s introduction and main sections become separate Markdown files, with subsections kept inside their parent file. Turn it off for one file per article. The dialog remembers these three preferences locally; the enable switch is still per message.
- Send your request as usual. The option resets after LearnHarness accepts the message. If lookup fails, the draft is kept: retry, or turn Wikipedia off and send without it. The option doesn’t run for quiz answers or other structured inputs.
- **There is no plugin-imposed article size limit.** The plugin saves the whole plain-text extract returned by Wikipedia, not just the introduction. The API’s extract does not include every rendered element (such as images or some tables). LearnHarness may read a large attachment in multiple chunks, just as with any other file.
- Files are saved in the plugin's `data/sources/` subdirectory so existing sessions can still refer to them. If you have enabled restricted **File access** in LearnHarness, allow that folder; the plugin does not bypass the native file policy. Deleting those files breaks old references.

## Network, privacy, and compatibility

- Wikipedia lookup is public and needs no Wikimedia account or API key. The model planning call uses your LearnHarness provider and can incur normal model costs. It receives the draft text with native quoted file paths removed, not the contents of existing attachments. Wikipedia receives the generated search phrases. Avoid enabling it for sensitive requests.
- Search uses the [MediaWiki Action API search generator](https://www.mediawiki.org/wiki/API:Search) at `https://en.wikipedia.org/w/api.php`. It skips disambiguation pages and fetches each chosen page separately using [`prop=extracts`](https://www.mediawiki.org/wiki/Extension:TextExtracts) with `explaintext`, without `exintro`, `exchars`, or `exsentences`. Each file keeps article and available revision links and a license notice.
- LearnHarness 0.7.0 has no public paperclip menu extension point. The plugin uses a small compatibility adapter for the stock **desktop** paperclip menu and new-session handoff, and the public submission and backend APIs for the rest. If an app update changes the menu, the option may disappear until the adapter is updated. Browser-only LearnHarness, where the stock paperclip is disabled, is not supported by this release.

## Develop

Run `npm ci`, `npm test` and `npm run build`. The package has no runtime npm dependencies. Distribute the `learnharness-wikipedia/dist/` layout, not `data/` or `node_modules/`.

Plugin code: [AGPL-3.0-only](LICENSE). Article text: [Wikipedia’s content terms](https://en.wikipedia.org/wiki/Wikipedia:Copyrights).
