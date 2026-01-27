# DAX Language Syntax

_***my personal version**_

vscode extension to support syntax for DAX (Data Analysis Expressions) for Power BI. Treats DAX like a standalone language since .tmdl's are bad. Compatible with ```.dax``` file types

## Disclaimer
*This extension is just a simple parser. It is not a full LSP and it does not have model context. It is a personal project, so ongoing support may not be provided.*

## Features

- **Syntax Highlighting** - Color coding for DAX functions, keywords, operators, comments, and table/column references
- **Autocomplete** - IntelliSense with DAX functions, keywords, and your (document-scoped) tables, columns, measures
- **Hover Documentation** - View function descriptions, syntax, and return types on hover
- **Parameter Syntax** - Auto-insert function signatures with parameter placeholders
- **Snippets Library** - Auto-insert common DAX patterns from local library

## Usage
- Autocomplete functions and keywords while typing
- Press ```Shift+Enter``` after completing a function to insert parameters
- Type ```dax:``` to browse code snippets. Refer to ```src/dax.snippets.json``` in the repo for list of specialized patterns

In the extension settings, you can toggle "Show inline parameter hints"


## Resources
Official Microsoft Docs: https://learn.microsoft.com/en-us/dax/
<br>
DAX Guide: https://dax.guide/
<br>
SQLBI DAX Formatter: https://www.daxformatter.com/

