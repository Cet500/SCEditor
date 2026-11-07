import SCEditor from 'src/lib/SCEditor.js';
import defaultCommands from 'src/lib/defaultCommands.js';
import defaultOptions from 'src/lib/defaultOptions.js';
import * as utils from 'tests/unit/utils.js';
import rangy from 'rangy';


var $textarea;
var sceditor;
var $fixture = $('#qunit-module-fixture');

var testFormat = function () {
	this.toHtml = function () {
		return '<p><b>test wysiwyg</b></p>';
	};

	this.toSource = function () {
		return '<p><b>test source</b></p>';
	};
};

var reloadEditor = function (config) {
	reloadEditor.isCustomConfig = !!config;

	if (sceditor) {
		sceditor.destroy();
	}

	var textarea = $('<textarea></textarea>')
		.width(400)
		.height(300)
		.val('<p>The quick brown fox jumps over the lazy dog.<br /></p>')
		.get(0);

	$fixture
		.empty()
		.append(textarea);

	sceditor  = new SCEditor(textarea, config || {});
	sceditor.focus();
	$textarea = $(textarea);
};


QUnit.module('lib/SCEditor', {
	before: function () {
		SCEditor.commands       = defaultCommands;
		SCEditor.defaultOptions = defaultOptions;

		SCEditor.formats.test = testFormat;

		defaultOptions.style = '../../src/themes/content/default.css';

		reloadEditor();
	},
	after: function () {
		defaultOptions.style = 'themes/content/default.min.css';

		delete SCEditor.formats.test;

		if (sceditor) {
			sceditor.destroy();
		}
	},
	beforeEach: function () {
		if (reloadEditor.isCustomConfig) {
			reloadEditor();
		}

		sceditor.sourceMode(false);

		sceditor.val('<p>The quick brown fox jumps over ' +
			'the lazy dog.<br /></p>', false);
	}
});

QUnit.test('autofocus', function (assert) {
	reloadEditor({
		autofocus: true,
		autofocusEnd: false
	});

	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var sel    = rangy.getIframeSelection(iframe);

	assert.ok(sel.rangeCount, 'At elast 1 range exists');

	var range  = sel.getRangeAt(0);
	var cursor = body.ownerDocument.createTextNode('|');

	range.insertNode(cursor);

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>|The quick brown fox jumps over the lazy dog.<br /></p>'
	));
});


QUnit.test('autofocusEnd', function (assert) {
	reloadEditor({
		autofocus: true,
		autofocusEnd: true
	});

	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var sel    = rangy.getIframeSelection(iframe);

	assert.ok(sel.rangeCount, 'At elast 1 range exists');

	var range  = sel.getRangeAt(0);
	var cursor = body.ownerDocument.createTextNode('|');

	range.insertNode(cursor);

	var expected = '<p>The quick brown fox jumps ' +
		'over the lazy dog.|<br /></p>';

	assert.nodesEqual(body.firstChild, utils.htmlToNode(expected));
});


QUnit.test('readOnly()', function (assert) {
	var body = sceditor.getBody();

	assert.strictEqual(sceditor.readOnly(), false);
	assert.strictEqual(body.contentEditable, 'true');

	assert.strictEqual(sceditor.readOnly(true), sceditor);
	assert.strictEqual(sceditor.readOnly(), true);
	assert.strictEqual(body.contentEditable, 'false');

	assert.strictEqual(sceditor.readOnly(false), sceditor);
	assert.strictEqual(sceditor.readOnly(), false);
	assert.strictEqual(body.contentEditable, 'true');
});


QUnit.test('rtl()', function (assert) {
	var body = sceditor.getBody();

	assert.strictEqual(sceditor.rtl(), false);

	assert.strictEqual(sceditor.rtl(true), sceditor);
	assert.strictEqual(sceditor.rtl(), true);
	assert.strictEqual(body.dir, 'rtl');

	assert.strictEqual(sceditor.rtl(false), sceditor);
	assert.strictEqual(sceditor.rtl(), false);
	assert.strictEqual(body.dir, 'ltr');
});


QUnit.test('width()', function (assert) {
	var $container = $fixture.children('.sceditor-container');

	assert.close(sceditor.width(), $container.width(), 1);
	assert.equal(sceditor.width('200'), sceditor);

	assert.close(sceditor.width(), $container.width(), 1);
	assert.close($container.width(), 200, 1);
});


