import * as dom from './dom.js';
import * as utils from './utils.js';
import * as escape from './escape.js';
import _tmpl from './templates.js';

/**
 * Cell under the caret, or the first cell when the whole table is selected.
 *
 * @param {Object} editor
 * @return {HTMLTableCellElement|null}
 */
function tableCell(editor) {
	var node = editor.getRangeHelper().parentNode();
	var cell = dom.closest(node, 'td,th');
	var table;

	if (cell) {
		return cell;
	}

	table = dom.closest(node, 'table');

	if (table && table.rows[0] && table.rows[0].cells[0]) {
		return table.rows[0].cells[0];
	}

	return null;
}

/**
 * @param {HTMLTableCellElement} cell
 * @return {number}
 */
function cellIndex(cell) {
	return Array.prototype.indexOf.call(cell.parentNode.cells, cell);
}

/**
 * @param {Document} doc
 * @param {string} tag
 * @return {HTMLTableCellElement}
 */
function blankCell(doc, tag) {
	var cell = doc.createElement(tag || 'td');

	cell.appendChild(doc.createElement('br'));

	return cell;
}

/**
 * @param {Node} node
 */
function placeCaret(node) {
	var doc = node.ownerDocument;
	var selection = doc.defaultView.getSelection();
	var range = doc.createRange();

	range.selectNodeContents(node);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

/**
 * @param {HTMLTableElement} table
 */
function removeTable(table) {
	var doc = table.ownerDocument;
	var paragraph = doc.createElement('p');

	paragraph.appendChild(doc.createElement('br'));
	table.parentNode.insertBefore(paragraph, table);
	table.parentNode.removeChild(table);
	placeCaret(paragraph);
}

/**
 * @param {Object} editor
 */
export function notifyTableEdit(editor) {
	var body = editor.getBody();
	var view = body.ownerDocument.defaultView;
	var event;

	try {
		event = new view.InputEvent('input', {
			bubbles: true,
			inputType: 'insertParagraph'
		});
	} catch (ex) {
		event = body.ownerDocument.createEvent('Event');
		event.initEvent('input', true, false);
	}

	body.dispatchEvent(event);
}

/**
 * @param {Object} editor
 * @param {HTMLTableCellElement} cell
 * @param {string} action
 */
export function editTable(editor, cell, action) {
	var table = dom.closest(cell, 'table');
	var row = cell.parentNode;
	var index = cellIndex(cell);
	var doc;
	var fresh;
	var next;
	var i;
	var current;
	var ref;

	if (!table || !row) {
		return;
	}

	doc = table.ownerDocument;

	if (action === 'row-before' || action === 'row-after') {
		fresh = doc.createElement('tr');

		for (i = 0; i < row.cells.length; i++) {
			fresh.appendChild(blankCell(doc, 'td'));
		}

		row.parentNode.insertBefore(
			fresh,
			action === 'row-before' ? row : row.nextSibling
		);
		next = fresh.cells[Math.min(index, fresh.cells.length - 1)];
	} else if (action === 'row-delete') {
		next = row.nextElementSibling || row.previousElementSibling;
		row.parentNode.removeChild(row);

		if (!table.rows.length) {
			removeTable(table);
			editor.focus();
			notifyTableEdit(editor);
			return;
		}

		next = next.cells[Math.min(index, next.cells.length - 1)];
	} else if (action === 'col-before' || action === 'col-after') {
		for (i = 0; i < table.rows.length; i++) {
			current = table.rows[i];
			ref = current.cells[index];
			fresh = blankCell(doc, ref && ref.nodeName === 'TH' ? 'th' : 'td');

			if (!ref) {
				current.appendChild(fresh);
			} else if (action === 'col-before') {
				current.insertBefore(fresh, ref);
			} else {
				current.insertBefore(fresh, ref.nextSibling);
			}
		}

		next = row.cells[action === 'col-before' ? index : index + 1];
	} else if (action === 'col-delete') {
		if (row.cells.length <= 1) {
			removeTable(table);
			editor.focus();
			notifyTableEdit(editor);
			return;
		}

		for (i = 0; i < table.rows.length; i++) {
			current = table.rows[i];

			if (current.cells[index]) {
				current.deleteCell(index);
			}
		}

		next = row.cells[Math.min(index, row.cells.length - 1)];
	} else if (action === 'table-delete') {
		removeTable(table);
		editor.focus();
		notifyTableEdit(editor);
		return;
	}

	editor.focus();

	if (next) {
		placeCaret(next);
	}

	notifyTableEdit(editor);
}

/**
 * Fixes a bug in FF where it sometimes wraps
 * new lines in their own list item.
 * See issue #359
 */
function fixFirefoxListBug(editor) {
	// Only apply to Firefox as will break other browsers.
	if ('mozHidden' in document) {
		var node = editor.getBody();
		var next;

		while (node) {
			next = node;

			if (next.firstChild) {
				next = next.firstChild;
			} else {

				while (next && !next.nextSibling) {
					next = next.parentNode;
				}

				if (next) {
					next = next.nextSibling;
				}
			}

			if (node.nodeType === 3 && /[\n\r\t]+/.test(node.nodeValue)) {
				// Only remove if newlines are collapsed
				if (!/^pre/.test(dom.css(node.parentNode, 'whiteSpace'))) {
					dom.remove(node);
				}
			}

			node = next;
		}
	}
}


/**
 * Map of all the commands for SCEditor
 * @type {Object}
 * @name commands
 * @memberOf jQuery.sceditor
 */
var defaultCmds = {
	// START_COMMAND: Bold
	bold: {
		exec: 'bold',
		tooltip: 'Bold',
		shortcut: 'Ctrl+B'
	},
	// END_COMMAND
	// START_COMMAND: Italic
	italic: {
		exec: 'italic',
		tooltip: 'Italic',
		shortcut: 'Ctrl+I'
	},
	// END_COMMAND
	// START_COMMAND: Underline
	underline: {
		exec: 'underline',
		tooltip: 'Underline',
		shortcut: 'Ctrl+U'
	},
	// END_COMMAND
	// START_COMMAND: Strikethrough
	strike: {
		exec: 'strikethrough',
		tooltip: 'Strikethrough'
	},
	// END_COMMAND
	// START_COMMAND: Subscript
	subscript: {
		exec: 'subscript',
		tooltip: 'Subscript'
	},
	// END_COMMAND
	// START_COMMAND: Superscript
	superscript: {
		exec: 'superscript',
		tooltip: 'Superscript'
	},
	// END_COMMAND

	// START_COMMAND: Left
	left: {
		state: function (node) {
			if (node && node.nodeType === 3) {
				node = node.parentNode;
			}

			if (node) {
				var isLtr = dom.css(node, 'direction') === 'ltr';
				var align = dom.css(node, 'textAlign');

				// Can be -moz-left
				return /left/.test(align) ||
					align === (isLtr ? 'start' : 'end');
			}
		},
		exec: 'justifyleft',
		tooltip: 'Align left'
	},
	// END_COMMAND
	// START_COMMAND: Centre
	center: {
		exec: 'justifycenter',
		tooltip: 'Center'
	},
	// END_COMMAND
	// START_COMMAND: Right
	right: {
		state: function (node) {
			if (node && node.nodeType === 3) {
				node = node.parentNode;
			}

			if (node) {
				var isLtr = dom.css(node, 'direction') === 'ltr';
				var align = dom.css(node, 'textAlign');

				// Can be -moz-right
				return /right/.test(align) ||
					align === (isLtr ? 'end' : 'start');
			}
		},
		exec: 'justifyright',
		tooltip: 'Align right'
	},
	// END_COMMAND
	// START_COMMAND: Justify
	justify: {
		exec: 'justifyfull',
		tooltip: 'Justify'
	},
	// END_COMMAND

	// START_COMMAND: Font
	font: {
		_dropDown: function (editor, caller, callback) {
			var	content = dom.createElement('div');

			dom.on(content, 'click', 'a', function (e) {
				callback(dom.data(this, 'font'));
				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.opts.fonts.split(',').forEach(function (font) {
				dom.appendChild(content, _tmpl('fontOpt', {
					font: font
				}, true));
			});

			editor.createDropDown(caller, 'font-picker', content);
		},
		exec: function (caller) {
			var editor = this;

			defaultCmds.font._dropDown(editor, caller, function (fontName) {
				editor.execCommand('fontname', fontName);
			});
		},
		tooltip: 'Font Name'
	},
	// END_COMMAND
	// START_COMMAND: Heading
	heading: {
		_dropDown: function (editor, caller, callback) {
			var content = dom.createElement('div');
			var labels = {
				p: 'Paragraph'
			};
			var level;

			for (level = 1; level <= 6; level++) {
				labels['h' + level] = 'Heading ' + level;
			}

			dom.on(content, 'click', 'a', function (e) {
				callback(dom.data(this, 'tag'));
				editor.closeDropDown(true);
				e.preventDefault();
			});

			(editor.opts.headings || '').split(',').forEach(function (name) {
				var tag = name.trim().toLowerCase();
				var label = labels[tag];
				var link;
				var sample;

				if (!label) {
					return;
				}

				link = dom.createElement('a');
				link.className = 'sceditor-heading-option';
				link.href = '#';
				dom.data(link, 'tag', tag);

				sample = dom.createElement(tag);
				sample.textContent = editor._(label);
				dom.appendChild(link, sample);
				dom.appendChild(content, link);
			});

			editor.createDropDown(caller, 'heading-picker', content);
		},
		state: function (parents, firstBlock) {
			var node = firstBlock || parents;

			return !!node && /^H[1-6]$/.test(node.nodeName);
		},
		exec: function (caller) {
			var editor = this;

			defaultCmds.heading._dropDown(editor, caller, function (tag) {
				editor.execCommand('formatBlock', '<' + tag + '>');
			});
		},
		tooltip: 'Heading'
	},
	// END_COMMAND
	// START_COMMAND: Size
	size: {
		_dropDown: function (editor, caller, callback) {
			var content = dom.createElement('div');
			var seen = {};

			dom.on(content, 'click', 'a', function (e) {
				callback(dom.data(this, 'size'));
				editor.closeDropDown(true);
				e.preventDefault();
			});

			(editor.opts.fontSizes || '').split(',').forEach(function (name) {
				var size = parseInt(name, 10);
				var link;

				if (!size || size < 1 || seen[size]) {
					return;
				}

				seen[size] = true;
				link = dom.createElement('a');
				link.className = 'sceditor-fontsize-option';
				link.href = '#';
				dom.data(link, 'size', String(size));
				link.style.fontSize = size + 'px';
				link.textContent = size + 'px';
				dom.appendChild(content, link);
			});

			editor.createDropDown(caller, 'fontsize-picker', content);
		},
		exec: function (caller) {
			var editor = this;

			defaultCmds.size._dropDown(editor, caller, function (size) {
				editor.wysiwygEditorInsertHtml(
					'<span style="font-size:' + size + 'px;">',
					'</span>'
				);
			});
		},
		tooltip: 'Font Size'
	},
	// END_COMMAND
	// START_COMMAND: Colour
	color: {
		_dropDown: function (editor, caller, callback) {
			var	content = dom.createElement('div'),
				html    = '',
				cmd     = defaultCmds.color;

			if (!cmd._htmlCache) {
				editor.opts.colors.split('|').forEach(function (column) {
					html += '<div class="sceditor-color-column">';

					column.split(',').forEach(function (color) {
						// Only allow named, #aaa, hsl(1.1 50% / 1), etc.
						if (!/^[\#a-z0-9\-\(\) \/%\.]+$/i.test(color)) {
							color = '';
						}

						html +=
							'<a href="#" class="sceditor-color-option"' +
							' style="background-color: ' + color + '"' +
							' data-color="' + color + '"></a>';
					});

					html += '</div>';
				});

				cmd._htmlCache = html;
			}

			dom.appendChild(content, dom.parseHTML(cmd._htmlCache));

			dom.on(content, 'click', 'a', function (e) {
				callback(dom.data(this, 'color'));
				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.createDropDown(caller, 'color-picker', content);
		},
		exec: function (caller) {
			var editor = this;

			defaultCmds.color._dropDown(editor, caller, function (color) {
				editor.execCommand('forecolor', color);
			});
		},
		tooltip: 'Font Color'
	},
	// END_COMMAND
	// START_COMMAND: Remove Format
	removeformat: {
		exec: 'removeformat',
		tooltip: 'Remove Formatting'
	},
	// END_COMMAND

	// START_COMMAND: Cut
	cut: {
		exec: 'cut',
		tooltip: 'Cut',
		errorMessage: 'Your browser does not allow the cut command. ' +
			'Please use the keyboard shortcut Ctrl/Cmd-X'
	},
	// END_COMMAND
	// START_COMMAND: Copy
	copy: {
		exec: 'copy',
		tooltip: 'Copy',
		errorMessage: 'Your browser does not allow the copy command. ' +
			'Please use the keyboard shortcut Ctrl/Cmd-C'
	},
	// END_COMMAND
	// START_COMMAND: Paste
	paste: {
		exec: 'paste',
		tooltip: 'Paste',
		errorMessage: 'Your browser does not allow the paste command. ' +
			'Please use the keyboard shortcut Ctrl/Cmd-V'
	},
	// END_COMMAND
	// START_COMMAND: Paste Text
	pastetext: {
		exec: function (caller) {
			var	val,
				content = dom.createElement('div'),
				editor  = this;

			dom.appendChild(content, _tmpl('pastetext', {
				label: editor._(
					'Paste your text inside the following box:'
				),
				insert: editor._('Insert')
			}, true));

			dom.on(content, 'click', '.button', function (e) {
				val = dom.find(content, '#txt')[0].value;

				if (val) {
					editor.wysiwygEditorInsertText(val);
				}

				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.createDropDown(caller, 'pastetext', content);
		},
		tooltip: 'Paste Text'
	},
	// END_COMMAND
	// START_COMMAND: Bullet List
	bulletlist: {
		exec: function () {
			fixFirefoxListBug(this);
			this.execCommand('insertunorderedlist');
		},
		tooltip: 'Bullet list'
	},
	// END_COMMAND
	// START_COMMAND: Ordered List
	orderedlist: {
		exec: function () {
			fixFirefoxListBug(this);
			this.execCommand('insertorderedlist');
		},
		tooltip: 'Numbered list'
	},
	// END_COMMAND
	// START_COMMAND: Indent
	indent: {
		state: function (parent, firstBlock) {
			// Only works with lists, for now
			var	range, startParent, endParent;

			if (dom.is(firstBlock, 'li')) {
				return 0;
			}

			if (dom.is(firstBlock, 'ul,ol,menu')) {
				// if the whole list is selected, then this must be
				// invalidated because the browser will place a
				// <blockquote> there
				range = this.getRangeHelper().selectedRange();

				startParent = range.startContainer.parentNode;
				endParent   = range.endContainer.parentNode;

				// TODO: could use nodeType for this?
				// Maybe just check the firstBlock contains both the start
				//and end containers

				// Select the tag, not the textNode
				// (that's why the parentNode)
				if (startParent !==
					startParent.parentNode.firstElementChild ||
					// work around a bug in FF
					(dom.is(endParent, 'li') && endParent !==
						endParent.parentNode.lastElementChild)) {
					return 0;
				}
			}

			return -1;
		},
		exec: function () {
			var editor = this,
				block = editor.getRangeHelper().getFirstBlockParent();

			editor.focus();

			// An indent system is quite complicated as there are loads
			// of complications and issues around how to indent text
			// As default, let's just stay with indenting the lists,
			// at least, for now.
			if (dom.closest(block, 'ul,ol,menu')) {
				editor.execCommand('indent');
			}
		},
		tooltip: 'Add indent'
	},
	// END_COMMAND
	// START_COMMAND: Outdent
	outdent: {
		state: function (parents, firstBlock) {
			return dom.closest(firstBlock, 'ul,ol,menu') ? 0 : -1;
		},
		exec: function () {
			var	block = this.getRangeHelper().getFirstBlockParent();
			if (dom.closest(block, 'ul,ol,menu')) {
				this.execCommand('outdent');
			}
		},
		tooltip: 'Remove one indent'
	},
	// END_COMMAND

	// START_COMMAND: Table
	table: {
		exec: function (caller) {
			var editor = this;
			var cell = tableCell(editor);
			var content = dom.createElement('div');

			if (cell) {
				content.className = 'sceditor-table-edit';
				[
					['row-after', 'Row below'],
					['row-before', 'Row above'],
					['row-delete', 'Delete row'],
					['col-after', 'Column after'],
					['col-before', 'Column before'],
					['col-delete', 'Delete column'],
					['table-delete', 'Delete table']
				].forEach(function (item) {
					var button = dom.createElement('button', {
						className: 'button',
						type: 'button'
					});

					button.setAttribute('data-action', item[0]);
					button.textContent = editor._(item[1]);
					dom.appendChild(content, button);
				});

				dom.on(content, 'click', '.button', function (e) {
					e.preventDefault();
					editTable(editor, cell, this.getAttribute('data-action'));
					editor.closeDropDown(true);
				});
			} else {
				dom.appendChild(content, _tmpl('table', {
					rows: editor._('Rows:'),
					cols: editor._('Cols:'),
					insert: editor._('Insert')
				}, true));

				dom.on(content, 'click', '.button', function (e) {
					var rows = Number(dom.find(content, '#rows')[0].value);
					var cols = Number(dom.find(content, '#cols')[0].value);
					var html = '<table>';

					if (rows > 0 && cols > 0) {
						html += Array(rows + 1).join(
							'<tr>' +
								Array(cols + 1).join(
									'<td><br /></td>'
								) +
							'</tr>'
						);

						html += '</table>';

						editor.wysiwygEditorInsertHtml(html);
						editor.closeDropDown(true);
						e.preventDefault();
					}
				});
			}

			editor.createDropDown(caller, 'inserttable', content);
		},
		tooltip: 'Insert a table'
	},
	// END_COMMAND

	// START_COMMAND: Horizontal Rule
	horizontalrule: {
		exec: 'inserthorizontalrule',
		tooltip: 'Insert a horizontal rule'
	},
	// END_COMMAND

	// START_COMMAND: Code
	code: {
		exec: function () {
			this.wysiwygEditorInsertHtml(
				'<code>',
				'<br /></code>'
			);
		},
		tooltip: 'Code'
	},
	// END_COMMAND

	// START_COMMAND: Image
	image: {
		_dropDown: function (editor, caller, selected, cb) {
			var	content = dom.createElement('div');

			dom.appendChild(content, _tmpl('image', {
				url: editor._('URL:'),
				width: editor._('Width (optional):'),
				height: editor._('Height (optional):'),
				insert: editor._('Insert')
			}, true));


			var	urlInput = dom.find(content, '#image')[0];

			urlInput.value = selected;

			dom.on(content, 'click', '.button', function (e) {
				if (urlInput.value) {
					cb(
						urlInput.value,
						dom.find(content, '#width')[0].value,
						dom.find(content, '#height')[0].value
					);
				}

				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.createDropDown(caller, 'insertimage', content);
		},
		exec: function (caller) {
			var	editor  = this;

			defaultCmds.image._dropDown(
				editor,
				caller,
				'',
				function (url, width, height) {
					var attrs  = '';

					if (width) {
						attrs += ' width="' + parseInt(width, 10) + '"';
					}

					if (height) {
						attrs += ' height="' + parseInt(height, 10) + '"';
					}

					attrs += ' src="' + escape.entities(url) + '"';

					editor.wysiwygEditorInsertHtml(
						'<img' + attrs + ' />'
					);
				}
			);
		},
		tooltip: 'Insert an image'
	},
	// END_COMMAND

	// START_COMMAND: E-mail
	email: {
		_dropDown: function (editor, caller, cb) {
			var	content = dom.createElement('div');

			dom.appendChild(content, _tmpl('email', {
				label: editor._('E-mail:'),
				desc: editor._('Description (optional):'),
				insert: editor._('Insert')
			}, true));

			dom.on(content, 'click', '.button', function (e) {
				var email = dom.find(content, '#email')[0].value;

				if (email) {
					cb(email, dom.find(content, '#des')[0].value);
				}

				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.createDropDown(caller, 'insertemail', content);
		},
		exec: function (caller) {
			var	editor  = this;

			defaultCmds.email._dropDown(
				editor,
				caller,
				function (email, text) {
					if (!editor.getRangeHelper().selectedHtml() || text) {
						editor.wysiwygEditorInsertHtml(
							'<a href="' +
							'mailto:' + escape.entities(email) + '">' +
								escape.entities((text || email)) +
							'</a>'
						);
					} else {
						editor.execCommand('createlink', 'mailto:' + email);
					}
				}
			);
		},
		tooltip: 'Insert an email'
	},
	// END_COMMAND

	// START_COMMAND: Link
	link: {
		_dropDown: function (editor, caller, cb) {
			var content = dom.createElement('div');

			dom.appendChild(content, _tmpl('link', {
				url: editor._('URL:'),
				desc: editor._('Description (optional):'),
				ins: editor._('Insert')
			}, true));

			var linkInput = dom.find(content, '#link')[0];

			function insertUrl(e) {
				if (linkInput.value) {
					cb(linkInput.value, dom.find(content, '#des')[0].value);
				}

				editor.closeDropDown(true);
				e.preventDefault();
			}

			dom.on(content, 'click', '.button', insertUrl);
			dom.on(content, 'keypress', function (e) {
				// 13 = enter key
				if (e.which === 13 && linkInput.value) {
					insertUrl(e);
				}
			}, dom.EVENT_CAPTURE);

			editor.createDropDown(caller, 'insertlink', content);
		},
		exec: function (caller) {
			var editor = this;

			defaultCmds.link._dropDown(editor, caller, function (url, text) {
				if (text || !editor.getRangeHelper().selectedHtml()) {
					editor.wysiwygEditorInsertHtml(
						'<a href="' + escape.entities(url) + '">' +
							escape.entities(text || url) +
						'</a>'
					);
				} else {
					editor.execCommand('createlink', url);
				}
			});
		},
		tooltip: 'Insert a link'
	},
	// END_COMMAND

	// START_COMMAND: Unlink
	unlink: {
		state: function () {
			return dom.closest(this.currentNode(), 'a') ? 0 : -1;
		},
		exec: function () {
			var anchor = dom.closest(this.currentNode(), 'a');

			if (anchor) {
				while (anchor.firstChild) {
					dom.insertBefore(anchor.firstChild, anchor);
				}

				dom.remove(anchor);
			}
		},
		tooltip: 'Unlink'
	},
	// END_COMMAND


	// START_COMMAND: Quote
	quote: {
		exec: function (caller, html, author) {
			var	before = '<blockquote>',
				end    = '</blockquote>';

			// if there is HTML passed set end to null so any selected
			// text is replaced
			if (html) {
				author = (author ? '<cite>' +
					escape.entities(author) +
				'</cite>' : '');
				before = before + author + html + end;
				end    = null;
			// if not add a newline to the end of the inserted quote
			} else if (this.getRangeHelper().selectedHtml() === '') {
				end = '<br />' + end;
			}

			this.wysiwygEditorInsertHtml(before, end);
		},
		tooltip: 'Insert a Quote'
	},
	// END_COMMAND

	// START_COMMAND: YouTube
	youtube: {
		_dropDown: function (editor, caller, callback) {
			var	content = dom.createElement('div');

			dom.appendChild(content, _tmpl('youtubeMenu', {
				label: editor._('Video URL:'),
				insert: editor._('Insert')
			}, true));

			dom.on(content, 'click', '.button', function (e) {
				var val = dom.find(content, '#link')[0].value;
				var idMatch = val.match(/(?:v=|v\/|embed\/|youtu.be\/)?([a-zA-Z0-9_-]{11})/);
				var timeMatch = val.match(/[&|?](?:star)?t=((\d+[hms]?){1,3})/);
				var time = 0;

				if (timeMatch) {
					utils.each(timeMatch[1].split(/[hms]/), function (i, val) {
						if (val !== '') {
							time = (time * 60) + Number(val);
						}
					});
				}

				if (idMatch && /^[a-zA-Z0-9_\-]{11}$/.test(idMatch[1])) {
					callback(idMatch[1], time);
				}

				editor.closeDropDown(true);
				e.preventDefault();
			});

			editor.createDropDown(caller, 'insertlink', content);
		},
		exec: function (btn) {
			var editor = this;

			defaultCmds.youtube._dropDown(editor, btn, function (id, time) {
				// Set sanatise to false as sanatisaion is handled by
				//  wysiwygEditorInsertHtml()
				editor.wysiwygEditorInsertHtml(_tmpl('youtube', {
					id: id,
					time: time
				}, false, false));
			});
		},
		tooltip: 'Insert a YouTube video'
	},
	// END_COMMAND

	// START_COMMAND: Date
	date: {
		_date: function (editor) {
			var	now   = new Date(),
				year  = now.getYear(),
				month = now.getMonth() + 1,
				day   = now.getDate();

			if (year < 2000) {
				year = 1900 + year;
			}

			if (month < 10) {
				month = '0' + month;
			}

			if (day < 10) {
				day = '0' + day;
			}

			return editor.opts.dateFormat
				.replace(/year/i, year)
				.replace(/month/i, month)
				.replace(/day/i, day);
		},
		exec: function () {
			this.insertText(defaultCmds.date._date(this));
		},
		txtExec: function () {
			this.insertText(defaultCmds.date._date(this));
		},
		tooltip: 'Insert current date'
	},
	// END_COMMAND

	// START_COMMAND: Time
	time: {
		_time: function () {
			var	now   = new Date(),
				hours = now.getHours(),
				mins  = now.getMinutes(),
				secs  = now.getSeconds();

			if (hours < 10) {
				hours = '0' + hours;
			}

			if (mins < 10) {
				mins = '0' + mins;
			}

			if (secs < 10) {
				secs = '0' + secs;
			}

			return hours + ':' + mins + ':' + secs;
		},
		exec: function () {
			this.insertText(defaultCmds.time._time());
		},
		txtExec: function () {
			this.insertText(defaultCmds.time._time());
		},
		tooltip: 'Insert current time'
	},
	// END_COMMAND


	// START_COMMAND: Ltr
	ltr: {
		state: function (parents, firstBlock) {
			return firstBlock && firstBlock.style.direction === 'ltr';
		},
		exec: function () {
			var	editor = this,
				rangeHelper = editor.getRangeHelper(),
				node = rangeHelper.getFirstBlockParent();

			editor.focus();

			if (!node || dom.is(node, 'body')) {
				editor.execCommand('formatBlock', 'p');

				node  = rangeHelper.getFirstBlockParent();

				if (!node || dom.is(node, 'body')) {
					return;
				}
			}

			var toggleValue = dom.css(node, 'direction') === 'ltr' ? '' : 'ltr';
			dom.css(node, 'direction', toggleValue);
		},
		tooltip: 'Left-to-Right'
	},
	// END_COMMAND

	// START_COMMAND: Rtl
	rtl: {
		state: function (parents, firstBlock) {
			return firstBlock && firstBlock.style.direction === 'rtl';
		},
		exec: function () {
			var	editor = this,
				rangeHelper = editor.getRangeHelper(),
				node = rangeHelper.getFirstBlockParent();

			editor.focus();

			if (!node || dom.is(node, 'body')) {
				editor.execCommand('formatBlock', 'p');

				node = rangeHelper.getFirstBlockParent();

				if (!node || dom.is(node, 'body')) {
					return;
				}
			}

			var toggleValue = dom.css(node, 'direction') === 'rtl' ? '' : 'rtl';
			dom.css(node, 'direction', toggleValue);
		},
		tooltip: 'Right-to-Left'
	},
	// END_COMMAND


	// START_COMMAND: Print
	print: {
		exec: 'print',
		tooltip: 'Print'
	},
	// END_COMMAND

	// START_COMMAND: Maximize
	maximize: {
		allowInPreview: true,
		state: function () {
			return this.maximize();
		},
		exec: function () {
			this.maximize(!this.maximize());
			this.focus();
		},
		txtExec: function () {
			this.maximize(!this.maximize());
			this.focus();
		},
		tooltip: 'Maximize',
		shortcut: 'Ctrl+Shift+M'
	},
	// END_COMMAND

	// START_COMMAND: Preview
	// view: true marks a mode button. A toolbar group made only of these
	// sits on the right as the view switch. Add further modes the same way.
	preview: {
		view: true,
		name: 'Preview',
		state: function () {
			return this.mode() === 'preview';
		},
		exec: function () {
			this.mode('preview');
		},
		txtExec: function () {
			this.mode('preview');
		},
		tooltip: 'Site preview'
	},
	// END_COMMAND

	// START_COMMAND: View
	view: {
		view: true,
		name: 'View',
		state: function () {
			return this.mode() === 'wysiwyg';
		},
		exec: function () {
			this.mode('wysiwyg');
			this.focus();
		},
		txtExec: function () {
			this.mode('wysiwyg');
			this.focus();
		},
		tooltip: 'Normal view'
	},
	// END_COMMAND

	// START_COMMAND: Source
	source: {
		view: true,
		name: 'Code',
		state: function () {
			return this.sourceMode();
		},
		exec: function () {
			this.sourceMode(true);
			this.focus();
		},
		txtExec: function () {
			this.sourceMode(true);
			this.focus();
		},
		tooltip: 'View source',
		shortcut: 'Ctrl+Shift+S',
		key: function () {
			this.toggleSourceMode();
			this.focus();

			return false;
		}
	},
	// END_COMMAND

	// this is here so that commands above can be removed
	// without having to remove the , after the last one.
	// Needed for IE.
	ignore: {}
};

export default defaultCmds;
