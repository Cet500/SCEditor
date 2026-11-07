/**
 * Project markers such as [image 1] and [fa plus].
 *
 * Enabled kinds stay one piece in the editor and are saved as the
 * marker string. A zero-width space beside a chip gives the caret a
 * place to stand; saving removes that space. The preview turns markers
 * into placeholders. Kinds that are not enabled stay ordinary text.
 */

var IMAGE_RE = /^\[\s*image\s+(\d+)\s*\]/i;
var GALLERY_RE = /^\[\s*gallery\s+(\d+)\s+(\d+)\s*\]/i;
var BLOG_RE = /^\[\s*blog\s+(\d+)\s*\]/i;
var FA_RE = /^\[\s*fa(?:\s+(solid|regular|brands?))?\s+([a-z0-9-]{1,64})\s*\]/i;

var PARSERS = {
	image: parseImage,
	gallery: parseGallery,
	blog: parseBlog,
	fa: parseFa
};

var ORDER = ['gallery', 'image', 'blog', 'fa'];

/**
 * Neutral placeholder rules. A preview bundle overrides them.
 * @type {string}
 */
export var placeholderCss =
	'.sceditor-marker-image,' +
	'.sceditor-marker-gallery,' +
	'.sceditor-marker-blog{' +
	'display:block;box-sizing:border-box;margin:1em 0;padding:1.25em 1em;' +
	'border:1px dashed currentColor;border-radius:6px;text-align:center;' +
	'font-family:Consolas,"Courier New",monospace}' +
	'.sceditor-marker-kind{display:block;margin-bottom:.35em;font-size:12px;' +
	'letter-spacing:.12em;text-transform:uppercase;opacity:.7}' +
	'.sceditor-marker-num{display:block;font-size:32px;line-height:1}' +
	'.sceditor-marker-fa{display:inline-block;margin:0 .15em;padding:0 .4em;' +
	'border:1px solid currentColor;border-radius:3px;' +
	'font-family:Consolas,"Courier New",monospace;font-size:.85em;' +
	'line-height:1.5;white-space:nowrap;vertical-align:baseline}' +
	'.sceditor-marker-fa::before{content:"";display:inline-block;' +
	'width:.8em;height:.8em;margin-right:.35em;border:1px solid currentColor;' +
	'border-radius:2px;vertical-align:-.1em}' +
	'.sceditor-marker-fa-regular::before{border-style:dashed}' +
	'.sceditor-marker-fa-brands::before{border-radius:50%}';

/**
 * @param {string|Array<string>} value
 * @return {Object<string, boolean>}
 */
export function enabled(value) {
	var names = Array.isArray(value) ? value : String(value || '').split(',');
	var set = {};
	var i;
	var name;

	for (i = 0; i < names.length; i++) {
		name = String(names[i] || '').trim().toLowerCase();

		if (PARSERS[name]) {
			set[name] = true;
		}
	}

	return set;
}

/**
 * Replaces enabled markers with preview placeholders.
 * Markers inside tags are left alone.
 *
 * @param {string} html
 * @param {Object<string, boolean>} kinds
 * @return {string}
 */
export function placeholders(html, kinds) {
	if (!html || !hasEnabled(kinds)) {
		return html || '';
	}

	return scan(html, kinds, previewHtml);
}

/**
 * Turns marker text in the editor into chips that cannot be split.
 *
 * @param {HTMLElement} root
 * @param {Object<string, boolean>} kinds
 */
export function protect(root, kinds) {
	var doc;
	var selection;
	var nodes;
	var walker;
	var node;
	var i;

	if (!root) {
		return;
	}

	if (!hasEnabled(kinds)) {
		labelBlocks(root);
		return;
	}

	doc = root.ownerDocument;
	selection = doc.defaultView && doc.defaultView.getSelection ?
		doc.defaultView.getSelection() :
		(doc.getSelection ? doc.getSelection() : null);
	nodes = [];
	walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
	node = walker.nextNode();

	while (node) {
		nodes.push(node);
		node = walker.nextNode();
	}

	for (i = 0; i < nodes.length; i++) {
		protectNode(nodes[i], kinds, selection);
	}

	ensureCaretSlots(root);
	labelBlocks(root);
}

