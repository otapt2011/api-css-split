// api/split.js
// ================================================================
// 1. PARSER
// ================================================================
function parseCSS(css) {
  if (css.indexOf(";!important") > -1) css = css.replace(/;!important/g, " !important");
  if (css.indexOf("; !important") > -1) css = css.replace(/; !important/g, " !important");

  function stylesheet() { return { stylesheet: { rules: rules() } }; }

  function open() { return match(/^{\s*/); }

  function close() { return match(/^}\s*/); }

  function rules() {
    var node, rules = [];
    whitespace();
    comments(rules);
    while (css[0] != '}' && (node = atrule() || rule())) {
      comments(rules);
      rules.push(node);
    }
    return rules;
  }

  function match(re) {
    var m = re.exec(css);
    if (!m) return;
    css = css.slice(m[0].length);
    return m;
  }

  function whitespace() { match(/^\s*/); }

  function comments(rules) {
    rules = rules || [];
    var c;
    while (c = comment()) { rules.push(c); }
    return rules;
  }

  function comment() {
    if ('/' == css[0] && '*' == css[1]) {
      var i = 2;
      while ('*' != css[i] || '/' != css[i + 1]) ++i;
      i += 2;
      var comment = css.slice(2, i - 2);
      css = css.slice(i);
      whitespace();
      return { comment: comment };
    }
  }

  function selector() {
    var m = match(/^([^{]+)/);
    if (!m) return;
    var comment = m.input;
    comment = comment.match(/\}(.*?)\*\//);
    var selector = m[0].trim().split(/\s*,\s*/);
    return { selector: selector, comments: comment };
  }

  function declaration() {
    var prop = match(/^(\*?[-\w]+)\s*/);
    if (!prop) return;
    var comment = prop.input.match(/\/\*(.*?)\*\//);
    prop = prop[0];
    if (!match(/^:\s*/)) return;
    var val = match(/^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^\)]*?\)|[^};])+)\s*/);
    if (!val) return;
    val = val[0].trim();
    match(/^[;\s]*/);
    var full = prop + ": " + val + ";";
    return { property: prop, value: val, comments: comment, fullDec: full };
  }

  function keyframe() {
    var m, vals = [];
    while (m = match(/^(from|to|\d+%|\.\d+%|\d+\.\d+%)\s*/)) {
      vals.push(m[1]);
      match(/^,\s*/);
    }
    if (!vals.length) return;
    return { values: vals, declarations: declarations() };
  }

  function keyframes() {
    var m = match(/^@([-\w]+)?keyframes */);
    if (!m) return;
    var vendor = m[1];
    var m2 = match(/^([-\w]+)\s*/);
    if (!m2) return;
    var name = m2[1];
    if (!open()) return;
    comments();
    var frame, frames = [];
    while (frame = keyframe()) { frames.push(frame); comments(); }
    if (!close()) return;
    return { name: name, vendor: vendor, keyframes: frames };
  }

  function media() {
    var m = match(/^@media *([^{]+)/);
    if (!m) return;
    var media = m[1].trim();
    if (!open()) return;
    comments();
    var style = rules();
    if (!close()) return;
    return { media: media, rules: style };
  }

  function fontface() {
    var m = match(/^@font-face\s*/);
    if (!m) return;
    if (!open()) return;
    comments();
    var decls = [];
    var decl;
    while (decl = declaration()) {
      decls.push(decl);
      comments();
    }
    if (!close()) return;
    return { fontface: true, declarations: decls };
  }

  function atimport() { return _atrule('import'); }

  function atcharset() { return _atrule('charset'); }

  function _atrule(name) {
    var m = match(new RegExp('^@' + name + ' *([^;\\n]+);\\s*'));
    if (!m) return;
    var ret = {};
    ret[name] = m[1].trim();
    return ret;
  }

  function declarations() {
    var decls = [];
    if (!open()) return;
    comments();
    var decl;
    while (decl = declaration()) { decls.push(decl); comments(); }
    if (!close()) return;
    return decls;
  }

  function atrule() {
    return keyframes() || media() || fontface() || atimport() || atcharset();
  }

  function rule() {
    var sel = selector();
    if (!sel) return;
    comments();
    return { selectors: sel, declarations: declarations() };
  }

  return stylesheet();
}

