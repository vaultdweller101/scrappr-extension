# Scrappr for Google Docs

Scrappr for Google Docs is a browser extension that brings smart note-taking into your writing workflow. It allows you to save "ideas" or notes directly in your browser. As you write, you can get instant suggestions from your saved ideas, helping you connect concepts and find relevant information without leaving your document.

This extension uses a simple and reliable **clipboard-based approach**.

## How to Use

The extension is designed to be simple and intuitive. A typical workflow looks like this:

1. **Add a note by typing (desktop)**  
   - Click the Scrappr icon in your browser toolbar to open the popup.  
   - Click **New Idea**.  
   - Type your idea or note into the textarea and click **Save**.  
   - The note is stored in your Scrappr account (via Firebase), and will be available everywhere you use Scrappr.

2. **Add a note using your voice (desktop, in Google Docs)**  
   - Open a Google Doc (`https://docs.google.com/document/...`).  
   - Look for the small **“Voice note”** pill in the bottom-right corner of the page (injected by the extension’s content script).  
   - Click **Voice note** and grant microphone access when prompted.  
   - Speak your idea; when you’re done, click **Voice note** again to stop.  
   - The extension saves this transcript as a **pending voice note** in the background.  
   - Now open the Scrappr popup: you’ll see a banner like *“You have 1 voice note ready to import.”*  
   - Click **Use latest** to open a new note pre-filled with your transcript, then click **Save** to store it like any other note.

3. **Add a note using the mobile app**  
   - Open the Scrappr mobile app on your phone (signed in with the same account).  
   - Tap **New Idea** (or the equivalent add button).  
   - Type or dictate your note on mobile and save it.  
   - Because notes are stored in the same cloud account, this new mobile note will also be available to the extension when you open the Scrappr popup in your browser.

4. **See recommendations while writing**  
   - In your Google Doc, highlight some text and copy it (`Ctrl+C` / `Cmd+C` or `Cmd+C` on macOS).  
   - Click the Scrappr icon to open the popup.  
   - Scrappr reads the clipboard text and shows you **suggested ideas** from your saved notes that match what you’re writing.  
   - These suggestions can include notes you typed, notes imported from voice, and notes created on mobile.

5. **View all notes**  
   - In the popup, click **Show All Ideas**.  
   - This shows a grid of all your saved notes for your account, most recent first.  
   - Use this to browse or quickly scan everything you’ve captured across desktop and mobile.

6. **Delete a note**  
   - From **Show All Ideas**, find the note you want to remove.  
   - Click the delete button on that note and confirm the deletion.  
   - The note is removed from your Scrappr account in Firebase.

7. **Confirm it’s gone everywhere (including mobile)**  
   - Open the Scrappr mobile app and refresh your notes list.  
   - The deleted note will no longer appear there.  
   - Likewise, it will not be suggested by the browser extension anymore.

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