/**
 * Puts chips back to their marker strings.
 *
 * @param {HTMLElement} root
 */
export function expand(root) {
	var nodes;
	var i;
	var el;
	var text;

	if (!root || !root.querySelectorAll) {
		return;
	}

	nodes = root.querySelectorAll('[data-sceditor-marker]');

	for (i = nodes.length - 1; i >= 0; i--) {
		el = nodes[i];
		text = el.getAttribute('data-sceditor-marker') || el.textContent;
		stripSlotEdge(el.previousSibling, true);
		stripSlotEdge(el.nextSibling, false);
		el.parentNode.replaceChild(
			root.ownerDocument.createTextNode(text),
			el
		);
	}
}

/**
 * Names a paragraph that holds only a picture or only one marker kind.
 * The class is editor chrome. clearBlockLabels() removes it before save.
 *
 * @param {HTMLElement} root
 */
export function labelBlocks(root) {
	var children;
	var el;
	var kind;
	var i;

	if (!root || !root.children) {
		return;
	}

	wrapLooseImages(root);
	stripEditorChrome(root, false);
	children = root.children;

	for (i = 0; i < children.length; i++) {
		el = children[i];

		if (el.nodeName !== 'P' || isNlf(el)) {
			continue;
		}

		kind = blockKind(el);

		if (kind) {
			el.classList.add('sceditor-block-' + kind);
		}
	}

	syncDragHandles(root);
}

/**
 * A bare image is its own block. The gutter label is a pseudo-element,
 * and those do not render on an img, so the image goes into a paragraph.
 *
 * @param {HTMLElement} root
 */
function wrapLooseImages(root) {
	var groups = [];
	var group = [];
	var child = root.firstChild;
	var next;
	var images;
	var node;
	var paragraph;
	var i;
	var j;

	function flush() {
		if (imageRun(group)) {
			groups.push(group);
		}

		group = [];
	}

	while (child) {
		next = child.nextSibling;

		if (isRunFiller(child) || isImageNode(child)) {
			if (group.length || isImageNode(child)) {
				group.push(child);
			}
		} else if (isInlineNode(child) ||
				(child.nodeType === 3 && /\S/.test(child.nodeValue || ''))) {
			group.push(child);
		} else {
			flush();
		}

		child = next;
	}

	flush();

	for (i = 0; i < groups.length; i++) {
		images = groups[i];

		for (j = 0; j < images.length; j++) {
			node = images[j];

			if (isImageNode(node)) {
				paragraph = root.ownerDocument.createElement('p');
				node.parentNode.insertBefore(paragraph, node);
				paragraph.appendChild(node);
			} else if (node.parentNode) {
				node.parentNode.removeChild(node);
			}
		}
	}
}

/**
 * Whitespace and line breaks can sit between stacked images.
 * Links and other text must stay in the same paragraph as an image.
 *
 * @param {Array<Node>} group
 * @return {boolean}
 */
function imageRun(group) {
	var found = false;
	var i;
	var node;

	for (i = 0; i < group.length; i++) {
		node = group[i];

		if (isRunFiller(node)) {
			continue;
		}

		if (!isImageNode(node)) {
			return false;
		}

		found = true;
	}

	return found;
}

/**
 * @param {Node} node
 * @return {boolean}
 */
function isImageNode(node) {
	return !!(node && node.nodeType === 1 && node.nodeName === 'IMG');
}

/**
 * @param {Node} node
 * @return {boolean}
 */