QUnit.test('height()', function (assert) {
	var $container = $fixture.children('.sceditor-container');

	assert.close(sceditor.height(), $container.height(), 1);
	assert.equal(sceditor.height('200'), sceditor);

	assert.close(sceditor.height(), $container.height(), 1);
	assert.close($container.height(), 200, 1);
});


QUnit.test('maximize()', function (assert) {
	var $container = $fixture.children('.sceditor-container');

	assert.strictEqual(sceditor.maximize(), false);
	assert.equal(sceditor.maximize(true), sceditor);
	assert.strictEqual(sceditor.maximize(), true);

	assert.close($container.width(), $(window).width(), 1);
	assert.close($container.height(), $(window).height(), 1);

	assert.equal(sceditor.maximize(false), sceditor);
	assert.strictEqual(sceditor.maximize(), false);
});


QUnit.test('destroy()', function (assert) {
	sceditor.destroy();

	assert.equal($fixture.children('.sceditor-container').length, 0);
	assert.ok($textarea.is(':visible'));

	// Call again to make sure no exception is thrown
	sceditor.destroy();
	sceditor.destroy();

	reloadEditor();
});

QUnit.test('destroy() - Unbind updateOriginal', function (assert) {
	var textarea = document.createElement('textarea');
	var submit = document.createElement('input');
	submit.type = 'submit';

	var form = document.createElement('form');
	form.addEventListener('submit', function (e) {
		e.preventDefault();
	});
	form.appendChild(submit);
	form.appendChild(textarea);

	$fixture.append(form);

	var sceditor = new SCEditor(textarea, { format: 'xhtml' });
	sceditor.val('<p>testing</p>');
	var expected = sceditor.val();
	submit.click();

	assert.equal(textarea.value, expected);

	sceditor.val('<p>testing 123</p>');
	sceditor.destroy();
	submit.click();

	assert.equal(textarea.value, expected);
	form.parentNode.removeChild(form);
});


QUnit.test('wysiwygEditorInsertHtml()', function (assert) {
	sceditor.focus();
	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var range  = rangy.createRange(body.ownerDocument);
	var sel    = rangy.getIframeSelection(iframe);

	range.setStart(body.firstChild.firstChild, 10);
	range.setEnd(body.firstChild.firstChild, 10);
	sel.setSingleRange(range);

	sceditor.wysiwygEditorInsertHtml('<b>test</b>');

	// This is the easiest way to make sure the cursor is still in the
	// correct position.
	sceditor.wysiwygEditorInsertHtml('|');

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick <b>test|</b>brown fox ' +
			'jumps over the lazy dog.<br /></p>'
	));
});

QUnit.test('wysiwygEditorInsertHtml() - Start and end', function (assert) {
	var done = assert.async();
	var valueChangedFired = false;
	var nodeChangedFired = false;

	sceditor.bind('valuechanged', function () {
		valueChangedFired = true;
	});

	sceditor.bind('nodechanged', function () {
		nodeChangedFired = true;
	});

	sceditor.focus();
	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var range  = rangy.createRange(body.ownerDocument);
	var sel    = rangy.getIframeSelection(iframe);

	range.setStart(body.firstChild.firstChild, 10);
	range.setEnd(body.firstChild.firstChild, 15);
	sel.setSingleRange(range);

	sceditor.wysiwygEditorInsertHtml('<b>', '</b>');

	// This is the easiest way to make sure the cursor is still in the
	// correct position.
	sceditor.wysiwygEditorInsertHtml('|');

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick <b>brown|</b> fox ' +
			'jumps over the lazy dog.<br /></p>'
	));

	// Use setTimeout to allow event handlers to fire
	setTimeout(function () {
		assert.ok(valueChangedFired, 'valuechanged event should fire after bold formatting');
		assert.ok(nodeChangedFired, 'nodechanged event should fire after bold formatting');
		done();
	}, 50);
});

