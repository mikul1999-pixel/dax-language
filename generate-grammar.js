const fs = require('fs');
const path = require('path');

// Load DAX functions and keywords
const daxFunctions = require('./src/dax.functions.json');
const daxKeywords = require('./src/dax.keywords.json');

// Sort by length
const sortByLength = (arr) => arr.sort((a, b) => b.length - a.length);

// Escape Regex Special Characters
const escapeRegex = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Functions
const functionsByGroup = daxFunctions.reduce((acc, fn) => {
  const group = fn.group || 'Other';
  if (!acc[group]) acc[group] = [];
  acc[group].push(fn.name);
  return acc;
}, {});

// Require "(" after function name
const functionPatterns = Object.entries(functionsByGroup).map(([group, names]) => ({
  name: `support.function.${group.toLowerCase().replace(/\s+/g, '-')}.dax`,
  match: `(?i)\\b(${sortByLength(names).map(escapeRegex).join('|')})\\s*(?=\\()`
}));

// Constant-like functions (TRUE/FALSE/BLANK)
const constantFunctionPattern = {
  name: "support.function.constant.dax",
  match: "(?i)\\b(TRUE|FALSE|BLANK)\\s*(?=\\()"
};

// Keywords
const defineKeywordsList = daxKeywords
  .filter(k => k.kind === 'definition')
  .map(k => k.name);

const typeKeywordsList = daxKeywords
  .filter(k => k.kind === 'dataType')
  .map(k => k.name);

const wordOperatorsList = daxKeywords
  .filter(k => k.kind === 'operator')
  .map(k => k.name);
  
const rawKeywords = daxKeywords.map(k => k.name.replace(/ /g, '\\s+'));

const typeKeywords = rawKeywords.filter(k => typeKeywordsList.includes(k.toUpperCase()));
const defineKeywords = rawKeywords.filter(k => defineKeywordsList.includes(k.toUpperCase()));
const controlKeywords = rawKeywords.filter(k =>
  !defineKeywords.includes(k.toUpperCase()) &&
  !typeKeywordsList.includes(k.toUpperCase()) &&
  !wordOperatorsList.includes(k.toUpperCase())
);

// Build the grammar
const grammar = {
  "$schema": "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
  "name": "DAX",
  "scopeName": "source.dax",
  "patterns": [
    { "include": "#define-keywords" },
    { "include": "#core-includes" }
  ],
  "repository": {
    "core-includes": {
      "patterns": [
        { "include": "#comments" },
        { "include": "#strings" },
        { "include": "#numbers" },
        { "include": "#variable-declarations" },
        // { "include": "#define-keywords" },
        { "include": "#datatype-keywords" },
        { "include": "#other-keywords" },
        { "include": "#operators" },
        { "include": "#functions" },
        { "include": "#table-column-references" }
      ]
    },
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
              "match": "\"\""
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
    "define-keywords": {
      "begin": "\\bDEFINE\\b",
      "beginCaptures": {
        "0": { "name": "keyword.control.define.dax" }
      },
      "end": "\\bEVALUATE\\b",
      "endCaptures": {
        "0": { "name": "keyword.control.evaluate.dax" }
      },
      "patterns": [
        {
          "match": `(?i)^\\s*\\b(${sortByLength(defineKeywords).join('|')})\\b`,
          "name": "keyword.definition.dax"
        },
        { "include": "#core-includes" }
      ]
    },
    "datatype-keywords": {
      "begin": "\\bDATATABLE\\s*\\(",
      "beginCaptures": {
        "0": { "name": "support.function.datatable.dax" }
      },
      "end": "\\)",
      "patterns": [
        {
          "match": `(?i)\\b(${sortByLength(typeKeywords).join('|')})\\b`,
          "name": "storage.type.datatable.dax"
        }
      ]
    },
    "other-keywords": {
      "patterns": [
        {
          "name": "keyword.control.dax",
          "match": `(?i)\\b(${sortByLength(controlKeywords).join('|')})\\b`
        }
      ]
    },
    "operators": {
      "patterns": [
        {
          "name": "keyword.control.operator.word.dax",
          "match": `(?i)\\b(${sortByLength(wordOperatorsList).join('|')})\\b`
        },
        { 
          "name": "keyword.control.operator.word.dax", 
          "match": "(?i)\\bNOT\\b(?!\\s*\\()" 
        },
        {
          "name": "keyword.operator.comparison.dax",
          "match": "(==|<>|!=|<=|>=|=|<|>)"
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
      "patterns": [
        constantFunctionPattern,
        ...functionPatterns
      ]
    },
    "variable-declarations": {
      "match": "(?i)\\b(var)\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(=)",
      "captures": {
        "1": {
          "name": "keyword.control.var.dax"
        },
        "2": {
          "name": "variable.other.constant.declaration.dax"
        },
        "3": {
          "name": "keyword.operator.assignment.dax"
        }
      }
    },
    "table-column-references": {
      "patterns": [
        {
          "begin": "(\\b\\w+|'[^']+')\\[",
          "end": "\\]",
          "beginCaptures": {
            "1": {
              "patterns": [
                {
                  "match": "'([^']+)'",
                  "captures": {
                    "1": { "name": "entity.name.type.table.dax" }
                  }
                },
                {
                  "match": "\\b\\w+",
                  "name": "entity.name.type.table.dax"
                }
              ]
            }
          },
          "patterns": [
            {
              "name": "constant.other.column.dax",
              "match": "[^\\]]+"
            }
          ]
        },
        {
          "name": "variable.other.measure.dax",
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
console.log('   Control Keywords: ' + controlKeywords.length);
console.log('   Type Keywords: ' + typeKeywords.length);