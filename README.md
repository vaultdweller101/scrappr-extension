# Scrappr for Google Docs

Scrappr for Google Docs is a browser extension that brings smart note-taking into your writing workflow. It allows you to save "ideas" or notes directly in your browser. As you write, you can get instant suggestions from your saved ideas, helping you connect concepts and find relevant information without leaving your document.

This extension uses a simple and reliable **clipboard-based approach**.

## How to Use

The extension is designed to be simple and intuitive.

1.  While writing in a Google Doc, highlight a word or sentence.
2.  Copy the text to your clipboard (`Ctrl+C` or `Cmd+C`).
3.  Click the Scrappr icon (the trash can) in your browser toolbar.
4.  The popup will open with the instruction: "Highlight and copy the text, then open this extension, to see ideas suggestion."
5.  The extension automatically reads your clipboard and shows you a list of relevant suggestions from your saved ideas.
6.  You can also click "Show All Ideas" to manage your full list, or "New Idea" to save a new one.

## Features

  * **Persistent Idea Storage:** Save your notes and ideas directly in the browser. All ideas are saved to local extension storage (`browser.storage.local`) and persist across sessions.
  * **Clipboard-Powered Suggestions:** Reliably get suggestions by reading from the clipboard (`navigator.clipboard.readText`). This requires the `clipboardRead` permission.
  * **Multiple Views:** Instantly toggle between "Suggestions" and "Show All Ideas".
  * **Modern Tech Stack:** Built with React, TypeScript, and bundled with Vite.
  * **Cross-Browser Ready:** Uses the `webextension-polyfill` for compatibility with both Chrome and Firefox.

## Future Roadmap

The current version of Scrappr saves all your ideas to your browser's local storage. The next major goal is to implement cloud-based syncing.

* **Google Authentication:** Integrate Google Sign-In to allow users to connect their Google accounts.
* **Cloud Storage & Sync:** Store all ideas in a cloud database (like Firebase) linked to the user's account. This will automatically sync all saved ideas across different browsers and devices.

## Setup and Building (for Developers)

To run this project locally, you need to build it from the source.

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/vaultdweller101/scrappr-extension.git
    cd scrappr-extension
    ```
2.  **Install dependencies:**
    ```sh
    npm install
    ```
3.  **Build the extension:**
    ```sh
    npm run build
    ```
    This will create a `dist` directory in the project root. This `dist` folder is your complete, loadable extension.

## How to Load in Chrome

1.  Open Chrome and navigate to `chrome://extensions`.
2.  In the top-right corner, turn on the **Developer mode** toggle.
3.  A new menu will appear on the top-left. Click the **Load unpacked** button.
4.  A file dialog will open. Navigate to this project's folder and select the **`dist`** directory.
5.  The "Scrappr for Google Docs" extension will appear in your list.
6.  (Optional) Click the puzzle piece icon in your Chrome toolbar and click the pin icon next to Scrappr to keep it visible.

### Loading in Firefox (Optional)

1. Open Firefox and navigate to about:debugging#/runtime/this-firefox.
2. Click Load Temporary Add-on...
3. Navigate to the dist folder and select the manifest.json file