// ================================================================
// 2. CSS BEAUTIFY
// ================================================================
function cssbeautify(style, opt) {
  opt = opt || {};
  var indent = opt.indent || '\t';
  var openbrace = opt.openbrace === 'end-of-line';
  var autosemicolon = !!opt.autosemicolon;
  var index = 0, length = style.length, blocks = [], formatted = '',
    ch, ch2, str, state, depth = 0, quote = null, comment = false,
    State = { Start: 0, AtRule: 1, Block: 2, Selector: 3, Ruleset: 4, Property: 5, Separator: 6, Expression: 7, URL: 8 };
  state = State.Start;

  function isWhitespace(c) { return c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f'; }

  function isQuote(c) { return c === "'" || c === '"'; }

  function isName(c) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || '-_*.:#'.indexOf(c) >= 0;
  }

  function trimRight(s) { return s.replace(/\s+$/, ''); }

  function appendIndent() { for (var i = depth; i > 0; i--) formatted += indent; }

  function openBlock() {
    formatted = trimRight(formatted);
    if (openbrace) formatted += ' {';
    else { formatted += '\n'; appendIndent(); formatted += '{'; }
    if (ch2 !== '\n') formatted += '\n';
    depth++;
  }

  function closeBlock() {
    depth--;
    formatted = trimRight(formatted);
    if (autosemicolon && formatted.charAt(formatted.length - 1) !== ';') formatted += ';';
    formatted += '\n';
    appendIndent();
    formatted += '}';
    blocks.push(formatted);
    formatted = '';
  }

  style = style.replace(/\r\n/g, '\n');

  while (index < length) {
    ch = style.charAt(index);
    ch2 = style.charAt(index + 1);
    index++;
    if (isQuote(quote)) {
      formatted += ch;
      if (ch === quote) quote = null;
      if (ch === '\\' && ch2 === quote) { formatted += ch2; index++; }
      continue;
    }
    if (isQuote(ch)) { formatted += ch; quote = ch; continue; }
    if (comment) {
      formatted += ch;
      if (ch === '*' && ch2 === '/') { comment = false; formatted += ch2; index++; }
      continue;
    }
    if (ch === '/' && ch2 === '*') { comment = true; formatted += ch; formatted += ch2; index++; continue; }

    if (state === State.Start) {
      if (blocks.length === 0 && isWhitespace(ch) && formatted.length === 0) continue;
      if (ch <= ' ' || ch.charCodeAt(0) >= 128) { state = State.Start; formatted += ch; continue; }
      if (isName(ch) || ch === '@') {
        var str2 = trimRight(formatted);
        if (str2.length === 0) { if (blocks.length > 0) formatted = '\n\n'; } else {
          if (str2.charAt(str2.length - 1) === '}' || str2.charAt(str2.length - 1) === ';') {
            formatted = str2 + '\n\n';
          } else {
            while (true) {
              var c2 = formatted.charAt(formatted.length - 1);
              if (c2 !== ' ' && c2.charCodeAt(0) !== 9) break;
              formatted = formatted.substr(0, formatted.length - 1);
            }
          }
        }
        formatted += ch;
        state = (ch === '@') ? State.AtRule : State.Selector;
        continue;
      }
    }

    if (state === State.AtRule) {
      if (ch === ';') { formatted += ch; state = State.Start; continue; }
      if (ch === '{') { openBlock(); state = State.Block; continue; }
      formatted += ch;
      continue;
    }

    if (state === State.Block) {
      if (isName(ch)) {
        var str3 = trimRight(formatted);
        if (str3.length === 0) { if (blocks.length > 0) formatted = '\n\n'; } else {
          if (str3.charAt(str3.length - 1) === '}') { formatted = str3 + '\n\n'; } else {
            while (true) {
              var c3 = formatted.charAt(formatted.length - 1);
              if (c3 !== ' ' && c3.charCodeAt(0) !== 9) break;
              formatted = formatted.substr(0, formatted.length - 1);
            }
          }
        }
        appendIndent();
        formatted += ch;
        state = State.Selector;
        continue;
      }
      if (ch === '}') { closeBlock(); state = State.Start; continue; }
      formatted += ch;
      continue;
    }

    if (state === State.Selector) {
      if (ch === '{') { openBlock(); state = State.Ruleset; continue; }
      if (ch === '}') { closeBlock(); state = State.Start; continue; }
      formatted += ch;
      continue;
    }

    if (state === State.Ruleset) {
      if (ch === '}') { closeBlock(); state = State.Start; if (depth > 0) state = State.Block; continue; }
      if (ch === '\n') { formatted = trimRight(formatted); formatted += '\n'; continue; }
      if (!isWhitespace(ch)) {
        formatted = trimRight(formatted);
        formatted += '\n';
        appendIndent();
        formatted += ch;
        state = State.Property;
        continue;
      }
      formatted += ch;
      continue;
    }

    if (state === State.Property) {
      if (ch === ':') { formatted = trimRight(formatted); formatted += ': '; state = State.Expression; if (isWhitespace(ch2)) state = State.Separator; continue; }
      if (ch === '}') { closeBlock(); state = State.Start; if (depth > 0) state = State.Block; continue; }
      formatted += ch;
      continue;
    }

    if (state === State.Separator) {
      if (!isWhitespace(ch)) { formatted += ch; state = State.Expression; continue; }
      if (isQuote(ch2)) state = State.Expression;
      continue;
    }

    if (state === State.Expression) {
      if (ch === '}') { closeBlock(); state = State.Start; if (depth > 0) state = State.Block; continue; }
      if (ch === ';') { formatted = trimRight(formatted); formatted += ';\n'; state = State.Ruleset; continue; }
      formatted += ch;
      if (ch === '(') {
        if (formatted.charAt(formatted.length - 2) === 'l' &&
          formatted.charAt(formatted.length - 3) === 'r' &&
          formatted.charAt(formatted.length - 4) === 'u') {
          state = State.URL;
          continue;
        }
      }
      continue;
    }

    if (state === State.URL) {
      if (ch === ')' && formatted.charAt(formatted.length - 1) !== '\\') {
        formatted += ch;
        state = State.Expression;
        continue;
      }
    }
    formatted += ch;
  }

  formatted = blocks.join('') + formatted;
  return formatted;
}

