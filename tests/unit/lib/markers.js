import * as markers from 'src/lib/markers.js';

QUnit.module('lib/markers');


QUnit.test('enabled() keeps known kinds only', function (assert) {
	assert.deepEqual(markers.enabled(''), {});
	assert.deepEqual(markers.enabled('image, nope ,FA'), {
		image: true,
		fa: true
	});
	assert.deepEqual(markers.enabled(['blog', 'gallery']), {
		blog: true,
		gallery: true
	});
});


QUnit.test('placeholders() leaves disabled kinds as text', function (assert) {
	var html = '<p>[image 2]</p> [fa plus] [blog 9]';

	assert.strictEqual(
		markers.placeholders(html, markers.enabled('fa')),
		'<p>[image 2]</p> ' +
			'<span class="sceditor-marker sceditor-marker-fa ' +
			'sceditor-marker-fa-solid">' +
			'<span class="sceditor-marker-name">plus</span></span>' +
			' [blog 9]'
	);
});


QUnit.test('placeholders() draws a numbered block', function (assert) {
	var kinds = markers.enabled('image,gallery,blog,fa');

	assert.strictEqual(
		markers.placeholders('<p>[image 2]</p>', kinds),
		'<span class="sceditor-marker sceditor-marker-image">' +
			'<span class="sceditor-marker-kind">image</span>' +
			'<span class="sceditor-marker-num">2</span></span>'
	);
	assert.strictEqual(
		markers.placeholders('<p>ряд [gallery 1 3]</p>', kinds),
		'<p>ряд <span class="sceditor-marker sceditor-marker-gallery">' +
			'<span class="sceditor-marker-kind">gallery</span>' +
			'<span class="sceditor-marker-num">1\u20133</span></span></p>'
	);
	assert.strictEqual(
		markers.placeholders('<pre><code>[image 1]</code></pre>', kinds),
		'<pre><code>[image 1]</code></pre>'
	);
	assert.ok(
		markers.placeholders('[fa brands telegram]', kinds)
			.indexOf('sceditor-marker-fa-brands') > -1
	);
	assert.ok(
		markers.placeholders(
			'<p title="[image 4]">текст</p>',
			kinds
		).indexOf('title="[image 4]"') > -1
	);
});


QUnit.test('protect() and expand() round-trip the marker string',
	function (assert) {
		var root = document.createElement('div');

		root.innerHTML = '<p>до [image  7] после</p><pre>[image 1]</pre>';
		markers.protect(root, markers.enabled('image'));

		assert.strictEqual(
			root.querySelectorAll('.sceditor-marker').length,
			1
		);
		assert.strictEqual(
			root.querySelector('.sceditor-marker')
				.getAttribute('data-sceditor-marker'),
			'[image 7]'
		);
		assert.strictEqual(
			root.querySelector('.sceditor-marker').getAttribute(
				'contenteditable'
			),
			'false'
		);
		assert.strictEqual(root.querySelector('pre').textContent, '[image 1]');

		markers.expand(root);
		assert.strictEqual(
			root.querySelectorAll('.sceditor-marker').length,
			0
		);
		assert.strictEqual(
			root.querySelector('p').textContent,
			'до [image 7] после'
		);
	}
);


QUnit.test('protect() keeps a caret beside a lone marker', function (assert) {
	var root = document.createElement('div');
	var fixture = document.getElementById('qunit-fixture');
	var chips;
	var chip;
	var text;
	var range;

	root.innerHTML = '<p>[fa brand Telegram]</p><p>ab [image 3] cd</p>';
	fixture.appendChild(root);
	markers.protect(root, markers.enabled('fa,image'));

	chips = root.querySelectorAll('.sceditor-marker');
	assert.strictEqual(
		chips[0].getAttribute('data-sceditor-marker'),
		'[fa brands telegram]'
	);
	assert.strictEqual(chips[0].previousSibling.nodeValue, '\u200B');
	assert.strictEqual(chips[0].nextSibling.nodeValue, '\u200B');

	chip = chips[1];
	text = chip.previousSibling;
	range = document.createRange();
	range.setStart(text, text.nodeValue.length);
	range.collapse(true);
	assert.strictEqual(markers.adjacentMarker(range, -1), null);
	assert.strictEqual(markers.adjacentMarker(range, 1), chip);

	range.setStart(chips[0].nextSibling, 0);
	range.collapse(true);
	assert.strictEqual(markers.adjacentMarker(range, -1), chips[0]);

	markers.removeChip(chips[0]);
	assert.strictEqual(root.querySelectorAll('.sceditor-marker').length, 1);
	assert.ok(root.querySelector('br'));

	markers.expand(root);
	assert.strictEqual(
		root.querySelectorAll('p')[1].textContent,
		'ab [image 3] cd'
	);
	assert.strictEqual(root.textContent.indexOf('\u200B'), -1);
});


QUnit.test('labelBlocks() names a lone marker and leaves mixed text',
	function (assert) {
		var root = document.createElement('div');

		root.innerHTML = '<p>[image 2]</p>' +
			'<p>иконка [fa plus] тут</p>' +
			'<p><img src="mark.svg" alt=""></p>' +
			'<p class="sceditor-nlf"><br></p>';
		markers.protect(root, markers.enabled('image,fa'));

		assert.ok(root.children[0].classList.contains('sceditor-block-image'));
		assert.strictEqual(
			root.children[1].className.indexOf('sceditor-block-'),
			-1
		);
		assert.ok(root.children[2].classList.contains('sceditor-block-img'));
		assert.strictEqual(
			root.children[3].className.indexOf('sceditor-block-'),
			-1
		);

		assert.strictEqual(root.querySelectorAll('.sceditor-drag').length, 3);

		markers.clearBlockLabels(root);
		assert.strictEqual(root.innerHTML.indexOf('sceditor-block-'), -1);
		assert.strictEqual(root.innerHTML.indexOf('sceditor-rail'), -1);
		assert.strictEqual(
			root.querySelector('.sceditor-marker')
				.getAttribute('data-sceditor-marker'),
			'[image 2]'
		);
	}
);