function isRunFiller(node) {
	if (!node) {
		return false;
	}

	if (node.nodeType === 3) {
		return !/\S/.test(node.nodeValue || '');
	}

	return node.nodeType === 1 && node.nodeName === 'BR';
}

/**
 * @param {Node} node
 * @return {boolean}
 */
function isInlineNode(node) {
	var name;

	if (!node || node.nodeType !== 1 || isImageNode(node)) {
		return false;
	}

	name = node.nodeName;

	if (name === 'P' || name === 'DIV' || name === 'BLOCKQUOTE' ||
			name === 'UL' || name === 'OL' || name === 'TABLE' ||
			name === 'PRE' || name === 'HR' || name === 'FIGURE' ||
			name === 'SECTION' || name === 'ARTICLE' ||
			(name.charAt(0) === 'H' && name.length === 2)) {
		return false;
	}

	if (node.classList && (node.classList.contains('sceditor-rail') ||
			node.classList.contains('sceditor-drop') ||
			node.classList.contains('sceditor-ghost'))) {
		return false;
	}

	return true;
}

/**
 * @param {HTMLElement} root
 */
export function clearBlockLabels(root) {
	stripEditorChrome(root, true);
}

/**
 * Drops editor chrome. The rail stays while blocks are being renamed
 * so a later pass can move the existing grips instead of rebuilding them.
 *
 * @param {HTMLElement} root
 * @param {boolean} includeRail
 */
function stripEditorChrome(root, includeRail) {
	var chrome;
	var nodes;
	var i;

	if (!root || !root.querySelectorAll) {
		return;
	}

	chrome = root.querySelectorAll(includeRail ?
		'.sceditor-rail, .sceditor-drop, .sceditor-ghost' :
		'.sceditor-drop, .sceditor-ghost');

	for (i = chrome.length - 1; i >= 0; i--) {
		chrome[i].parentNode.removeChild(chrome[i]);
	}

	nodes = root.querySelectorAll('.is-drag-source');

	for (i = 0; i < nodes.length; i++) {
		nodes[i].classList.remove('is-drag-source');
	}

	nodes = root.querySelectorAll('[class*="sceditor-block-"]');

	for (i = 0; i < nodes.length; i++) {
		stripBlockClass(nodes[i]);
	}
}

/**
 * The iframe has a box. A hidden frame reports every offset as zero,
 * which would pile every grip on the first line.
 *
 * @param {HTMLElement} root
 * @return {boolean}
 */
function frameLaidOut(root) {
	var view = root.ownerDocument && root.ownerDocument.defaultView;
	var frame = view && view.frameElement;

	return !frame || frame.getClientRects().length > 0;
}

/**
 * @param {HTMLElement} root
 * @return {HTMLElement|null}
 */
function findRail(root) {
	var i;
	var el;

	for (i = 0; i < root.children.length; i++) {
		el = root.children[i];

		if (el.classList && el.classList.contains('sceditor-rail')) {
			return el;
		}
	}

	return null;
}

/**
 * Six-dot grips for the blocks that sit directly in the body.
 * Tops are measured from the current layout. The rail is editor
 * chrome and is removed before save.
 *
 * @param {HTMLElement} root
 */
function syncDragHandles(root) {
	var doc = root.ownerDocument;
	var blocks = [];
	var tops = [];
	var rail;
	var handles;
	var handle;
	var child;
	var same;
	var i;

	if (!frameLaidOut(root)) {
		return;
	}

	for (i = 0; i < root.children.length; i++) {
		child = root.children[i];

		if (!isDraggableBlock(child)) {
			continue;
		}

		blocks.push(child);
		tops.push((child.offsetTop + 2) + 'px');
	}

	rail = findRail(root);

	if (rail && rail.children.length === tops.length) {
		handles = rail.children;
		same = true;

		for (i = 0; same && i < tops.length; i++) {
			if (handles[i].style.top !== tops[i]) {
				same = false;
			}
		}

		if (same) {
			return;
		}

		for (i = 0; i < tops.length; i++) {
			handles[i].style.top = tops[i];
		}

		return;
	}

	if (!rail) {
		rail = doc.createElement('div');
		rail.className = 'sceditor-rail';
		rail.setAttribute('contenteditable', 'false');
		rail.setAttribute('aria-hidden', 'true');
		root.appendChild(rail);
	}

	while (rail.firstChild) {
		rail.removeChild(rail.firstChild);
	}

	for (i = 0; i < blocks.length; i++) {
		handle = doc.createElement('span');
		handle.className = 'sceditor-drag';
		handle.setAttribute('contenteditable', 'false');
		handle.style.top = tops[i];
		rail.appendChild(handle);
	}
}