// ================================================================
// 3. SPLIT FUNCTIONS
// ================================================================

// 3a. EVEN SPLIT
function performSplitEven(css) {
  var sheet = parseCSS(css);
  var allRules = sheet.stylesheet.rules;

  if (!allRules || allRules.length === 0) {
    return ['', '', '', ''];
  }

  function rulesToCSS(rules) {
    var result = '';
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule.comment !== undefined) {
        result += '/*' + rule.comment + '*/\r\n';
      } else if (rule.selectors && rule.declarations) {
        var selector = rule.selectors.selector || '';
        result += selector + ' {';
        for (var j = 0; j < rule.declarations.length; j++) {
          result += rule.declarations[j].fullDec || '';
        }
        result += '}\r\n';
      } else if (rule.media) {
        result += '@media ' + rule.media + ' {';
        if (rule.rules) {
          for (var mi = 0; mi < rule.rules.length; mi++) {
            var mr = rule.rules[mi];
            if (mr.comment !== undefined) {
              result += '/*' + mr.comment + '*/\r\n';
            } else if (mr.selectors && mr.declarations) {
              var sel = mr.selectors.selector || '';
              result += sel + ' {';
              for (var dj = 0; dj < mr.declarations.length; dj++) {
                result += mr.declarations[dj].fullDec || '';
              }
              result += '}';
            }
          }
        }
        result += '}\r\n';
      } else if (rule.fontface) {
        result += '@font-face {';
        for (var fi = 0; fi < rule.declarations.length; fi++) {
          result += rule.declarations[fi].fullDec || '';
        }
        result += '}\r\n';
      } else if (rule.import) {
        result += '@import ' + rule.import + ';\r\n';
      } else if (rule.charset) {
        result += '@charset ' + rule.charset + ';\r\n';
      } else if (rule.name && rule.keyframes) {
        result += '@' + (rule.vendor ? rule.vendor : '') + 'keyframes ' + rule.name + ' {';
        for (var ki = 0; ki < rule.keyframes.length; ki++) {
          var kf = rule.keyframes[ki];
          result += kf.values.join(', ') + ' {';
          for (var kd = 0; kd < kf.declarations.length; kd++) {
            result += kf.declarations[kd].fullDec || '';
          }
          result += '}';
        }
        result += '}\r\n';
      }
    }
    return result;
  }

  var total = allRules.length;
  var partSize = Math.ceil(total / 4);
  var parts = [];
  for (var i = 0; i < 4; i++) {
    var start = i * partSize;
    var end = Math.min(start + partSize, total);
    var chunk = allRules.slice(start, end);
    var cssText = rulesToCSS(chunk);
    var beautified = cssbeautify(cssText, { indent: '\t', openbrace: 'end-of-line', autosemicolon: false });
    var units = ['px', 'em', 'ex', 'pt', '%', 'in', 'mm', 'cm', 'pc'];
    for (var u = 0; u < units.length; u++) {
      beautified = beautified.replace(new RegExp(' 0' + units[u], 'g'), ' 0');
      beautified = beautified.replace(new RegExp(':0' + units[u], 'g'), ':0');
      beautified = beautified.replace(new RegExp('\\s0' + units[u], 'g'), ' 0');
    }
    parts.push(beautified);
  }
  return parts;
}