QUnit.test('Bold formatting via toolbar triggers valuechanged', function (assert) {
	var done = assert.async();
	var valueChangedFired = false;
	var nodeChangedFired = false;

	sceditor.bind('valuechanged', function () {
		valueChangedFired = true;
	});

	sceditor.bind('nodechanged', function () {
		nodeChangedFired = true;
	});

	sceditor.focus();
	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var range  = rangy.createRange(body.ownerDocument);
	var sel    = rangy.getIframeSelection(iframe);

	range.setStart(body.firstChild.firstChild, 10);
	range.setEnd(body.firstChild.firstChild, 15);
	sel.setSingleRange(range);

	sceditor.execCommand('bold');

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick <b>brown</b> fox ' +
			'jumps over the lazy dog.<br /></p>'
	));

	// This is the easiest way to make sure the cursor is still in the
	// correct position.
	sceditor.wysiwygEditorInsertHtml('|');

	// Did it overwrite the selection?
	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick <b>|</b> fox ' +
			'jumps over the lazy dog.<br /></p>'
	));

	// Use setTimeout to allow event handlers to fire
	setTimeout(function () {
		assert.ok(valueChangedFired, 'valuechanged event should fire after bold formatting');
		assert.ok(nodeChangedFired, 'nodechanged event should fire after bold formatting');
		done();
	}, 50);
});


QUnit.test('wysiwygEditorInsertText() - Start and end', function (assert) {
	sceditor.focus();
	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var range  = rangy.createRange(body.ownerDocument);
	var sel    = rangy.getIframeSelection(iframe);

	range.setStart(body.firstChild.firstChild, 10);
	range.setEnd(body.firstChild.firstChild, 10);
	sel.setSingleRange(range);

	sceditor.wysiwygEditorInsertText('<&>test');

	// This is the easiest way to make sure the cursor is still in the
	// correct position.
	sceditor.wysiwygEditorInsertText('|');

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick &lt;&amp;&gt;test|brown fox ' +
			'jumps over the lazy dog.<br /></p>'
	));
});

QUnit.test('wysiwygEditorInsertText() - Start and end', function (assert) {
	var iframe = sceditor.getContentAreaContainer();
	var body   = sceditor.getBody();
	var range  = rangy.createRange(body.ownerDocument);
	var sel    = rangy.getIframeSelection(iframe);

	range.setStart(body.firstChild.firstChild, 10);
	range.setEnd(body.firstChild.firstChild, 15);
	sel.setSingleRange(range);

	sceditor.wysiwygEditorInsertText('<b>', '</b>');

	// This is the easiest way to make sure the cursor is still in the
	// correct position.
	sceditor.wysiwygEditorInsertText('|');

	assert.nodesEqual(body.firstChild, utils.htmlToNode(
		'<p>The quick &lt;b&gt;brown&lt;/b&gt;| fox ' +
			'jumps over the lazy dog.<br /></p>'
	));
});


QUnit.test('wysiwygEditorInsertHtml()', function (assert) {
	var sourceEditor = $('.sceditor-container textarea').get(0);

	sceditor.sourceMode(true);
	sceditor.val('<p>The quick brown fox jumps ' +
		'over the lazy dog.<br /></p>');
	sceditor.sourceEditorCaret({
		start: 13,
		end: 13
	});
	sceditor.sourceEditorInsertText('light-');
	sceditor.sourceEditorInsertText('|');

	assert.htmlEqual(
		sourceEditor.value,
		'<p>The quick light-|brown fox jumps over the lazy dog.<br /></p>'
	);
});

QUnit.test('sourceEditorInsertText() - Start and end', function (assert) {
	sceditor.sourceMode(true);
	sceditor.val('<p>The quick brown fox jumps ' +
		'over the lazy dog.<br /></p>');
	sceditor.sourceEditorCaret({
		start: 13,
		end: 18
	});
	sceditor.sourceEditorInsertText('"', '"');
	sceditor.sourceEditorInsertText('|');

	assert.htmlEqual(
		sceditor.val(),
		'<p>The quick "brown|" fox jumps over the lazy dog.<br /></p>'
	);
});


QUnit.test('getWysiwygEditorValue() - Filter', function (assert) {
	sceditor.getRangeHelper().clear();

	assert.htmlEqual(
		sceditor.getWysiwygEditorValue(),
		'<p>The quick brown fox jumps over the lazy dog.<br /></p>'
	);

	assert.htmlEqual(
		sceditor.getWysiwygEditorValue(true),
		'<p>The quick brown fox jumps over the lazy dog.<br /></p>'
	);


	reloadEditor({
		format: 'test'
	});

	sceditor.getRangeHelper().clear();

	assert.htmlEqual(
		sceditor.getWysiwygEditorValue(false),
		'<p><b>test wysiwyg</b></p>'
	);

	assert.htmlEqual(
		sceditor.getWysiwygEditorValue(true),
		'<p><b>test source</b></p>'
	);
});