/**
 * @param {HTMLElement} el
 * @return {boolean}
 */
export function isDraggableBlock(el) {
	var name;

	if (!el || el.nodeType !== 1 || isNlf(el) || isRail(el)) {
		return false;
	}

	if (el.classList && el.classList.contains('sceditor-ghost')) {
		return false;
	}

	name = el.nodeName;

	return name === 'P' || name === 'DIV' || name === 'BLOCKQUOTE' ||
		name === 'UL' || name === 'OL' || name === 'TABLE' ||
		name === 'PRE' || name === 'HR' || name === 'IMG' ||
		(name.charAt(0) === 'H' && name.length === 2);
}

/**
 * Chip that Backspace (direction -1) or Delete (direction 1) removes.
 *
 * @param {Range} range
 * @param {number} direction
 * @return {HTMLElement|null}
 */
export function adjacentMarker(range, direction) {
	var node;
	var offset;
	var atStart;
	var atEnd;
	var onlySlot;

	if (!range || !range.collapsed) {
		return null;
	}

	node = range.startContainer;
	offset = range.startOffset;

	if (node.nodeType === 3) {
		atStart = offset === 0;
		atEnd = offset === (node.nodeValue || '').length;
		onlySlot = isCaretSlot(node);

		if (direction < 0 && (atStart || onlySlot)) {
			return nearestMarker(node.previousSibling, direction);
		}

		if (direction > 0 && (atEnd || onlySlot)) {
			return nearestMarker(node.nextSibling, direction);
		}

		return null;
	}

	if (node.nodeType === 1) {
		return nearestMarker(
			node.childNodes[direction < 0 ? offset - 1 : offset],
			direction
		);
	}

	return null;
}

/**
 * Removes a chip and leaves the caret where it stood.
 *
 * @param {HTMLElement} chip
 */
export function removeChip(chip) {
	var parent = chip && chip.parentNode;
	var doc;
	var selection;
	var range;
	var prev;
	var next;
	var ref;

	if (!parent) {
		return;
	}

	prev = chip.previousSibling;
	next = chip.nextSibling;

	if (isCaretSlot(prev)) {
		parent.removeChild(prev);
	}

	if (isCaretSlot(next)) {
		parent.removeChild(next);
	}

	ref = chip.nextSibling;
	parent.removeChild(chip);

	doc = parent.ownerDocument;
	range = doc.createRange();

	if (!parent.firstChild && parent !== doc.body) {
		ref = doc.createElement('br');
		parent.appendChild(ref);
		range.setStartBefore(ref);
	} else if (ref && ref.parentNode === parent) {
		if (ref.nodeType === 3) {
			range.setStart(ref, 0);
		} else {
			range.setStartBefore(ref);
		}
	} else if (parent.lastChild && parent.lastChild.nodeType === 3) {
		range.setStart(parent.lastChild, parent.lastChild.nodeValue.length);
	} else if (parent.lastChild) {
		range.setStartAfter(parent.lastChild);
	} else {
		range.setStart(parent, 0);
	}

	range.collapse(true);
	selection = doc.defaultView && doc.defaultView.getSelection();

	if (!selection) {
		return;
	}

	selection.removeAllRanges();
	selection.addRange(range);
}

