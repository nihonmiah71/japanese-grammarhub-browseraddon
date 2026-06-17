# Japanese Grammar Analysis Add-on

A powerful, serverless Chrome extension designed to seamlessly integrate Japanese grammar reading practice with Anki. It analyzes webpages for JLPT grammar patterns using advanced regular expressions, highlights them in context, provides comprehensive statistics, and allows you to mine sentences directly into your Anki decks.

---

## Disclaimer

The python scripts will probably not run on your system unless you installed all the right packages, some of them might only be supported for older pyhton versions (Python 3.12), debug with AI and install the required packages as needed.

---

## 🚀 Features

### 🔍 In-Page Grammar Analysis

* **Context Menu Activation:** Right-click on any webpage or text selection and choose "Start Japanese Grammar Analysis" to run the parser.
* **Smart Regex Parsing:** Highlights recognized grammar patterns directly within the text using optimized regular expressions.
* **Interactive Highlights:** Hover over matched grammar points to see subtle highlights, and click them to open a detailed, draggable information modal.

### 🎛️ Comprehensive Options Dashboard

* **JLPT Level Filtering:** View and toggle active grammar points categorized by JLPT levels (N5 to N1).
* **Tag-Based Filtering:** Enable or disable grammar search patterns based on custom tags.
* **Contrast Grammars Mode:** Select multiple grammar points and open a specialized "Contrast View" in a new window to compare their constructions, examples, and rules side-by-side in a clean grid layout.

### 🟢 Anki Mining Hub (The Green Bubble)

* **Floating Hub:** A draggable green hub that tracks your mined sentences. Click to expand into a full workspace. (Note might load for a while for the first opening/You might have to click a certain point of the green square)
* **1-Click Sentence Mining:** Click the "+ Anki" button inside any grammar popup to instantly capture the target word, the surrounding sentence context, and the grammar definition.
* **Dual Tab Interface:**
* **Individual Cards:** View and edit single mined sentences, complete with frequency, English definitions, and Japanese notes.
* **Grammar Updates:** View aggregated sentences grouped by their Note ID (NID).


* **TSV Export:** Export your collected data with a single click to import them directly into Anki.

### 🟡 Grammar Stats & Navigation (The Yellow Bubble)

* **Page Statistics:** A draggable yellow hub that provides an analytical breakdown of the grammar found on the current page.
* **Frequency Tab:** Lists the most frequently used grammar points on the page.
* **Chronological Tab:** Displays grammar points in the exact order they appear in the text.
* **Sorted Tab:** Groups occurrences by grammar point for easy review.
* **Jump Links:** Click any match in the stats table to smoothly scroll to its exact location on the webpage.

---

## 🔄 Anki Integration & Workflow

This extension is built to work in tandem with a specific Anki setup, utilizing two distinct note types: `miningsimple` (for your mining deck) and `grammar` (for your overarching grammar database).

### Prerequisites

To use the complete workflow, you will need the following installed in Anki:

* The **Fields Extract Inject** Anki add-on.
* Your custom **Grammarminer** Anki add-on.

### 📖 1. Daily Mining Workflow

When you are reading Japanese content online and want to mine example sentences:

1. Right-click the page and select **Start Japanese Grammar Analysis**.
2. Click on highlighted grammar points to read the explanations.
3. Click **+ Anki** in the popup to add the sentence to your Mining Hub.
4. Open the green **Anki Mining Hub** on the page and click **Export TSV**.
5. Import this TSV file into Anki using your **Grammarminer** add-on.
* *Note: The Grammarminer add-on will automatically create individual Anki cards (`miningsimple`) for the mined sentences. It will also link these sentences back to the base grammar card (`grammar`), ensuring the base card serves as a master database containing all sentences ever mined for that specific pattern.*



### 🛠️ 2. Updating the Grammar Database

When you modify tags, adjust regex patterns, or add new grammar rules to your `grammar` note type in Anki, you must sync these changes with the browser extension:

1. Open the Anki Browser and search for `deck:grammar` to select all grammar cards.
2. Activate the **Fields Extract Inject** add-on and choose **Extract**.
3. Select all fields **except** the "mined sentences" field.
4. Export the data in **HTML format**.
* *Crucial: Ensure you create a column for NIDs (Note IDs) when prompted, and include all tags in the export.*


5. Save the exported table in the browser extension's root folder, overwriting the existing `simplegrammarregex_fixed.tsv` file.
6. Open your terminal or command prompt (cmd) in the extension's root directory and run the Python preparation script:
```bash
python prepare_data.py

```


7. Delete the old JSON files currently located in the `data/` folder of the extension.
8. Move the newly generated `grammar_data.json` and `patterns_data.json` files into the `data/` folder.
9. Open Chrome, navigate to `chrome://extensions/`, and reload the add-on to apply the latest database.

---

## 📥 Installation

1. Clone or download this repository to your local machine.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the folder containing the extension files.
5. Configure your grammar database following the workflow steps above.