QUnit.test('getSourceEditorValue()', function (assert) {
	sceditor.getRangeHelper().clear();
	sceditor.sourceMode(true);
	sceditor.val('<p>The quick brown fox jumps ' +
		'over the lazy dog.<br /></p>');

	assert.htmlEqual(
		sceditor.getSourceEditorValue(true),
		'<p>The quick brown fox jumps over the lazy dog.<br /></p>'
	);

	assert.htmlEqual(
		sceditor.getSourceEditorValue(false),
		'<p>The quick brown fox jumps over the lazy dog.<br /></p>'
	);
});

QUnit.test('getSourceEditorValue() - Uses format', function (assert) {
	reloadEditor({
		format: 'test'
	});

	sceditor.getRangeHelper().clear();
	sceditor.sourceMode(true);
	assert.htmlEqual(
		sceditor.getSourceEditorValue(false),
		'<p><b>test source</b></p>'
	);

	assert.htmlEqual(
		sceditor.getSourceEditorValue(true),
		'<p><b>test wysiwyg</b></p>'
	);
});


QUnit.test('updateOriginal()', function (assert) {
	var textarea = $('textarea').get(1);
	var body = sceditor.getBody();

	body.innerHTML = '<div>text 1234...</div>';

	sceditor.getRangeHelper().clear();
	sceditor.updateOriginal();

	assert.htmlEqual(textarea.value, '<div>text 1234...</div>');
});


QUnit.test('Insert image XSS', function (assert) {
	var done = assert.async();

	reloadEditor({});

	var called = false;
	sceditor.getBody().xss = function () {
		called = true;
	};

	var button = document.getElementsByClassName('sceditor-button-image')[0];
	defaultCommands.image.exec.call(sceditor, button);

	var dropdown = document.getElementsByClassName('sceditor-insertimage')[0];
	var input = document.getElementById('image');
	var insertButton = dropdown.getElementsByClassName('button')[0];

	input.value = '<img src="http://url.to.file.which/not.exist" onerror=body.xss();>';
	insertButton.click();

	sceditor.getBody().addEventListener('error', function () {
		setTimeout(function () {
			assert.notOk(called);
			done();
		}, 1);
	}, true);
});

QUnit.test('Insert HTML filter JS', function (assert) {
	var done = assert.async();

	reloadEditor({
		format: 'xhtml'
	});

	var called = false;
	sceditor.getBody().xss = function () {
		called = true;
	};
	sceditor.wysiwygEditorInsertHtml('<img src="http://url.to.file.which/not.exist" onerror=body.xss();>');
	sceditor.getBody().addEventListener('error', function () {
		setTimeout(function () {
			assert.notOk(called);
			done();
		}, 1);
	}, true);
});



QUnit.test('Allow target=blank links', function (assert) {
	reloadEditor({
		format: 'xhtml'
	});

	sceditor.val(
		'<a href="#" target="_blank">blank</a>' +
		'<a href="#" rel="  noopener" target="_blank">safe</a>' +
		'<a href="#" rel="noreferrer" target="_blank">referer</a>' +
		'<a href="#" rel="noreferrernoopener" target="_blank">invalid noopener</a>' +
		'<a href="#" target="blank">removed</a>' +
		'<img src="removed.jpg" target="_blank" />'
	);
	assert.htmlEqual(sceditor.val(), '<p>\n	' +
		'<a href=\"#\" rel=\"noopener\" target=\"_blank\">blank</a>' +
		'<a href=\"#\" rel=\"noopener\" target=\"_blank\">safe</a>' +
		'<a href=\"#\" rel=\"noopener noreferrer\" target=\"_blank\">referer</a>' +
		'<a href=\"#\" rel=\"noopener noreferrernoopener\" target=\"_blank\">invalid noopener</a>' +
		'<a href="#">removed</a>' +
		'<img src=\"removed.jpg\" />\n' +
	'</p>');
});