/**
 * @param {string} html
 * @param {Object<string, boolean>} kinds
 * @param {function(Object): string} render
 * @return {string}
 */
function scan(html, kinds, render) {
	var out = '';
	var i = 0;
	var len = html.length;
	var raw = 0;

	while (i < len) {
		if (html.charAt(i) === '<') {
			var tagEnd = html.indexOf('>', i + 1);
			var tagTo = tagEnd === -1 ? len : tagEnd + 1;
			var piece = html.slice(i, tagTo);
			var only = raw ? null : onlyMarkerParagraph(html, i, kinds);

			if (only) {
				out += render(only.marker);
				i = only.end;
				continue;
			}

			raw = rawDepth(raw, piece);
			out += piece;
			i = tagTo;
			continue;
		}

		if (!raw && html.charAt(i) === '[') {
			var marker = readMarker(html, i, kinds);

			if (marker) {
				out += render(marker);
				i += marker.raw.length;
				continue;
			}
		}

		var nextTag = html.indexOf('<', i);
		var nextMark = raw ? -1 : html.indexOf('[', i + 1);
		var cut = len;

		if (nextTag !== -1 && nextTag < cut) {
			cut = nextTag;
		}

		if (nextMark !== -1 && nextMark < cut) {
			cut = nextMark;
		}

		if (cut === i) {
			out += html.charAt(i);
			i++;
			continue;
		}

		out += html.slice(i, cut);
		i = cut;
	}

	return out;
}

/**
 * Markers inside pre, code, script and style stay as text.
 *
 * @param {number} depth
 * @param {string} tag
 * @return {number}
 */
function rawDepth(depth, tag) {
	var match = /^<\s*(\/?)\s*([a-z0-9]+)/i.exec(tag);
	var name;

	if (!match) {
		return depth;
	}

	name = match[2].toLowerCase();

	if (name !== 'pre' && name !== 'code' &&
			name !== 'script' && name !== 'style') {
		return depth;
	}

	if (match[1]) {
		return Math.max(0, depth - 1);
	}

	if (/\/>\s*$/.test(tag)) {
		return depth;
	}

	return depth + 1;
}

/**
 * A paragraph whose only content is one marker becomes the block itself.
 *
 * @param {string} html
 * @param {number} index
 * @param {Object<string, boolean>} kinds
 * @return {{marker: Object, end: number}|null}
 */
function onlyMarkerParagraph(html, index, kinds) {
	var open = /^<p\b[^>]*>/i.exec(html.slice(index));
	var close;
	var inner;
	var trimmed;
	var marker;

	if (!open) {
		return null;
	}

	close = html.toLowerCase().indexOf('</p>', index + open[0].length);

	if (close === -1) {
		return null;
	}

	inner = html.slice(index + open[0].length, close);
	trimmed = inner.replace(/^\s+|\s+$/g, '');
	marker = trimmed.charAt(0) === '[' ?
		readMarker(trimmed, 0, kinds) : null;

	if (!marker || marker.raw.length !== trimmed.length) {
		return null;
	}

	if (marker.kind === 'fa') {
		return null;
	}

	return {
		marker: marker,
		end: close + 4
	};
}

/**
 * @param {Text} textNode
 * @param {Object<string, boolean>} kinds
 * @param {Selection} selection
 */
