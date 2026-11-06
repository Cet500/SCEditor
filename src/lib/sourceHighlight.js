/**
 * Colours HTML source the way Sublime Text's Monokai does.
 * Tag names are pink, attributes green, strings yellow.
 * Angle brackets and equals stay the normal foreground.
 * A style attribute is coloured as CSS.
 *
 * @param {string} value
 * @return {string} HTML safe to assign to innerHTML
 */
export function highlightSource(value) {
	var source = String(value || '');
	var html = '';
	var i = 0;
	var len = source.length;

	while (i < len) {
		if (source.slice(i, i + 4) === '<!--') {
			var commentEnd = source.indexOf('-->', i + 4);
			var commentTo = commentEnd === -1 ? len : commentEnd + 3;

			html += token('sce-c', source.slice(i, commentTo));
			i = commentTo;
			continue;
		}

		if (source.charAt(i) === '<') {
			var tagEnd = source.indexOf('>', i + 1);
			var tagTo = tagEnd === -1 ? len : tagEnd + 1;
			var raw = source.slice(i, tagTo);

			html += raw.charAt(1) === '!' ?
				highlightDeclaration(raw) :
				highlightTag(raw);
			i = tagTo;
			continue;
		}

		if (source.charAt(i) === '&') {
			var semi = source.indexOf(';', i + 1);
			var entity = semi === -1 ? '' : source.slice(i, semi + 1);

			if (isEntity(entity)) {
				html += highlightEntity(entity);
				i = semi + 1;
				continue;
			}
		}

		var nextTag = source.indexOf('<', i);
		var nextAmp = source.indexOf('&', i);
		var cut = len;

		if (nextTag !== -1 && nextTag < cut) {
			cut = nextTag;
		}

		if (nextAmp !== -1 && nextAmp < cut) {
			cut = nextAmp;
		}

		if (cut === i) {
			html += escapeHtml(source.charAt(i));
			i++;
			continue;
		}

		html += escapeHtml(source.slice(i, cut));
		i = cut;
	}

	// Keeps the last line the same height as the textarea.
	return html + '<br>';
}

/**
 * @param {string} raw Tag including the angle brackets
 * @return {string}
 */
function highlightTag(raw) {
	var match = /^<\/?([^\s\/>]+)([\s\S]*?)(\/?)>$/.exec(raw);

	if (!match) {
		return token('sce-t', raw);
	}

	var html = escapeHtml(raw.charAt(1) === '/' ? '</' : '<');

	html += token('sce-t', match[1]);
	html += highlightAttrs(match[2]);

	if (match[3]) {
		html += escapeHtml('/');
	}

	return html + escapeHtml('>');
}

/**
 * <!DOCTYPE> and other declarations.
 * DOCTYPE is a keyword, the root name is a language constant.
 *
 * @param {string} raw
 * @return {string}
 */
function highlightDeclaration(raw) {
	var doc = /^<!((?:doctype))(\s+)([A-Za-z][\w]*)([\s\S]*)$/i.exec(raw);

	if (!doc) {
		return escapeHtml(raw);
	}

	return escapeHtml('<!') +
		token('sce-t', doc[1]) +
		escapeHtml(doc[2]) +
		token('sce-n', doc[3]) +
		escapeHtml(doc[4]);
}

/**
 * @param {string} text Attribute text inside a tag
 * @return {string}
 */
function highlightAttrs(text) {
	var html = '';
	var i = 0;
	var len = text.length;

	while (i < len) {
		if (isSpace(text.charAt(i))) {
			var spaceEnd = i + 1;

			while (spaceEnd < len && isSpace(text.charAt(spaceEnd))) {
				spaceEnd++;
			}

			html += escapeHtml(text.slice(i, spaceEnd));
			i = spaceEnd;
			continue;
		}

		var nameEnd = i;

		while (nameEnd < len && !isSpace(text.charAt(nameEnd)) &&
				text.charAt(nameEnd) !== '=' &&
				text.charAt(nameEnd) !== '/') {
			nameEnd++;
		}

		if (nameEnd === i) {
			html += escapeHtml(text.charAt(i));
			i++;
			continue;
		}

		var attrName = text.slice(i, nameEnd);

		html += token('sce-a', attrName);
		i = nameEnd;

		var eq = i;

		while (eq < len && isSpace(text.charAt(eq))) {
			eq++;
		}

		if (text.charAt(eq) !== '=') {
			continue;
		}

		html += escapeHtml(text.slice(i, eq) + '=');

		var valueAt = eq + 1;

		while (valueAt < len && isSpace(text.charAt(valueAt))) {
			valueAt++;
		}

		html += escapeHtml(text.slice(eq + 1, valueAt));

		var value = readValue(text, valueAt, attrName);

		html += value.html;
		i = value.index;
	}

	return html;
}

