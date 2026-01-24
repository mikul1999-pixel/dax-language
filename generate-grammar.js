const fs = require('fs');
const path = require('path');

// Load DAX functions
const daxFunctions = require('./src/dax.functions.json');
const daxKeywords = require('./src/dax.keywords.json');

// Group functions by category
const functionsByGroup = daxFunctions.reduce((acc, fn) => {
  const group = fn.group || 'Other';
  if (!acc[group]) acc[group] = [];
  acc[group].push(fn.name);
  return acc;
}, {});

// Create grammar patterns for each group
const functionPatterns = Object.entries(functionsByGroup).map(([group, names]) => ({
  name: "support.function." + group.toLowerCase().replace(/\s+/g, '-') + ".dax",
  match: "\\b(" + names.join('|') + ")\\b"
}));

// Keywords
const keywords = daxKeywords.map(k => k.name);

// Build the grammar
const grammar = {
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "DAX",
  "scopeName": "source.dax",
  "patterns": [
    { "include": "#comments" },
    { "include": "#strings" },
    { "include": "#numbers" },
    { "include": "#keywords" },
    { "include": "#functions" },
    { "include": "#operators" },
    { "include": "#constants" },
    { "include": "#table-column-references" }
  ],
  "repository": {
    "comments": {
      "patterns": [
        {
          "name": "comment.line.double-slash.dax",
          "match": "//.*$"
        },
        {
          "name": "comment.line.double-dash.dax",
          "match": "--.*$"
        },
        {
          "name": "comment.block.dax",
          "begin": "/\\*",
          "end": "\\*/"
        }
      ]
    },
    "strings": {
      "patterns": [
        {
          "name": "string.quoted.double.dax",
          "begin": "\"",
          "end": "\"",
          "patterns": [
            {
              "name": "constant.character.escape.dax",
              "match": "\\\\."
            }
          ]
        }
      ]
    },
    "numbers": {
      "patterns": [
        {
          "name": "constant.numeric.dax",
          "match": "\\b\\d+(\\.\\d+)?([eE][+-]?\\d+)?\\b"
        }
      ]
    },
    "keywords": {
      "patterns": [
        {
          "name": "keyword.control.dax",
          "match": "\\b(" + keywords.join('|') + ")\\b"
        },
        {
          "name": "keyword.operator.logical.dax",
          "match": "\\b(AND|OR|NOT|IN)\\b"
        }
      ]
    },
    "constants": {
      "patterns": [
        {
          "name": "constant.language.dax",
          "match": "\\b(TRUE|FALSE|BLANK)\\b"
        }
      ]
    },
    "operators": {
      "patterns": [
        {
          "name": "keyword.operator.comparison.dax",
          "match": "(==|=|<>|!=|<=|>=|<|>)"
        },
        {
          "name": "keyword.operator.logical.dax",
          "match": "(&&|\\|\\|)"
        },
        {
          "name": "keyword.operator.arithmetic.dax",
          "match": "(\\+|-|\\*|/|\\^)"
        },
        {
          "name": "keyword.operator.assignment.dax",
          "match": ":="
        },
        {
          "name": "keyword.operator.concatenation.dax",
          "match": "&"
        }
      ]
    },
    "functions": {
      "patterns": functionPatterns
    },
    "table-column-references": {
      "patterns": [
        {
          "name": "variable.other.table.dax",
          "match": "'[^']+'"
        },
        {
          "name": "variable.other.column.dax",
          "match": "\\[[^\\]]+\\]"
        }
      ]
    }
  }
};

// Write the grammar file
const grammarPath = path.join(__dirname, 'syntaxes', 'dax.tmLanguage.json');
fs.writeFileSync(grammarPath, JSON.stringify(grammar, null, 2));

console.log('Grammar generated:');
console.log('   Functions: ' + daxFunctions.length);
console.log('   Keywords: ' + keywords.length);
console.log('   Groups: ' + Object.keys(functionsByGroup).length);