function protectNode(textNode, kinds, selection) {
	var text;
	var parts;
	var doc;
	var frag;
	var caret;
	var pos;
	var i;
	var part;
	var el;
	var len;
	var placed;

	if (!textNode.parentNode || skipText(textNode)) {
		return;
	}

	text = textNode.nodeValue;

	if (!text || text.indexOf('[') === -1) {
		return;
	}

	parts = splitParts(text, kinds);

	if (!parts) {
		return;
	}

	doc = textNode.ownerDocument;
	frag = doc.createDocumentFragment();
	caret = null;

	if (selection && selection.isCollapsed &&
			selection.anchorNode === textNode) {
		caret = selection.anchorOffset;
	}

	pos = 0;
	placed = null;

	for (i = 0; i < parts.length; i++) {
		part = parts[i];

		if (part.marker) {
			el = chip(doc, part.marker);
			len = part.marker.raw.length;
		} else {
			el = doc.createTextNode(part.text);
			len = part.text.length;
		}

		frag.appendChild(el);

		if (caret !== null && caret >= pos && caret <= pos + len) {
			placed = {
				el: el,
				offset: caret - pos,
				chip: !!part.marker
			};
		}

		pos += len;
	}

	textNode.parentNode.replaceChild(frag, textNode);

	if (!placed || !selection) {
		return;
	}

	restoreCaret(doc, selection, placed);
}

/**
 * @param {Document} doc
 * @param {Selection} selection
 * @param {{el: Node, offset: number, chip: boolean}} placed
 */