// 3b. PROPERTY SPLIT
function performSplitProperty(css) {
  var layoutItems = [
    'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom',
    'padding', 'padding-left', 'padding-right', 'padding-top', 'padding-bottom',
    'float', 'display', 'visibility', 'width', 'max-width', 'min-width',
    'height', 'position', 'top', 'bottom', 'left', 'right',
    'text-align', 'text-indent', 'vertical-align', 'list-style-position',
    'clear', 'overflow', 'z-index', 'border-spacing', 'content'
  ];
  var fontItems = [
    'font', 'font-family', 'font-size', 'font-weight', 'font-style',
    'font-variant', 'font-stretch', 'line-height', 'letter-spacing',
    'word-spacing', 'text-transform', 'text-decoration',
    'text-decoration-line', 'text-decoration-style', 'text-decoration-color',
    'text-shadow', 'font-display'
  ];
  var colorItems = [
    'color', 'background-color', 'background', 'border-color', 'outline-color',
    'text-decoration-color', '-webkit-text-fill-color', 'fill', 'stroke'
  ];

  function arrayToObject(arr) {
    var o = {};
    for (var i = 0; i < arr.length; i++) o[arr[i]] = '';
    return o;
  }
  var layoutLookup = arrayToObject(layoutItems);
  var fontLookup = arrayToObject(fontItems);
  var colorLookup = arrayToObject(colorItems);

  var sheet = parseCSS(css);
  var rules = sheet.stylesheet.rules;

  var builders = [
    { name: 'layout', data: '' },
    { name: 'style', data: '' },
    { name: 'fonts', data: '' },
    { name: 'colors', data: '' }
  ];

  for (var i = 0; i < rules.length; i++) {
    var rule = rules[i];

    if (rule.hasOwnProperty('comment')) {
      var prefix = (i !== 0) ? '\r\n\r\n' : '';
      for (var b = 0; b < builders.length; b++) {
        builders[b].data += prefix + '/*' + rule.comment + '*/\r\n';
      }
      continue;
    }

    if (rule.hasOwnProperty('fontface')) {
      var fontsPart = '@font-face {';
      var decls = rule.declarations || [];
      for (var fi = 0; fi < decls.length; fi++) {
        fontsPart += decls[fi].fullDec || '';
      }
      fontsPart += '}\r\n';
      builders[2].data += fontsPart;
      continue;
    }

    if (rule.hasOwnProperty('media')) {
      var mediaParts = ['', '', '', ''];
      var mediaRules = rule.rules || [];
      for (var mi = 0; mi < mediaRules.length; mi++) {
        var mr = mediaRules[mi];
        if (mr.hasOwnProperty('comment')) {
          var cp = '\r\n\r\n\t/*' + mr.comment + '*/\r\n';
          for (var mp = 0; mp < 4; mp++) mediaParts[mp] += cp;
          continue;
        }
        var sel = (mr.selectors && mr.selectors.selector) || '';
        var ruleParts = ['', '', '', ''];
        var decls = mr.declarations || [];
        for (var di = 0; di < decls.length; di++) {
          var d = decls[di];
          var prop = d.property || '';
          if (prop in layoutLookup) {
            ruleParts[0] += d.fullDec || '';
          } else if (prop in fontLookup) {
            ruleParts[2] += d.fullDec || '';
          } else if (prop in colorLookup) {
            ruleParts[3] += d.fullDec || '';
          } else {
            ruleParts[1] += d.fullDec || '';
          }
        }
        for (var p = 0; p < 4; p++) {
          if (ruleParts[p].length > 0) {
            mediaParts[p] += sel + ' {' + ruleParts[p] + '}';
          }
        }
      }
      for (var mp2 = 0; mp2 < 4; mp2++) {
        if (mediaParts[mp2].length > 0) {
          builders[mp2].data += '@media ' + rule.media + ' {' + mediaParts[mp2] + '}\r\n';
        }
      }
      continue;
    }

    if (!rule.selectors) continue;
    var selector = rule.selectors.selector || '';
    var ruleParts = ['', '', '', ''];
    var decls = rule.declarations || [];
    for (var j = 0; j < decls.length; j++) {
      var dec = decls[j];
      var prop = dec.property || '';
      if (prop in layoutLookup) {
        ruleParts[0] += dec.fullDec || '';
      } else if (prop in fontLookup) {
        ruleParts[2] += dec.fullDec || '';
      } else if (prop in colorLookup) {
        ruleParts[3] += dec.fullDec || '';
      } else {
        ruleParts[1] += dec.fullDec || '';
      }
    }
    for (var p2 = 0; p2 < 4; p2++) {
      if (ruleParts[p2].length > 0) {
        builders[p2].data += selector + ' {' + ruleParts[p2] + '}\r\n';
      }
    }
  }

  function removeZeroUnits(str) {
    var units = ['px', 'em', 'ex', 'pt', '%', 'in', 'mm', 'cm', 'pc'];
    for (var u = 0; u < units.length; u++) {
      str = str.replace(new RegExp(' 0' + units[u], 'g'), ' 0');
      str = str.replace(new RegExp(':0' + units[u], 'g'), ':0');
      str = str.replace(new RegExp('\\s0' + units[u], 'g'), ' 0');
    }
    return str;
  }

  var result = [];
  for (var idx = 0; idx < 4; idx++) {
    var raw = builders[idx].data;
    var beautified = cssbeautify(raw, { indent: '\t', openbrace: 'end-of-line', autosemicolon: false });
    beautified = removeZeroUnits(beautified);
    result.push(beautified);
  }
  return result;
}

// ================================================================
// 4. VERCEL API HANDLER
// ================================================================
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { css, mode } = req.body;
    if (!css || typeof css !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid "css" field' });
    }

    const splitMode = mode === 'property' ? 'property' : 'even';
    let parts;
    if (splitMode === 'property') {
      parts = performSplitProperty(css);
    } else {
      parts = performSplitEven(css);
    }

    return res.status(200).json({ success: true, parts, mode: splitMode });
  } catch (error) {
    console.error('Split error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
};
