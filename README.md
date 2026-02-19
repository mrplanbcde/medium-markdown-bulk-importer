# Medium Markdown Bulk Importer (Chrome Extension)

Load multiple local `.md` files into a queue, select one article, copy the full Markdown, and paste manually into Medium quickly.

## Install (Developer Mode)

1. Download the extension ZIP from this repository Releases page.
2. Extract the ZIP to a local folder.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted extension folder.

## Use

1. Click the extension icon.
2. Choose one or more `.md` files.
3. Select an article in the list.
4. Click **Copy Selected**.
5. In a Medium draft, click the body and paste (`Cmd+V` on macOS, `Ctrl+V` on Windows/Linux).
6. Repeat with another article from the list.

## Queue Controls

- **Remove Selected**: remove one file from queue.
- **Clear All**: clear queue and load a new batch.
- Queue is saved in extension storage, so your list persists between popup opens.