QUnit.test('Do not wrap whitespace text nodes', function (assert) {
	var body = sceditor.getBody();
	var rangeHelper = sceditor.getRangeHelper();
	var testHtml = '<p>test</p>     ';

	sceditor.focus();

	body.innerHTML = testHtml;

	var range = rangeHelper.cloneSelected();
	range.setStartAfter(body.firstChild.firstChild);
	range.collapse(true);
	rangeHelper.selectRange(range);
	body.dispatchEvent(new Event('selectionchange'));

	var range = rangeHelper.cloneSelected();
	range.setStart(body.lastChild, 1);
	range.collapse(true);
	rangeHelper.selectRange(range);
	body.dispatchEvent(new Event('selectionchange'));

	assert.htmlEqual(body.innerHTML, testHtml);
});


QUnit.test('markers round-trip as marker strings', function (assert) {
	var body;
	var saved;

	reloadEditor({
		format: 'xhtml',
		markers: 'image,gallery,fa,blog'
	});

	sceditor.val(
		'<p>[image 2]</p>' +
		'<p>иконка [fa plus] тут</p>' +
		'<p>[gallery 1 3]</p>' +
		'<pre>[image 1]</pre>',
		false
	);

	body = sceditor.getBody();

	assert.strictEqual(body.querySelectorAll('.sceditor-marker').length, 3);
	assert.strictEqual(
		body.querySelector('[data-sceditor-marker="[image 2]"]')
			.getAttribute('contenteditable'),
		'false'
	);
	assert.strictEqual(body.querySelector('pre').textContent, '[image 1]');

	saved = sceditor.val();

	assert.ok(saved.indexOf('[image 2]') !== -1);
	assert.ok(saved.indexOf('[fa plus]') !== -1);
	assert.ok(saved.indexOf('[gallery 1 3]') !== -1);
	assert.ok(saved.indexOf('[image 1]') !== -1);
	assert.strictEqual(saved.indexOf('sceditor-marker'), -1);
	assert.strictEqual(saved.indexOf('sceditor-block-'), -1);
	assert.strictEqual(saved.indexOf('sceditor-drag'), -1);
	assert.strictEqual(saved.indexOf('sceditor-rail'), -1);
	assert.strictEqual(saved.indexOf('data-sceditor-marker'), -1);
	assert.strictEqual(saved.indexOf('\u200B'), -1);
});


QUnit.test('Enter starts a block, Shift+Enter stays inside',
	function (assert) {
		var body;
		var doc;
		var h2;
		var paragraph;
		var text;
		var range;
		var sel;
		var paragraphs;

		reloadEditor({
			format: 'xhtml'
		});
		sceditor.val('<h2>Заголовок</h2><p>Первая строка</p>', false);
		sceditor.focus();

		body = sceditor.getBody();
		doc = body.ownerDocument;
		h2 = body.querySelector('h2');
		text = h2.firstChild;
		range = doc.createRange();
		range.setStart(text, text.nodeValue.length);
		range.collapse(true);
		sel = doc.defaultView.getSelection();
		sel.removeAllRanges();
		sel.addRange(range);

		h2.dispatchEvent(new KeyboardEvent('keypress', {
			bubbles: true,
			cancelable: true,
			keyCode: 13,
			which: 13
		}));

		assert.strictEqual(h2.textContent, 'Заголовок');
		assert.strictEqual(h2.nextElementSibling.tagName, 'P');

		paragraph = Array.prototype.find.call(body.children, function (el) {
			return el.textContent.indexOf('Первая строка') !== -1;
		});
		text = paragraph.firstChild;
		range = doc.createRange();
		range.setStart(text, 6);
		range.collapse(true);
		sel.removeAllRanges();
		sel.addRange(range);
		paragraphs = body.querySelectorAll('p').length;

		paragraph.dispatchEvent(new KeyboardEvent('keypress', {
			bubbles: true,
			cancelable: true,
			keyCode: 13,
			which: 13,
			shiftKey: true
		}));

		assert.strictEqual(body.querySelectorAll('p').length, paragraphs);
		assert.ok(paragraph.querySelector('br'));
	}
);


