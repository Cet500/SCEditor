var testMemoryLeaks = function (pos) {
	pos = pos || 1;

	var textarea = document.getElementById('testarea');

	sceditor.create(textarea, {
		autofocus: true,
		autofocusEnd: true,
		enablePasteFiltering: true,
		style: '../../../src/themes/content/default.css'
	});

	sceditor.instance(textarea).destroy();
	$('#progress').width(pos + '%');

	if (pos <= 100) {
		setTimeout(function () {
			testMemoryLeaks(pos + 1);
		});
	}
};

$(function () {
	$('input[type="submit"]').click(function () {
		testMemoryLeaks();

		return false;
	});
});