/**
 * @param {string} text
 * @param {number} valueAt
 * @param {string} attrName
 * @return {{html: string, index: number}}
 */
function readValue(text, valueAt, attrName) {
	var len = text.length;
	var css = attrName.toLowerCase() === 'style';

	if (valueAt >= len) {
		return { html: '', index: len };
	}

	var quote = text.charAt(valueAt);

	if (quote === '"' || quote === '\'') {
		var endQuote = text.indexOf(quote, valueAt + 1);
		var valueEnd = endQuote === -1 ? len : endQuote + 1;
		var quoted = text.slice(valueAt, valueEnd);

		return {
			html: css ? highlightStyle(quoted) : token('sce-s', quoted),
			index: valueEnd
		};
	}

	var bareEnd = valueAt;

	while (bareEnd < len && !isSpace(text.charAt(bareEnd))) {
		bareEnd++;
	}

	var bare = text.slice(valueAt, bareEnd);

	return {
		html: css ? highlightCss(bare) : token('sce-s', bare),
		index: bareEnd
	};
}

/**
 * Quoted style="" value. The quotes stay string-coloured.
 *
 * @param {string} raw
 * @return {string}
 */
function highlightStyle(raw) {
	var quote = raw.charAt(0);
	var closed = raw.length > 1 && raw.charAt(raw.length - 1) === quote;

	if ((quote === '"' || quote === '\'') && closed) {
		return token('sce-s', quote) +
			highlightCss(raw.slice(1, -1)) +
			token('sce-s', quote);
	}

	return highlightCss(raw);
}

/**
 * CSS inside a style attribute: names and keywords blue,
 * numbers and hex colours purple.
 *
 * @param {string} text
 * @return {string}
 */
function highlightCss(text) {
	var html = '';
	var i = 0;
	var len = text.length;

	while (i < len) {
		var ch = text.charAt(i);

		if (text.slice(i, i + 2) === '/*') {
			var commentEnd = text.indexOf('*/', i + 2);
			var commentTo = commentEnd === -1 ? len : commentEnd + 2;

			html += token('sce-c', text.slice(i, commentTo));
			i = commentTo;
			continue;
		}

		if (ch === '"' || ch === '\'') {
			var quoteEnd = text.indexOf(ch, i + 1);
			var quoteTo = quoteEnd === -1 ? len : quoteEnd + 1;

			html += token('sce-s', text.slice(i, quoteTo));
			i = quoteTo;
			continue;
		}

		if (ch === '#') {
			var hex = /^#[\da-fA-F]{3,8}/.exec(text.slice(i));

			if (hex && isCssHex(hex[0])) {
				html += token('sce-n', hex[0]);
				i += hex[0].length;
				continue;
			}
		}

		var num = /^-?(?:\d+\.?\d*|\.\d+)([a-zA-Z%]+)?/.exec(text.slice(i));

		if (num && /\d/.test(num[0])) {
			var unit = num[1] || '';
			var digits = num[0].slice(0, num[0].length - unit.length);

			html += token('sce-n', digits);

			if (unit) {
				html += token('sce-b', unit);
			}

			i += num[0].length;
			continue;
		}

		var ident = /^-?[a-zA-Z_][\w-]*/.exec(text.slice(i));

		if (ident) {
			html += token(
				ident[0].toLowerCase() === 'important' ? 'sce-t' : 'sce-b',
				ident[0]
			);
			i += ident[0].length;
			continue;
		}

		html += escapeHtml(ch);
		i++;
	}

	return html;
}

/**
 * @param {string} entity
 * @return {boolean}
 */
function isEntity(entity) {
	return /^&(?:#x[\da-fA-F]+|#\d+|[a-zA-Z][\da-zA-Z]+);$/.test(entity);
}

/**
 * @param {string} colour
 * @return {boolean}
 */
function isCssHex(colour) {
	return /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(colour);
}

/**
 * & and ; stay the foreground. The name is a constant.
 *
 * @param {string} entity
 * @return {string}
 */
function highlightEntity(entity) {
	var parts = /^(&#x|&#|&)([\da-zA-Z]+)(;)$/i.exec(entity);

	if (!parts) {
		return token('sce-n', entity);
	}

	return escapeHtml(parts[1]) +
		token('sce-n', parts[2]) +
		escapeHtml(parts[3]);
}

/**
 * @param {string} ch
 * @return {boolean}
 */
function isSpace(ch) {
	return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * @param {string} cls
 * @param {string} text
 * @return {string}
 */
function token(cls, text) {
	return '<span class="' + cls + '">' + escapeHtml(text) + '</span>';
}
