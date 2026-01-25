# DAX Language Support

**_*my personal version_**

vscode extension for DAX (Data Analysis Expressions) for Power BI with syntax highlighting, autocomplete, hover documentation, and pattern snippets. 

Supports ```.dax``` file types

## Features

- **Syntax Highlighting** - Color coding for DAX functions, keywords, operators, comments, and table/column references
- **Autocomplete** - IntelliSense with DAX functions and keywords
- **Hover Documentation** - View function descriptions, syntax, and return types on hover
- **Parameter Syntax** - Auto-insert function signatures with parameter placeholders
- **Snippets Library** - Auto-insert common DAX patterns from local library

## Usage
- Autocomplete functions and keywords while typing
- Press ```Shift+Enter``` after function autocomplete to insert parameters
- Type ```dax:``` to browse code snippets. Refer to ```src/dax.snippets.json``` in the repo for list of specialized patterns

In the extension settings, you can toggle Inline Parameter Hints

## Fair Warning
_This is a personal project. Features and functionality may change._
<br>
_Code snippets are intentionally minimal. Not meant to be an exhaustive list or full DAX cookbook._
<br>
_This extension is not an LSP or Parser. Language context not supported._


## Resources
Official Microsoft Docs: https://learn.microsoft.com/en-us/dax/
<br>
DAX Guide: https://dax.guide/
<br>
SQLBI DAX Formatter: https://www.daxformatter.com/