QUnit.test('drag handle moves a block and is not saved', function (assert) {
	var body;
	var doc;
	var handles;
	var blocks;
	var handle;
	var target;
	var down;
	var move;
	var saved;
	var order;

	reloadEditor({
		format: 'xhtml'
	});
	sceditor.val('<p>Первый</p><p>Второй</p><h2>Низ</h2>', false);

	body = sceditor.getBody();
	doc = body.ownerDocument;
	handles = body.querySelectorAll('.sceditor-drag');
	blocks = Array.prototype.filter.call(body.children, function (el) {
		return !el.classList.contains('sceditor-rail') &&
			!el.classList.contains('sceditor-nlf');
	});

	assert.strictEqual(handles.length, blocks.length);
	handle = handles[blocks.length - 1];
	target = blocks[0].getBoundingClientRect();

	down = new PointerEvent('pointerdown', {
		bubbles: true,
		cancelable: true,
		pointerId: 1,
		button: 0,
		clientX: 8,
		clientY: 8
	});
	handle.dispatchEvent(down);

	move = new PointerEvent('pointermove', {
		bubbles: true,
		cancelable: true,
		pointerId: 1,
		button: 0,
		clientX: 8,
		clientY: target.top - 30
	});
	doc.dispatchEvent(move);
	doc.dispatchEvent(new PointerEvent('pointerup', {
		bubbles: true,
		cancelable: true,
		pointerId: 1,
		button: 0,
		clientX: 8,
		clientY: target.top - 30
	}));

	order = Array.prototype.filter.call(body.children, function (el) {
		return !el.classList.contains('sceditor-rail') &&
			!el.classList.contains('sceditor-nlf');
	});

	assert.strictEqual(order[0].tagName, 'H2');
	assert.strictEqual(order[0].textContent, 'Низ');

	saved = sceditor.val();
	assert.ok(saved.indexOf('Низ') < saved.indexOf('Первый'));
	assert.strictEqual(saved.indexOf('sceditor-drag'), -1);
	assert.strictEqual(saved.indexOf('sceditor-rail'), -1);
	assert.strictEqual(saved.indexOf('sceditor-ghost'), -1);
	assert.strictEqual(saved.indexOf('is-drag-source'), -1);
});


QUnit.test('drag handles follow layout, source mode and loose images',
	function (assert) {
		var pixel = 'data:image/gif;base64,' +
			'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
		var body;
		var quoteTop;

		function blocks() {
			return Array.prototype.filter.call(body.children, function (el) {
				return !el.classList.contains('sceditor-rail') &&
					!el.classList.contains('sceditor-nlf');
			});
		}

		function assertHandlesSitOnBlocks() {
			var items = blocks();
			var handles = body.querySelectorAll('.sceditor-drag');
			var i;
			var top;

			assert.strictEqual(handles.length, items.length);

			if (handles.length < 2) {
				assert.ok(false, 'handles ' + handles.length);
				return;
			}

			for (i = 0; i < items.length; i++) {
				top = parseFloat(handles[i].style.top);
				assert.ok(
					Math.abs(top - (items[i].offsetTop + 2)) <= 1,
					items[i].nodeName
				);
			}

			assert.ok(parseFloat(handles[1].style.top) >
				parseFloat(handles[0].style.top));
		}

		reloadEditor({
			format: 'xhtml'
		});
		sceditor.val(
			'<h2>Заголовок</h2>' +
			'<p>слово слово слово слово слово слово слово слово ' +
			'слово слово слово слово слово слово слово слово</p>' +
			'<blockquote>Цитата, которой нужна ширина колонки, ' +
			'чтобы переносы строк сдвинули всё, что стоит ниже.' +
			'</blockquote>' +
			'<ul><li>пункт</li><li>ещё пункт</li></ul>' +
			'<table><tbody><tr><td>ячейка</td><td>вторая</td></tr>' +
			'</tbody></table>' +
			'<p><img alt="" src="' + pixel + '"></p>' +
			'<img alt="" src="' + pixel + '">' +
			'<img alt="" src="' + pixel + '">',
			false
		);

		body = sceditor.getBody();

		assert.strictEqual(body.querySelectorAll(':scope > img').length, 0);
		assert.ok(body.querySelectorAll('p img').length >= 3);
		assertHandlesSitOnBlocks();

		quoteTop = body.querySelector('blockquote').offsetTop;
		sceditor.width(140);
		assert.ok(body.querySelector('blockquote').offsetTop > quoteTop);
		assertHandlesSitOnBlocks();

		sceditor.sourceMode(true);
		sceditor.sourceMode(false);
		body = sceditor.getBody();
		assertHandlesSitOnBlocks();

		assert.strictEqual(sceditor.val().indexOf('sceditor-drag'), -1);
		assert.strictEqual(sceditor.val().indexOf('sceditor-rail'), -1);
	}
);