function restoreCaret(doc, selection, placed) {
	var range = doc.createRange();

	if (placed.chip || placed.el.nodeType !== 3) {
		if (placed.offset === 0) {
			range.setStartBefore(placed.el);
		} else {
			range.setStartAfter(placed.el);
		}
	} else {
		range.setStart(
			placed.el,
			Math.min(placed.offset, placed.el.nodeValue.length)
		);
	}

	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

/**
 * @param {string} text
 * @param {Object<string, boolean>} kinds
 * @return {Array|null}
 */
function splitParts(text, kinds) {
	var parts = [];
	var i = 0;
	var found = false;

	while (i < text.length) {
		var bracket = text.indexOf('[', i);
		var marker;

		if (bracket === -1) {
			parts.push({ text: text.slice(i) });
			break;
		}

		if (bracket > i) {
			parts.push({ text: text.slice(i, bracket) });
		}

		marker = readMarker(text, bracket, kinds);

		if (!marker) {
			parts.push({ text: '[' });
			i = bracket + 1;
			continue;
		}

		found = true;
		parts.push({ marker: marker });
		i = bracket + marker.raw.length;
	}

	return found ? parts : null;
}

/**
 * @param {Text} node
 * @return {boolean}
 */
function skipText(node) {
	var parent = node.parentNode;

	while (parent && parent.nodeType === 1) {
		var name = parent.nodeName;

		if (name === 'PRE' || name === 'CODE' ||
				name === 'SCRIPT' || name === 'STYLE') {
			return true;
		}

		if (parent.classList &&
				parent.classList.contains('sceditor-marker')) {
			return true;
		}

		parent = parent.parentNode;
	}

	return false;
}

/**
 * @param {string} html
 * @param {number} index
 * @param {Object<string, boolean>} kinds
 * @return {Object|null}
 */
function readMarker(html, index, kinds) {
	var slice = html.slice(index);
	var i;
	var kind;
	var marker;

	for (i = 0; i < ORDER.length; i++) {
		kind = ORDER[i];

		if (!kinds[kind]) {
			continue;
		}

		marker = PARSERS[kind](slice);

		if (marker) {
			return marker;
		}
	}

	return null;
}

/**
 * @param {string} slice
 * @return {Object|null}
 */
function parseImage(slice) {
	var match = IMAGE_RE.exec(slice);

	if (!match) {
		return null;
	}

	return {
		raw: match[0],
		kind: 'image',
		source: '[image ' + match[1] + ']',
		num: match[1]
	};
}

/**
 * @param {string} slice
 * @return {Object|null}
 */
function parseGallery(slice) {
	var match = GALLERY_RE.exec(slice);

	if (!match) {
		return null;
	}

	return {
		raw: match[0],
		kind: 'gallery',
		source: '[gallery ' + match[1] + ' ' + match[2] + ']',
		num: match[1] + '\u2013' + match[2]
	};
}

/**
 * @param {string} slice
 * @return {Object|null}
 */
function parseBlog(slice) {
	var match = BLOG_RE.exec(slice);

	if (!match) {
		return null;
	}

	return {
		raw: match[0],
		kind: 'blog',
		source: '[blog ' + match[1] + ']',
		num: match[1]
	};
}

/**
 * @param {string} slice
 * @return {Object|null}
 */
function parseFa(slice) {
	var match = FA_RE.exec(slice);
	var style;
	var name;
	var source;

	if (!match) {
		return null;
	}

	style = (match[1] || 'solid').toLowerCase();
	name = match[2].toLowerCase();

	if (style === 'brand') {
		style = 'brands';
	}

	source = match[1] ?
		'[fa ' + style + ' ' + name + ']' :
		'[fa ' + name + ']';

	return {
		raw: match[0],
		kind: 'fa',
		source: source,
		style: style,
		name: name
	};
}

/**
 * @param {Object} marker
 * @return {string}
 */
function previewHtml(marker) {
	if (marker.kind === 'fa') {
		return '<span class="sceditor-marker sceditor-marker-fa ' +
			'sceditor-marker-fa-' + escapeHtml(marker.style) + '">' +
			'<span class="sceditor-marker-name">' +
			escapeHtml(marker.name) + '</span></span>';
	}

	return '<span class="sceditor-marker sceditor-marker-' + marker.kind +
		'"><span class="sceditor-marker-kind">' + marker.kind +
		'</span><span class="sceditor-marker-num">' +
		escapeHtml(marker.num) + '</span></span>';
}

/**
 * @param {HTMLElement} el
 * @return {boolean}
 */
function isNlf(el) {
	return !!(el.classList && el.classList.contains('sceditor-nlf'));
}

/**
 * @param {HTMLElement} el
 * @return {boolean}
 */
function isRail(el) {
	return !!(el.classList && (el.classList.contains('sceditor-rail') ||
		el.classList.contains('sceditor-drop')));
}

/**
 * @param {HTMLElement} el
 * @return {boolean}
 */
function isIgnored(el) {
	return !!(el.classList && (
		el.classList.contains('sceditor-nlf') ||
		el.classList.contains('sceditor-ignore')
	));
}

/**
 * @param {HTMLElement} el
 */
function stripBlockClass(el) {
	var remove = [];
	var i;
	var name;

	if (!el || !el.classList) {
		return;
	}

	for (i = 0; i < el.classList.length; i++) {
		name = el.classList.item(i);

		if (name.indexOf('sceditor-block-') === 0) {
			remove.push(name);
		}
	}

	for (i = 0; i < remove.length; i++) {
		el.classList.remove(remove[i]);
	}
}

/**
 * Text outside marker chips, without caret spaces.
 *
 * @param {HTMLElement} el
 * @return {string}
 */
function plainText(el) {
	var doc = el.ownerDocument;
	var walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
	var out = '';
	var node = walker.nextNode();

	while (node) {
		if (!insideMarker(node)) {
			out += node.nodeValue || '';
		}

		node = walker.nextNode();
	}

	return out.replace(/\u200B/g, '').replace(/\s+/g, '');
}

/**
 * @param {Node} node
 * @return {boolean}
 */
function insideMarker(node) {
	var parent = node.parentNode;

	while (parent && parent.nodeType === 1) {
		if (parent.classList && parent.classList.contains('sceditor-marker')) {
			return true;
		}

		parent = parent.parentNode;
	}

	return false;
}

/**
 * @param {HTMLElement} el
 * @return {Array<HTMLElement>}
 */
function elementChildren(el) {
	var list = [];
	var child = el.firstChild;

	while (child) {
		if (child.nodeType === 1 && child.nodeName !== 'BR' &&
				!isIgnored(child)) {
			list.push(child);
		}

		child = child.nextSibling;
	}

	return list;
}

/**
 * @param {HTMLElement} el
 * @return {string}
 */
function markerKind(el) {
	var raw = el.getAttribute('data-sceditor-marker') || '';
	var match = /^\[\s*(image|gallery|blog|fa)\b/i.exec(raw);

	return match ? match[1].toLowerCase() : '';
}

/**
 * image, gallery, blog, fa or img when the paragraph is only that.
 * An empty string leaves the ordinary "p" label.
 *
 * @param {HTMLElement} el
 * @return {string}
 */
function blockKind(el) {
	var els;
	var kind;
	var next;
	var i;

	if (plainText(el)) {
		return '';
	}

	els = elementChildren(el);

	if (!els.length) {
		return '';
	}

	if (els.length === 1 && els[0].nodeName === 'IMG') {
		return 'img';
	}

	kind = '';

	for (i = 0; i < els.length; i++) {
		next = markerKind(els[i]);

		if (!next) {
			return '';
		}

		if (!kind) {
			kind = next;
		} else if (kind !== next) {
			return '';
		}
	}

	return kind;
}

/**
 * True when the text node is empty or holds only caret spaces.
 *
 * @param {Node} node
 * @return {boolean}
 */
function isCaretSlot(node) {
	return !!(node && node.nodeType === 3 &&
		!String(node.nodeValue || '').replace(/\u200B/g, ''));
}

/**
 * @param {Node} node
 * @param {number} direction
 * @return {HTMLElement|null}
 */
function nearestMarker(node, direction) {
	while (isCaretSlot(node)) {
		node = direction < 0 ? node.previousSibling : node.nextSibling;
	}

	if (node && node.nodeType === 1 && node.classList &&
			node.classList.contains('sceditor-marker')) {
		return node;
	}

	return null;
}

/**
 * Drops caret spaces that sit against a chip.
 *
 * @param {Node} node
 * @param {boolean} trailing
 */
function stripSlotEdge(node, trailing) {
	var value;

	if (!node || node.nodeType !== 3 || !node.nodeValue ||
			node.nodeValue.indexOf('\u200B') === -1) {
		return;
	}

	value = trailing ?
		node.nodeValue.replace(/\u200B+$/, '') :
		node.nodeValue.replace(/^\u200B+/, '');

	if (!value) {
		node.parentNode.removeChild(node);
	} else if (value !== node.nodeValue) {
		node.nodeValue = value;
	}
}

/**
 * Puts a caret space on each side of a chip that has no text there.
 *
 * @param {HTMLElement} root
 */
function ensureCaretSlots(root) {
	var chips = root.querySelectorAll('.sceditor-marker');
	var doc;
	var el;
	var i;

	for (i = 0; i < chips.length; i++) {
		el = chips[i];
		doc = el.ownerDocument;

		if (!el.previousSibling || el.previousSibling.nodeType !== 3) {
			el.parentNode.insertBefore(doc.createTextNode('\u200B'), el);
		}

		if (!el.nextSibling || el.nextSibling.nodeType !== 3) {
			el.parentNode.insertBefore(
				doc.createTextNode('\u200B'),
				el.nextSibling
			);
		}
	}
}

/**
 * @param {Document} doc
 * @param {Object} marker
 * @return {HTMLElement}
 */
function chip(doc, marker) {
	var el = doc.createElement('span');

	el.className = 'sceditor-marker';
	el.setAttribute('contenteditable', 'false');
	el.setAttribute('data-sceditor-marker', marker.source);
	el.textContent = marker.source;

	return el;
}

/**
 * @param {Object<string, boolean>} kinds
 * @return {boolean}
 */
function hasEnabled(kinds) {
	return !!(kinds && (
		kinds.image || kinds.gallery || kinds.fa || kinds.blog
	));
}

/**
 * @param {string} text
 * @return {string}
 */
function escapeHtml(text) {
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}
