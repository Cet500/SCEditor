import * as dom from './dom.js';
import * as utils from './utils.js';
import defaultOptions from './defaultOptions.js';
import defaultCommands from './defaultCommands.js';
import PluginManager from './PluginManager.js';
import RangeHelper from './RangeHelper.js';
import _tmpl from './templates.js';
import * as escape from './escape.js';
import * as browser from './browser.js';
import { highlightSource } from './sourceHighlight.js';
import * as markers from './markers.js';
import DOMPurify from 'dompurify';

var globalWin  = window;
var globalDoc  = document;

var IMAGE_MIME_REGEX = /^image\/(p?jpe?g|gif|png|bmp)$/i;

/**
 * Wrap inlines that are in the root in paragraphs.
 *
 * @param {HTMLBodyElement} body
 * @param {Document} doc
 * @private
 */
function wrapInlines(body, doc) {
	var wrapper;

	dom.traverse(body, function (node) {
		if (dom.isInline(node, true)) {
			// Ignore text nodes unless they contain non-whitespace chars as
			// whitespace will be collapsed.
			// Ignore sceditor-ignore elements unless wrapping siblings
			// Should still wrap both if wrapping siblings.
			if (wrapper || node.nodeType === dom.TEXT_NODE ?
				/\S/.test(node.nodeValue) : !dom.is(node, '.sceditor-ignore')) {
				if (!wrapper) {
					wrapper = dom.createElement('p', {}, doc);
					dom.insertBefore(wrapper, node);
				}

				dom.appendChild(wrapper, node);
			}
		} else {
			wrapper = null;
		}
	}, false, true);
};

/**
 * SCEditor - A lightweight WYSIWYG editor
 *
 * @param {HTMLTextAreaElement} original The textarea to be converted
 * @param {Object} userOptions
 * @class SCEditor
 * @name SCEditor
 */
export default function SCEditor(original, userOptions) {
	/**
	 * Alias of this
	 *
	 * @private
	 */
	var base = this;

	/**
	 * Editor format, for example XHTML
	 */
	var format;

	/**
	 * The div which contains the editor and toolbar
	 *
	 * @type {HTMLDivElement}
	 * @private
	 */
	var editorContainer;

	/**
	 * Map of events handlers bound to this instance.
	 *
	 * @type {Object}
	 * @private
	 */
	var eventHandlers = {};

	/**
	 * The editors toolbar
	 *
	 * @type {HTMLDivElement}
	 * @private
	 */
	var toolbar;

	/**
	 * The editors iframe which should be in design mode
	 *
	 * @type {HTMLIFrameElement}
	 * @private
	 */
	var wysiwygEditor;

	/**
	 * Read-only iframe that shows the content with the preview styles
	 *
	 * @type {HTMLIFrameElement}
	 * @private
	 */
	var previewEditor;

	/**
	 * The editors window
	 *
	 * @type {Window}
	 * @private
	 */
	var wysiwygWindow;

	/**
	 * The WYSIWYG editors body element
	 *
	 * @type {HTMLBodyElement}
	 * @private
	 */
	var wysiwygBody;

	/**
	 * The WYSIWYG editors document
	 *
	 * @type {Document}
	 * @private
	 */
	var wysiwygDocument;

	/**
	 * The editors textarea for viewing source
	 *
	 * @type {HTMLTextAreaElement}
	 * @private
	 */
	var sourceEditor;
	var sourceWrap;
	var sourceView;

	/**
	 * The current dropdown
	 *
	 * @type {HTMLDivElement}
	 * @private
	 */
	var dropdown;

	/**
	 * If the user is currently composing text via IME
	 * @type {boolean}
	 */
	var isComposing;

	/**
	 * Timer for valueChanged key handler
	 * @type {number}
	 */
	var valueChangedKeyUpTimer;

	/**
	 * The editors locale
	 *
	 * @private
	 */
	var locale;

	/**
	 * The editors rangeHelper instance
	 *
	 * @type {RangeHelper}
	 * @private
	 */
	var rangeHelper;

	/**
	 * An array of button state handlers
	 *
	 * @type {Array.<Object>}
	 * @private
	 */
	var btnStateHandlers = [];

	/**
	 * Plugin manager instance
	 *
	 * @type {PluginManager}
	 * @private
	 */
	var pluginManager;

	/**
	 * The current node containing the selection/caret
	 *
	 * @type {Node}
	 * @private
	 */
	var currentNode;

	/**
	 * The first block level parent of the current node
	 *
	 * @type {node}
	 * @private
	 */
	var currentBlockNode;

	/**
	 * The current node selection/caret
	 *
	 * @type {Object}
	 * @private
	 */
	var currentSelection;

	/**
	 * Used to make sure only 1 selection changed
	 * check is called every 100ms.
	 *
	 * Helps improve performance as it is checked a lot.
	 *
	 * @type {boolean}
	 * @private
	 */
	var isSelectionCheckPending;

	/**
	 * If content is required (equivalent to the HTML5 required attribute)
	 *
	 * @type {boolean}
	 * @private
	 */
	var isRequired;

	/**
	 * The inline CSS style element. Will be undefined
	 * until css() is called for the first time.
	 *
	 * @type {HTMLStyleElement}
	 * @private
	 */
	var inlineCss;

	/**
	 * Object containing a list of shortcut handlers
	 *
	 * @type {Object}
	 * @private
	 */
	var shortcutHandlers = {};

	/**
	 * The min and max heights that autoExpand should stay within
	 *
	 * @type {Object}
	 * @private
	 */
	var autoExpandBounds;

	/**
	 * Timeout for the autoExpand function to throttle calls
	 *
	 * @private
	 */
	var autoExpandThrottle;

	/**
	 * Cache of the current toolbar buttons
	 *
	 * @type {Object}
	 * @private
	 */
	var toolbarButtons = {};

	/**
	 * Last scroll position before maximizing so
	 * it can be restored when finished.
	 *
	 * @type {number}
	 * @private
	 */
	var maximizeScrollPosition;

	/**
	 * Stores the contents while a paste is taking place.
	 *
	 * Needed to support browsers that lack clipboard API support.
	 *
	 * @type {?DocumentFragment}
	 * @private
	 */
	var pasteContentFragment;

	/**
	 * Current icon set if any
	 *
	 * @type {?Object}
	 * @private
	 */
	var icons;

	/**
	 * Private functions
	 * @private
	 */
	var	init,
		handleCommand,
		initEditor,
		initLocale,
		initToolBar,
		initOptions,
		initEvents,
		initResize,
		handlePasteEvt,
		handleCutCopyEvt,
		handlePasteData,
		handleKeyDown,
		handleMarkerKey,
		handleBackSpace,
		handleKeyPress,
		startBlockDrag,
		moveBlockDrag,
		finishBlockDrag,
		dragState,
		handleFormReset,
		handleMouseDown,
		handleComposition,
		handleEvent,
		handleDocumentClick,
		updateToolBar,
		updateActiveButtons,
		sourceEditorSelectedText,
		appendNewLine,
		checkSelectionChanged,
		checkNodeChanged,
		autofocus,
		currentStyledBlockNode,
		triggerValueChanged,
		valueChangedBlur,
		valueChangedKeyUp,
		autoUpdate,
		autoExpand;

	/**
	 * All the commands supported by the editor
	 * @name commands
	 * @memberOf SCEditor.prototype
	 */
	base.commands = utils
		.extend(true, {}, (userOptions.commands || defaultCommands));

	/**
	 * Options for this editor instance
	 * @name opts
	 * @memberOf SCEditor.prototype
	 */
	var options = base.opts = utils.extend(
		true, {}, defaultOptions, userOptions
	);

	if (!Array.isArray(options.allowedIframeUrls)) {
		options.allowedIframeUrls = [];
	}
	options.allowedIframeUrls.push('https://www.youtube-nocookie.com/embed/');

	// Create new instance of DOMPurify for each editor instance so can
	// have different allowed iframe URLs
	// eslint-disable-next-line new-cap
	var domPurify = DOMPurify();

	// Allow iframes for things like YouTube, see:
	// https://github.com/cure53/DOMPurify/issues/340#issuecomment-670758980
	domPurify.addHook('uponSanitizeElement', function (node, data) {
		var allowedUrls = options.allowedIframeUrls;

		if (data.tagName === 'iframe') {
			var src = dom.attr(node, 'src') || '';

			for (var i = 0; i < allowedUrls.length; i++) {
				var url = allowedUrls[i];

				if (utils.isString(url) && src.substr(0, url.length) === url) {
					return;
				}

				// Handle regex
				if (url.test && url.test(src)) {
					return;
				}
			}

			// No match so remove
			dom.remove(node);
		}
	});

	// Convert target attribute into data-sce-target attributes so XHTML format
	// can allow them
	domPurify.addHook('afterSanitizeAttributes', function (node) {
		if ('target' in node) {
			dom.attr(node, 'data-sce-target', dom.attr(node, 'target'));
		}

		dom.removeAttr(node, 'target');
	});

	/**
	 * Sanitize HTML to avoid XSS
	 *
	 * @param {string} html
	 * @return {string} html
	 * @private
	 */
	function sanitize(html) {
		const allowedTags = ['iframe'].concat(options.allowedTags);
		const allowedAttrs = ['allowfullscreen', 'frameborder', 'target']
			.concat(options.allowedAttributes);

		return domPurify.sanitize(html, {
			ADD_TAGS: allowedTags,
			ADD_ATTR: allowedAttrs
		});
	};

	// eslint-disable-next-line camelcase
	base.__UNSTABLE__sanitize = sanitize;

	/**
	 * Creates the editor iframe and textarea
	 * @private
	 */
	init = function () {
		original._sceditor = base;

		// Load locale
		if (options.locale && options.locale !== 'en') {
			initLocale();
		}

		editorContainer = dom.createElement('div', {
			className: 'sceditor-container'
		});

		dom.insertBefore(editorContainer, original);
		dom.css(editorContainer, 'z-index', options.zIndex);

		isRequired = original.required;
		original.required = false;

		var FormatCtor = SCEditor.formats[options.format];
		format = FormatCtor ? new FormatCtor() : {};
		/*
		 * Plugins should be initialized before the formatters since
		 * they may wish to add or change formatting handlers and
		 * a format may cache its handlers, so such changes must
		 * be done first.
		 */
		pluginManager = new PluginManager(base);
		(options.plugins || '').split(',').forEach(function (plugin) {
			pluginManager.register(plugin.trim());
		});
		if ('init' in format) {
			format.init.call(base);
		}

		// create the editor
		initToolBar();
		initEditor();
		initOptions();
		initEvents();

		// force into source mode if is a browser that can't handle
		// full editing
		if (!browser.isWysiwygSupported) {
			base.toggleSourceMode();
		}

		updateActiveButtons();

		var loaded = function () {
			dom.off(globalWin, 'load', loaded);

			if (options.autofocus) {
				autofocus(!!options.autofocusEnd);
			}

			autoExpand();
			appendNewLine();
			// TODO: use editor doc and window?
			pluginManager.call('ready');
			if ('onReady' in format) {
				format.onReady.call(base);
			}
		};
		dom.on(globalWin, 'load', loaded);
		if (globalDoc.readyState === 'complete') {
			loaded();
		}
	};

	/**
	 * Init the locale variable with the specified locale if possible
	 * @private
	 * @return void
	 */
	initLocale = function () {
		var lang;

		locale = SCEditor.locale[options.locale];

		if (!locale) {
			lang   = options.locale.split('-');
			locale = SCEditor.locale[lang[0]];
		}

		// Locale DateTime format overrides any specified in the options
		if (locale && locale.dateFormat) {
			options.dateFormat = locale.dateFormat;
		}
	};

	/**
	 * Creates the editor iframe and textarea
	 * @private
	 */
	initEditor = function () {
		sourceEditor  = dom.createElement('textarea');
		sourceView    = dom.createElement('pre', {
			className: 'sceditor-source-view'
		});
		sourceWrap    = dom.createElement('div', {
			className: 'sceditor-source'
		});
		dom.attr(sourceView, 'aria-hidden', 'true');
		dom.attr(sourceEditor, 'spellcheck', 'false');
		dom.attr(sourceEditor, 'wrap', 'soft');
		dom.attr(sourceEditor, 'autocomplete', 'off');
		dom.attr(sourceEditor, 'autocapitalize', 'off');
		dom.attr(sourceEditor, 'autocorrect', 'off');
		dom.appendChild(sourceWrap, sourceView);
		dom.appendChild(sourceWrap, sourceEditor);

		wysiwygEditor = dom.createElement('iframe', {
			frameborder: 0,
			allowfullscreen: true
		});
		previewEditor = dom.createElement('iframe', {
			frameborder: 0,
			className: 'sceditor-preview'
		});

		/*
		 * This needs to be done right after they are created because,
		 * for any reason, the user may not want the value to be tinkered
		 * by any filters.
		 */
		if (options.startInSourceMode) {
			dom.addClass(editorContainer, 'sourceMode');
			dom.hide(wysiwygEditor);
		} else {
			dom.addClass(editorContainer, 'wysiwygMode');
			dom.hide(sourceWrap);
		}

		dom.hide(previewEditor);

		if (!options.spellcheck) {
			dom.attr(editorContainer, 'spellcheck', 'false');
		}

		if (globalWin.location.protocol === 'https:') {
			dom.attr(wysiwygEditor, 'src', 'about:blank');
		}

		// Add the editor to the container
		dom.appendChild(editorContainer, wysiwygEditor);
		dom.appendChild(editorContainer, previewEditor);
		dom.appendChild(editorContainer, sourceWrap);

		// TODO: make this optional somehow
		base.dimensions(
			options.width || dom.width(original),
			options.height || dom.height(original)
		);

		if (!domPurify.isValidAttribute('link', 'href', options.style)) {
			options.style = '';
		}

		if (!/^[a-z\-0-9 ]+$/i.test(options.charset)) {
			options.charset = 'UTF-8';
		}

		wysiwygDocument = wysiwygEditor.contentDocument;
		wysiwygDocument.open();
		wysiwygDocument.write(_tmpl('html', {
			// Add ios to HTML so can apply CSS fix to only it
			attrs: browser.ios ? ' class="ios"' : '',
			spellcheck: options.spellcheck ? '' : 'spellcheck="false"',
			charset: options.charset,
			style: escape.entities(options.style)
		}, false, false));
		wysiwygDocument.close();

		wysiwygBody = wysiwygDocument.body;
		wysiwygWindow = wysiwygEditor.contentWindow;

		base.readOnly(!!options.readOnly);

		// iframe overflow fix for iOS
		if (browser.ios) {
			dom.height(wysiwygBody, '100%');
			dom.on(wysiwygBody, 'touchend', base.focus);
		}

		var tabIndex = dom.attr(original, 'tabindex');
		dom.attr(sourceEditor, 'tabindex', tabIndex);
		dom.attr(wysiwygEditor, 'tabindex', tabIndex);

		rangeHelper = new RangeHelper(wysiwygWindow, null, sanitize);

		// load any textarea value into the editor
		dom.hide(original);
		base.val(original.value);

		var placeholder = options.placeholder ||
			dom.attr(original, 'placeholder');

		if (placeholder) {
			sourceEditor.placeholder = placeholder;
			dom.attr(wysiwygBody, 'placeholder', placeholder);
		}
	};

	/**
	 * Initialises options
	 * @private
	 */
	initOptions = function () {
		// auto-update original textbox on blur if option set to true
		if (options.autoUpdate) {
			dom.on(wysiwygBody, 'blur', autoUpdate);
			dom.on(sourceEditor, 'blur', autoUpdate);
		}

		if (options.rtl === null) {
			options.rtl = dom.css(sourceEditor, 'direction') === 'rtl';
		}

		base.rtl(!!options.rtl);

		if (options.autoExpand) {
			// Need to update when images (or anything else) loads
			dom.on(wysiwygBody, 'load', autoExpand, dom.EVENT_CAPTURE);
			dom.on(wysiwygBody, 'input keyup', autoExpand);
		}

		if (options.resizeEnabled) {
			initResize();
		}

		dom.attr(editorContainer, 'id', options.id);
	};

	/**
	 * Initialises events
	 * @private
	 */
	initEvents = function () {
		var form = original.form;
		var compositionEvents = 'compositionstart compositionend';
		var eventsToForward =
			'keydown keyup keypress focus blur contextmenu input';
		var checkSelectionEvents = 'onselectionchange' in wysiwygDocument ?
			'selectionchange' :
			'keyup focus blur contextmenu mouseup touchend click';

		dom.on(globalDoc, 'click', handleDocumentClick);

		if (form) {
			dom.on(form, 'reset', handleFormReset);
			dom.on(form, 'submit', base.updateOriginal, dom.EVENT_CAPTURE);
		}

		dom.on(window, 'pagehide', base.updateOriginal);
		dom.on(window, 'pageshow', handleFormReset);
		dom.on(wysiwygBody, 'keypress', handleKeyPress);
		dom.on(wysiwygBody, 'keydown', handleMarkerKey);
		dom.on(wysiwygBody, 'keydown', handleKeyDown);
		dom.on(wysiwygBody, 'keydown', handleBackSpace);
		dom.on(wysiwygBody, 'pointerdown', startBlockDrag);
		dom.on(wysiwygBody, 'load', function (e) {
			if (dragState || dom.closest(e.target, '.sceditor-ghost')) {
				return;
			}

			markers.labelBlocks(wysiwygBody);
		}, dom.EVENT_CAPTURE);
		dom.on(wysiwygBody, 'input', protectWysiwygMarkers);
		dom.on(wysiwygBody, 'keyup', appendNewLine);
		dom.on(wysiwygBody, 'blur', valueChangedBlur);
		dom.on(wysiwygBody, 'keyup', valueChangedKeyUp);
		dom.on(wysiwygBody, 'paste', handlePasteEvt);
		dom.on(wysiwygBody, 'cut copy', handleCutCopyEvt);
		dom.on(wysiwygBody, compositionEvents, handleComposition);
		dom.on(wysiwygBody, checkSelectionEvents, checkSelectionChanged);
		dom.on(wysiwygBody, eventsToForward, handleEvent);

		dom.on(wysiwygBody, 'blur', function () {
			if (!base.val()) {
				dom.addClass(wysiwygBody, 'placeholder');
			}
		});

		dom.on(wysiwygBody, 'focus', function () {
			dom.removeClass(wysiwygBody, 'placeholder');
		});

		dom.on(sourceEditor, 'blur', valueChangedBlur);
		dom.on(sourceEditor, 'keyup', valueChangedKeyUp);
		dom.on(sourceEditor, 'keydown', handleKeyDown);
		dom.on(sourceEditor, 'input', refreshSourceHighlight);
		dom.on(sourceEditor, 'scroll', syncSourceScroll);
		dom.on(sourceEditor, 'keyup mouseup select', syncSourceSelection);
		dom.on(globalDoc, 'selectionchange', syncSourceSelection);
		dom.on(sourceEditor, compositionEvents, handleComposition);
		dom.on(sourceEditor, eventsToForward, handleEvent);

		dom.on(wysiwygDocument, 'mousedown', handleMouseDown);
		dom.on(wysiwygDocument, checkSelectionEvents, checkSelectionChanged);
		dom.on(wysiwygDocument, 'keyup', appendNewLine);

		dom.on(editorContainer, 'selectionchanged', checkNodeChanged);
		dom.on(editorContainer, 'selectionchanged', updateActiveButtons);
		// Custom events to forward
		dom.on(
			editorContainer,
			'selectionchanged valuechanged nodechanged pasteraw paste',
			handleEvent
		);
	};

	/**
	 * Creates the toolbar and appends it to the container
	 * @private
	 */
	initToolBar = function () {
		var	group,
			commands = base.commands,
			exclude  = (options.toolbarExclude || '').split(','),
			groups   = options.toolbar.split('|');

		toolbar = dom.createElement('div', {
			className: 'sceditor-toolbar',
			unselectable: 'on'
		});

		if (options.icons in SCEditor.icons) {
			icons = new SCEditor.icons[options.icons]();
		}

		utils.each(groups, function (_, menuItems) {
			var commandNames = menuItems.split(',');
			var isViewGroup = commandNames.every(function (commandName) {
				var viewCommand = commands[commandName];

				return viewCommand && viewCommand.view;
			});

			group = dom.createElement('div', {
				className: 'sceditor-group' +
					(isViewGroup ? ' sceditor-group-views' : '')
			});

			utils.each(commandNames, function (_, commandName) {
				var	button, shortcut,
					command  = commands[commandName];

				// The commandName must be a valid command and not excluded
				if (!command || exclude.indexOf(commandName) > -1) {
					return;
				}

				shortcut = command.shortcut;
				button   = _tmpl('toolbarButton', {
					name: commandName,
					dispName: base._(command.name ||
							command.tooltip || commandName)
				}, true).firstChild;

				if (isViewGroup) {
					dom.addClass(button, 'text');
				}

				if (icons && icons.create) {
					var icon = icons.create(commandName);
					if (icon) {
						dom.insertBefore(icons.create(commandName),
							button.firstChild);
						dom.addClass(button, 'has-icon');
					}
				}

				button._sceTxtMode = !!command.txtExec;
				button._sceWysiwygMode = !!command.exec;
				button._sceView = !!command.view;
				button._scePreview = !!command.allowInPreview;
				dom.toggleClass(button, 'disabled', !command.exec);
				dom.on(button, 'click', function (e) {
					if (!dom.hasClass(button, 'disabled')) {
						handleCommand(button, command);
					}

					updateActiveButtons();
					e.preventDefault();
				});
				// Prevent editor losing focus when button clicked
				dom.on(button, 'mousedown', function (e) {
					base.closeDropDown();
					e.preventDefault();
				});

				if (command.tooltip) {
					dom.attr(button, 'title',
						base._(command.tooltip) +
							(shortcut ? ' (' + shortcut + ')' : '')
					);
				}

				if (shortcut) {
					base.addShortcut(shortcut, command.key || commandName);
				}

				if (command.state) {
					btnStateHandlers.push({
						name: commandName,
						state: command.state
					});
				// exec string commands can be passed to queryCommandState
				} else if (utils.isString(command.exec)) {
					btnStateHandlers.push({
						name: commandName,
						state: command.exec
					});
				}

				dom.appendChild(group, button);
				toolbarButtons[commandName] = button;
			});

			// Exclude empty groups
			if (group.firstChild) {
				dom.appendChild(toolbar, group);
			}
		});

		// Append the toolbar to the toolbarContainer option if given
		dom.appendChild(options.toolbarContainer || editorContainer, toolbar);
	};

	/**
	 * Creates the resizer.
	 * @private
	 */
	initResize = function () {
		var	minHeight, maxHeight, minWidth, maxWidth,
			mouseMoveFunc, mouseUpFunc,
			grip        = dom.createElement('div', {
				className: 'sceditor-grip'
			}),
			// Cover is used to cover the editor iframe so document
			// still gets mouse move events
			cover       = dom.createElement('div', {
				className: 'sceditor-resize-cover'
			}),
			moveEvents  = 'touchmove mousemove',
			endEvents   = 'touchcancel touchend mouseup',
			startX      = 0,
			startY      = 0,
			newX        = 0,
			newY        = 0,
			startWidth  = 0,
			startHeight = 0,
			origWidth   = dom.width(editorContainer),
			origHeight  = dom.height(editorContainer),
			isDragging  = false,
			rtl         = base.rtl();

		minHeight = options.resizeMinHeight || origHeight / 1.5;
		maxHeight = options.resizeMaxHeight || origHeight * 2.5;
		minWidth  = options.resizeMinWidth  || origWidth  / 1.25;
		maxWidth  = options.resizeMaxWidth  || origWidth  * 1.25;

		mouseMoveFunc = function (e) {
			// iOS uses window.event
			if (e.type === 'touchmove') {
				e    = globalWin.event;
				newX = e.changedTouches[0].pageX;
				newY = e.changedTouches[0].pageY;
			} else {
				newX = e.pageX;
				newY = e.pageY;
			}

			var	newHeight = startHeight + (newY - startY),
				newWidth  = rtl ?
					startWidth - (newX - startX) :
					startWidth + (newX - startX);

			if (maxWidth > 0 && newWidth > maxWidth) {
				newWidth = maxWidth;
			}
			if (minWidth > 0 && newWidth < minWidth) {
				newWidth = minWidth;
			}
			if (!options.resizeWidth) {
				newWidth = false;
			}

			if (maxHeight > 0 && newHeight > maxHeight) {
				newHeight = maxHeight;
			}
			if (minHeight > 0 && newHeight < minHeight) {
				newHeight = minHeight;
			}
			if (!options.resizeHeight) {
				newHeight = false;
			}

			if (newWidth || newHeight) {
				base.dimensions(newWidth, newHeight);
			}

			e.preventDefault();
		};

		mouseUpFunc = function (e) {
			if (!isDragging) {
				return;
			}

			isDragging = false;

			dom.hide(cover);
			dom.removeClass(editorContainer, 'resizing');
			dom.off(globalDoc, moveEvents, mouseMoveFunc);
			dom.off(globalDoc, endEvents, mouseUpFunc);

			e.preventDefault();
		};

		if (icons && icons.create) {
			var icon = icons.create('grip');
			if (icon) {
				dom.appendChild(grip, icon);
				dom.addClass(grip, 'has-icon');
			}
		}

		dom.appendChild(editorContainer, grip);
		dom.appendChild(editorContainer, cover);
		dom.hide(cover);

		dom.on(grip, 'touchstart mousedown', function (e) {
			// iOS uses window.event
			if (e.type === 'touchstart') {
				e      = globalWin.event;
				startX = e.touches[0].pageX;
				startY = e.touches[0].pageY;
			} else {
				startX = e.pageX;
				startY = e.pageY;
			}

			startWidth  = dom.width(editorContainer);
			startHeight = dom.height(editorContainer);
			isDragging  = true;

			dom.addClass(editorContainer, 'resizing');
			dom.show(cover);
			dom.on(globalDoc, moveEvents, mouseMoveFunc);
			dom.on(globalDoc, endEvents, mouseUpFunc);

			e.preventDefault();
		});
	};

	/**
	 * Autofocus the editor
	 * @private
	 */
	var skipChrome = function (node, fromEnd) {
		while (node && dom.is(node, '.sceditor-rail,.sceditor-drop,' +
			'.sceditor-ghost,.sceditor-ignore')) {
			node = fromEnd ? node.previousSibling : node.nextSibling;
		}

		return node;
	};

	autofocus = function (focusEnd) {
		var	range, txtPos,
			node = skipChrome(wysiwygBody.firstChild, false);

		// Can't focus invisible elements
		if (!dom.isVisible(editorContainer)) {
			return;
		}

		if (base.sourceMode()) {
			txtPos = focusEnd ? sourceEditor.value.length : 0;

			sourceEditor.setSelectionRange(txtPos, txtPos);

			return;
		}

		dom.removeWhiteSpace(wysiwygBody);

		if (focusEnd) {
			node = skipChrome(wysiwygBody.lastChild, true);

			if (!node) {
				node = dom.createElement('p', {}, wysiwygDocument);
				dom.appendChild(wysiwygBody, node);
			}

			while (node.lastChild) {
				node = node.lastChild;

				// Should place the cursor before the last <br>
				if (dom.is(node, 'br') && node.previousSibling) {
					node = node.previousSibling;
				}
			}
		}

		range = wysiwygDocument.createRange();

		if (!dom.canHaveChildren(node)) {
			range.setStartBefore(node);

			if (focusEnd) {
				range.setStartAfter(node);
			}
		} else {
			range.selectNodeContents(node);
		}

		range.collapse(!focusEnd);
		rangeHelper.selectRange(range);
		currentSelection = range;

		if (focusEnd) {
			wysiwygBody.scrollTop = wysiwygBody.scrollHeight;
		}

		base.focus();
	};

	/**
	 * Gets if the editor is read only
	 *
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name readOnly
	 * @return {boolean}
	 */
	/**
	 * Sets if the editor is read only
	 *
	 * @param {boolean} readOnly
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name readOnly^2
	 * @return {this}
	 */
	base.readOnly = function (readOnly) {
		if (typeof readOnly !== 'boolean') {
			return sourceEditor.readOnly;
		}

		wysiwygBody.contentEditable = !readOnly;
		sourceEditor.readOnly = readOnly;

		updateToolBar(readOnly);

		return base;
	};

	/**
	 * Gets if the editor is in RTL mode
	 *
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name rtl
	 * @return {boolean}
	 */
	/**
	 * Sets if the editor is in RTL mode
	 *
	 * @param {boolean} rtl
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name rtl^2
	 * @return {this}
	 */
	base.rtl = function (rtl) {
		var dir = rtl ? 'rtl' : 'ltr';

		if (typeof rtl !== 'boolean') {
			return dom.attr(sourceEditor, 'dir') === 'rtl';
		}

		dom.attr(wysiwygBody, 'dir', dir);
		dom.attr(sourceEditor, 'dir', dir);

		dom.removeClass(editorContainer, 'rtl');
		dom.removeClass(editorContainer, 'ltr');
		dom.addClass(editorContainer, dir);

		if (icons && icons.rtl) {
			icons.rtl(rtl);
		}

		return base;
	};

	/**
	 * Updates the toolbar to disable/enable the appropriate buttons
	 * @private
	 */
	updateToolBar = function (disable) {
		var inSource = base.inSourceMode();
		var inPreview = base.mode() === 'preview';

		utils.each(toolbarButtons, function (_, button) {
			var off = !!disable;

			if (!off && inPreview) {
				off = !(button._sceView || button._scePreview);
			} else if (!off) {
				off = !button[inSource ? '_sceTxtMode' : '_sceWysiwygMode'];
			}

			dom.toggleClass(button, 'disabled', off);
		});
	};

	/**
	 * Gets the width of the editor in pixels
	 *
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name width
	 * @return {number}
	 */
	/**
	 * Sets the width of the editor
	 *
	 * @param {number} width Width in pixels
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name width^2
	 * @return {this}
	 */
	/**
	 * Sets the width of the editor
	 *
	 * The saveWidth specifies if to save the width. The stored width can be
	 * used for things like restoring from maximized state.
	 *
	 * @param {number}     width            Width in pixels
	 * @param {boolean}	[saveWidth=true] If to store the width
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name width^3
	 * @return {this}
	 */
	base.width = function (width, saveWidth) {
		if (!width && width !== 0) {
			return dom.width(editorContainer);
		}

		base.dimensions(width, null, saveWidth);

		return base;
	};

	/**
	 * Returns an object with the properties width and height
	 * which are the width and height of the editor in px.
	 *
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name dimensions
	 * @return {object}
	 */
	/**
	 * <p>Sets the width and/or height of the editor.</p>
	 *
	 * <p>If width or height is not numeric it is ignored.</p>
	 *
	 * @param {number}	width	Width in px
	 * @param {number}	height	Height in px
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name dimensions^2
	 * @return {this}
	 */
	/**
	 * <p>Sets the width and/or height of the editor.</p>
	 *
	 * <p>If width or height is not numeric it is ignored.</p>
	 *
	 * <p>The save argument specifies if to save the new sizes.
	 * The saved sizes can be used for things like restoring from
	 * maximized state. This should normally be left as true.</p>
	 *
	 * @param {number}		width		Width in px
	 * @param {number}		height		Height in px
	 * @param {boolean}	[save=true]	If to store the new sizes
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name dimensions^3
	 * @return {this}
	 */
	base.dimensions = function (width, height, save) {
		// set undefined width/height to boolean false
		width  = (!width && width !== 0) ? false : width;
		height = (!height && height !== 0) ? false : height;

		if (width === false && height === false) {
			return { width: base.width(), height: base.height() };
		}

		if (width !== false) {
			if (save !== false) {
				options.width = width;
			}

			dom.width(editorContainer, width);
		}

		if (height !== false) {
			if (save !== false) {
				options.height = height;
			}

			dom.height(editorContainer, height);
		}

		return base;
	};

	/**
	 * Gets the height of the editor in px
	 *
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name height
	 * @return {number}
	 */
	/**
	 * Sets the height of the editor
	 *
	 * @param {number} height Height in px
	 * @since 1.3.5
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name height^2
	 * @return {this}
	 */
	/**
	 * Sets the height of the editor
	 *
	 * The saveHeight specifies if to save the height.
	 *
	 * The stored height can be used for things like
	 * restoring from maximized state.
	 *
	 * @param {number} height Height in px
	 * @param {boolean} [saveHeight=true] If to store the height
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name height^3
	 * @return {this}
	 */
	base.height = function (height, saveHeight) {
		if (!height && height !== 0) {
			return dom.height(editorContainer);
		}

		base.dimensions(null, height, saveHeight);

		return base;
	};

	/**
	 * Gets if the editor is maximised or not
	 *
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name maximize
	 * @return {boolean}
	 */
	/**
	 * Sets if the editor is maximised or not
	 *
	 * @param {boolean} maximize If to maximise the editor
	 * @since 1.4.1
	 * @function
	 * @memberOf SCEditor.prototype
	 * @name maximize^2
	 * @return {this}
	 */
	base.maximize = function (maximize) {
		var maximizeSize = 'sceditor-maximize';

		if (utils.isUndefined(maximize)) {
			return dom.hasClass(editorContainer, maximizeSize);
		}

		maximize = !!maximize;

		if (maximize) {
			maximizeScrollPosition = globalWin.pageYOffset;
		}

		dom.toggleClass(globalDoc.documentElement, maximizeSize, maximize);
		dom.toggleClass(globalDoc.body, maximizeSize, maximize);
		dom.toggleClass(editorContainer, maximizeSize, maximize);
		base.width(maximize ? '100%' : options.width, false);
		base.height(maximize ? '100%' : options.height, false);

		if (!maximize) {
			globalWin.scrollTo(0, maximizeScrollPosition);
		}

		autoExpand();

		return base;
	};

	autoExpand = function () {
		if (options.autoExpand && !autoExpandThrottle) {
			autoExpandThrottle = setTimeout(base.expandToContent, 200);
		}
	};

	/**
	 * Expands or shrinks the editors height to the height of it's content
	 *
	 * Unless ignoreMaxHeight is set to true it will not expand
	 * higher than the maxHeight option.
	 *
	 * @since 1.3.5
	 * @param {boolean} [ignoreMaxHeight=false]
	 * @function
	 * @name expandToContent
	 * @memberOf SCEditor.prototype
	 * @see #resizeToContent
	 */
	base.expandToContent = function (ignoreMaxHeight) {
		if (base.maximize()) {
			return;
		}

		clearTimeout(autoExpandThrottle);
		autoExpandThrottle = false;

		if (!autoExpandBounds) {
			var height = options.resizeMinHeight || options.height ||
				dom.height(original);

			autoExpandBounds = {
				min: height,
				max: options.resizeMaxHeight || (height * 2)
			};
		}

		var range = globalDoc.createRange();
		range.selectNodeContents(wysiwygBody);

		var rect = range.getBoundingClientRect();
		var current = wysiwygDocument.documentElement.clientHeight - 1;
		var spaceNeeded = rect.bottom - rect.top;
		var newHeight = base.height() + 1 + (spaceNeeded - current);

		if (!ignoreMaxHeight && autoExpandBounds.max !== -1) {
			newHeight = Math.min(newHeight, autoExpandBounds.max);
		}

		base.height(Math.ceil(Math.max(newHeight, autoExpandBounds.min)));
	};

	/**
	 * Destroys the editor, removing all elements and
	 * event handlers.
	 *
	 * Leaves only the original textarea.
	 *
	 * @function
	 * @name destroy
	 * @memberOf SCEditor.prototype
	 */
	base.destroy = function () {
		// Don't destroy if the editor has already been destroyed
		if (!pluginManager) {
			return;
		}

		pluginManager.destroy();

		rangeHelper   = null;
		pluginManager = null;

		if (dropdown) {
			dom.remove(dropdown);
		}

		dom.off(globalDoc, 'click', handleDocumentClick);
		dom.off(globalDoc, 'selectionchange', syncSourceSelection);

		var form = original.form;
		if (form) {
			dom.off(form, 'reset', handleFormReset);
			dom.off(form, 'submit', base.updateOriginal, dom.EVENT_CAPTURE);
		}

		dom.off(window, 'pagehide', base.updateOriginal);
		dom.off(window, 'pageshow', handleFormReset);
		dom.remove(sourceWrap);
		dom.remove(toolbar);
		dom.remove(editorContainer);

		delete original._sceditor;
		dom.show(original);

		original.required = isRequired;
	};


	/**
	 * Creates a menu item drop down
	 *
	 * @param  {HTMLElement} menuItem The button to align the dropdown with
	 * @param  {string} name          Used for styling the dropdown, will be
	 *                                a class sceditor-name
	 * @param  {HTMLElement} content  The HTML content of the dropdown
	 * @function
	 * @name createDropDown
	 * @memberOf SCEditor.prototype
	 */
	base.createDropDown = function (menuItem, name, content) {
		// first click for create second click for close
		var	dropDownCss,
			dropDownClass = 'sceditor-' + name;

		base.closeDropDown();

		// Only close the dropdown if it was already open
		if (dropdown && dom.hasClass(dropdown, dropDownClass)) {
			return;
		}

		dropDownCss = utils.extend({
			top: menuItem.offsetTop,
			left: menuItem.offsetLeft,
			marginTop: menuItem.clientHeight
		}, options.dropDownCss);

		dropdown = dom.createElement('div', {
			className: 'sceditor-dropdown ' + dropDownClass
		});

		dom.css(dropdown, dropDownCss);
		dom.appendChild(dropdown, content);
		dom.appendChild(editorContainer, dropdown);
		dom.on(dropdown, 'click focusin', function (e) {
			// stop clicks within the dropdown from being handled
			e.stopPropagation();
		});

		if (dropdown) {
			var first = dom.find(dropdown, 'input,textarea')[0];
			if (first) {
				first.focus();
			}
		}
	};

	/**
	 * Handles any document click and closes the dropdown if open
	 * @private
	 */
	handleDocumentClick = function (e) {
		// ignore right clicks
		if (e.which !== 3 && dropdown && !e.defaultPrevented) {
			autoUpdate();

			base.closeDropDown();
		}
	};

	/**
	 * Handles the WYSIWYG editors cut & copy events
	 *
	 * By default browsers also copy inherited styling from the stylesheet and
	 * browser default styling which is unnecessary.
	 *
	 * This will ignore inherited styles and only copy inline styling.
	 * @private
	 */
	handleCutCopyEvt = function (e) {
		var range = rangeHelper.selectedRange();
		if (range) {
			var container = dom.createElement('div', {}, wysiwygDocument);
			var firstParent;

			// Copy all inline parent nodes up to the first block parent so can
			// copy inline styles
			var parent = range.commonAncestorContainer;
			while (parent && dom.isInline(parent, true)) {
				if (parent.nodeType === dom.ELEMENT_NODE) {
					var clone = parent.cloneNode();
					if (container.firstChild) {
						dom.appendChild(clone, container.firstChild);
					}

					dom.appendChild(container, clone);
					firstParent = firstParent || clone;
				}
				parent = parent.parentNode;
			}

			dom.appendChild(firstParent || container, range.cloneContents());
			markers.expand(container);
			markers.clearBlockLabels(container);
			dom.removeWhiteSpace(container);

			e.clipboardData.setData('text/html', container.innerHTML);

			// TODO: Refactor into private shared module with plaintext plugin
			// innerText adds two newlines after <p> tags so convert them to
			// <div> tags
			utils.each(dom.find(container, 'p'), function (_, elm) {
				dom.convertElement(elm, 'div');
			});
			// Remove collapsed <br> tags as innerText converts them to newlines
			utils.each(dom.find(container, 'br'), function (_, elm) {
				if (!elm.nextSibling || !dom.isInline(elm.nextSibling, true)) {
					dom.remove(elm);
				}
			});

			// range.toString() doesn't include newlines so can't use that.
			// selection.toString() seems to use the same method as innerText
			// but needs to be normalised first so using container.innerText
			dom.appendChild(wysiwygBody, container);
			e.clipboardData.setData('text/plain', container.innerText);
			dom.remove(container);

			if (e.type === 'cut') {
				range.deleteContents();
			}

			e.preventDefault();
		}
	};

	/**
	 * Handles the WYSIWYG editors paste event
	 * @private
	 */
	handlePasteEvt = function (e) {
		var editable = wysiwygBody;
		var clipboard = e.clipboardData;
		var loadImage = function (file) {
			var reader = new FileReader();
			reader.onload = function (e) {
				handlePasteData({
					html: '<img src="' + e.target.result + '" />'
				});
			};
			reader.readAsDataURL(file);
		};

		// Modern browsers with clipboard API - everything other than _very_
		// old android web views and UC browser which doesn't support the
		// paste event at all.
		if (clipboard) {
			var data = {};
			var types = clipboard.types;
			var items = clipboard.items;

			e.preventDefault();

			for (var i = 0; i < types.length; i++) {
				// Word sometimes adds copied text as an image so if HTML
				// exists prefer that over images
				if (types.indexOf('text/html') < 0) {
					// Normalise image pasting to paste as a data-uri
					if (globalWin.FileReader && items &&
						IMAGE_MIME_REGEX.test(items[i].type)) {
						return loadImage(clipboard.items[i].getAsFile());
					}
				}

				data[types[i]] = clipboard.getData(types[i]);
			}
			// Call plugins here with file?
			data.text = data['text/plain'];
			data.html = sanitize(data['text/html']);

			handlePasteData(data);
		// If contentsFragment exists then we are already waiting for a
		// previous paste so let the handler for that handle this one too
		} else if (!pasteContentFragment) {
			// Save the scroll position so can be restored
			// when contents is restored
			var scrollTop = editable.scrollTop;

			rangeHelper.saveRange();

			pasteContentFragment = globalDoc.createDocumentFragment();
			while (editable.firstChild) {
				dom.appendChild(pasteContentFragment, editable.firstChild);
			}

			setTimeout(function () {
				var html = editable.innerHTML;

				editable.innerHTML = '';
				dom.appendChild(editable, pasteContentFragment);
				editable.scrollTop = scrollTop;
				pasteContentFragment = false;

				rangeHelper.restoreRange();

				handlePasteData({ html: sanitize(html) });
			}, 0);
		}
	};

	/**
	 * Gets the pasted data, filters it and then inserts it.
	 * @param {Object} data
	 * @private
	 */
	handlePasteData = function (data) {
		var pasteArea = dom.createElement('div', {}, wysiwygDocument);

		pluginManager.call('pasteRaw', data);
		dom.trigger(editorContainer, 'pasteraw', data);

		if (data.html) {
			// Sanitize again in case plugins modified the HTML
			pasteArea.innerHTML = sanitize(data.html);
			markers.expand(pasteArea);

			// fix any invalid nesting
			dom.fixNesting(pasteArea);
		} else {
			pasteArea.innerHTML = escape.entities(data.text || '');
		}

		var paste = {
			val: pasteArea.innerHTML
		};

		if ('fragmentToSource' in format) {
			paste.val = format
				.fragmentToSource(paste.val, wysiwygDocument, currentNode);
		}

		pluginManager.call('paste', paste);
		dom.trigger(editorContainer, 'paste', paste);

		if ('fragmentToHtml' in format) {
			paste.val = format
				.fragmentToHtml(paste.val, currentNode);
		}

		pluginManager.call('pasteHtml', paste);

		var parent = rangeHelper.getFirstBlockParent();
		base.wysiwygEditorInsertHtml(paste.val, null, true);
		dom.merge(parent);
		protectWysiwygMarkers();
	};

	/**
	 * Closes any currently open drop down
	 *
	 * @param {boolean} [focus=false] If to focus the editor
	 *                             after closing the drop down
	 * @function
	 * @name closeDropDown
	 * @memberOf SCEditor.prototype
	 */
	base.closeDropDown = function (focus) {
		if (dropdown) {
			dom.remove(dropdown);
			dropdown = null;
		}

		if (focus === true) {
			base.focus();
		}
	};


	/**
	 * Inserts HTML into WYSIWYG editor.
	 *
	 * If endHtml is specified, any selected text will be placed
	 * between html and endHtml. If there is no selected text html
	 * and endHtml will just be concatenate together.
	 *
	 * @param {string} html
	 * @param {string} [endHtml=null]
	 * @param {boolean} [overrideCodeBlocking=false] If to insert the html
	 *                                               into code tags, by
	 *                                               default code tags only
	 *                                               support text.
	 * @function
	 * @name wysiwygEditorInsertHtml
	 * @memberOf SCEditor.prototype
	 */
	base.wysiwygEditorInsertHtml = function (
		html, endHtml, overrideCodeBlocking
	) {
		var	marker, scrollTop, scrollTo,
			editorHeight = dom.height(wysiwygEditor);

		base.focus();

		// TODO: This code tag should be configurable and
		// should maybe convert the HTML into text instead
		// Don't apply to code elements
		if (!overrideCodeBlocking && dom.closest(currentBlockNode, 'code')) {
			return;
		}

		// Insert the HTML and save the range so the editor can be scrolled
		// to the end of the selection without affecting the cursor position
		rangeHelper.insertHTML(html, endHtml);
		rangeHelper.saveRange();

		// Fix any invalid nesting, e.g. if a quote or other block is inserted
		// into a paragraph
		dom.fixNesting(wysiwygBody);

		wrapInlines(wysiwygBody, wysiwygDocument);

		// Scroll the editor after the end of the selection
		marker   = dom.find(wysiwygBody, '#sceditor-end-marker')[0];
		dom.show(marker);
		scrollTop = wysiwygBody.scrollTop;
		scrollTo  = (dom.getOffset(marker).top +
			(marker.offsetHeight * 1.5)) - editorHeight;
		dom.hide(marker);

		// Only scroll if marker isn't already visible
		if (scrollTo > scrollTop || scrollTo + editorHeight < scrollTop) {
			wysiwygBody.scrollTop = scrollTo;
		}

		triggerValueChanged(false);
		rangeHelper.restoreRange();

		// Add a new line after the last block element
		// so can always add text after it
		appendNewLine();
		protectWysiwygMarkers();
	};

	/**
	 * Like wysiwygEditorInsertHtml except it will convert any HTML
	 * into text before inserting it.
	 *
	 * @param {string} text
	 * @param {string} [endText=null]
	 * @function
	 * @name wysiwygEditorInsertText
	 * @memberOf SCEditor.prototype
	 */
	base.wysiwygEditorInsertText = function (text, endText) {
		base.wysiwygEditorInsertHtml(
			escape.entities(text), escape.entities(endText)
		);
	};

	/**
	 * Inserts text into the WYSIWYG or source editor depending on which
	 * mode the editor is in.
	 *
	 * If endText is specified any selected text will be placed between
	 * text and endText. If no text is selected text and endText will
	 * just be concatenate together.
	 *
	 * @param {string} text
	 * @param {string} [endText=null]
	 * @since 1.3.5
	 * @function
	 * @name insertText
	 * @memberOf SCEditor.prototype
	 */
	base.insertText = function (text, endText) {
		if (base.inSourceMode()) {
			base.sourceEditorInsertText(text, endText);
		} else {
			base.wysiwygEditorInsertText(text, endText);
		}

		return base;
	};

	/**
	 * Like wysiwygEditorInsertHtml but inserts text into the
	 * source mode editor instead.
	 *
	 * If endText is specified any selected text will be placed between
	 * text and endText. If no text is selected text and endText will
	 * just be concatenate together.
	 *
	 * The cursor will be placed after the text param. If endText is
	 * specified the cursor will be placed before endText, so passing:<br />
	 *
	 * '[b]', '[/b]'
	 *
	 * Would cause the cursor to be placed:<br />
	 *
	 * [b]Selected text|[/b]
	 *
	 * @param {string} text
	 * @param {string} [endText=null]
	 * @since 1.4.0
	 * @function
	 * @name sourceEditorInsertText
	 * @memberOf SCEditor.prototype
	 */
	base.sourceEditorInsertText = function (text, endText) {
		var scrollTop, currentValue,
			startPos = sourceEditor.selectionStart,
			endPos   = sourceEditor.selectionEnd;

		scrollTop = sourceEditor.scrollTop;
		sourceEditor.focus();
		currentValue = sourceEditor.value;

		if (endText) {
			text += currentValue.substring(startPos, endPos) + endText;
		}

		sourceEditor.value = currentValue.substring(0, startPos) +
			text +
			currentValue.substring(endPos, currentValue.length);

		sourceEditor.selectionStart = (startPos + text.length) -
			(endText ? endText.length : 0);
		sourceEditor.selectionEnd = sourceEditor.selectionStart;

		sourceEditor.scrollTop = scrollTop;
		sourceEditor.focus();

		refreshSourceHighlight();
		triggerValueChanged();
	};

	/**
	 * Gets the current instance of the rangeHelper class
	 * for the editor.
	 *
	 * @return {RangeHelper}
	 * @function
	 * @name getRangeHelper
	 * @memberOf SCEditor.prototype
	 */
	base.getRangeHelper = function () {
		return rangeHelper;
	};

	/**
	 * Gets or sets the source editor caret position.
	 *
	 * @param {Object} [position]
	 * @return {this}
	 * @function
	 * @since 1.4.5
	 * @name sourceEditorCaret
	 * @memberOf SCEditor.prototype
	 */
	base.sourceEditorCaret = function (position) {
		sourceEditor.focus();

		if (position) {
			sourceEditor.selectionStart = position.start;
			sourceEditor.selectionEnd = position.end;

			return this;
		}

		return {
			start: sourceEditor.selectionStart,
			end: sourceEditor.selectionEnd
		};
	};

	/**
	 * Gets the value of the editor.
	 *
	 * If the editor is in WYSIWYG mode it will return the filtered
	 * HTML from it. If it is in source mode it will return the
	 * unfiltered contents of the source editor.
	 *
	 * @since 1.3.5
	 * @return {string}
	 * @function
	 * @name val
	 * @memberOf SCEditor.prototype
	 */
	/**
	 * Sets the value of the editor.
	 *
	 * If filter is true and the format provides toHtml, the value
	 * is converted before it is shown.
	 *
	 * @param {string} val
	 * @param {boolean} [filter=true]
	 * @return {this}
	 * @since 1.3.5
	 * @function
	 * @name val^2
	 * @memberOf SCEditor.prototype
	 */
	base.val = function (val, filter) {
		if (!utils.isString(val)) {
			return base.inSourceMode() ?
				base.getSourceEditorValue(false) :
				base.getWysiwygEditorValue(filter);
		}

		if (!base.inSourceMode()) {
			if (filter !== false && 'toHtml' in format) {
				val = format.toHtml(val);
			}

			base.setWysiwygEditorValue(val);
		} else {
			base.setSourceEditorValue(val);
		}

		return base;
	};

	/**
	 * Inserts HTML into the editor
	 *
	 * If end is supplied any selected text will be placed between
	 * start and end. If there is no selected text start and end
	 * will be concatenate together.
	 *
	 * If the filter param is set to true, the HTML will be passed
	 * through any plugin filters.
	 *
	 * @param {string} start
	 * @param {string} [end=null]
	 * @param {boolean} [filter=true]
	 * @param {boolean} [unused]
	 * @return {this}
	 * @since 1.3.5
	 * @function
	 * @name insert
	 * @memberOf SCEditor.prototype
	 */
	/**
	 * Inserts HTML into the editor
	 *
	 * If end is supplied any selected text will be placed between
	 * start and end. If there is no selected text start and end
	 * will be concatenate together.
	 *
	 * If the filter param is set to true, the HTML will be passed
	 * through any plugin filters.
	 *
	 * If the allowMixed param is set to true, HTML any will not be
	 * escaped
	 *
	 * @param {string} start
	 * @param {string} [end=null]
	 * @param {boolean} [filter=true]
	 * @param {boolean} [unused]
	 * @param {boolean} [allowMixed=false]
	 * @return {this}
	 * @since 1.4.3
	 * @function
	 * @name insert^2
	 * @memberOf SCEditor.prototype
	 */
	// eslint-disable-next-line max-params
	base.insert = function (
		start, end, filter, unused, allowMixed
	) {
		if (base.inSourceMode()) {
			base.sourceEditorInsertText(start, end);
			return base;
		}

		// Add the selection between start and end
		if (end) {
			var	html = rangeHelper.selectedHtml();

			if (filter !== false && 'fragmentToSource' in format) {
				html = format
					.fragmentToSource(html, wysiwygDocument, currentNode);
			}

			start += html + end;
		}
		// TODO: This filter should allow empty tags as it's inserting.
		if (filter !== false && 'fragmentToHtml' in format) {
			start = format.fragmentToHtml(start, currentNode);
		}

		// Convert any escaped HTML back into HTML if mixed is allowed
		if (filter !== false && allowMixed === true) {
			start = start.replace(/&lt;/g, '<')
				.replace(/&gt;/g, '>')
				.replace(/&amp;/g, '&');
		}

		base.wysiwygEditorInsertHtml(start);

		return base;
	};

	/**
	 * Gets the WYSIWYG editors HTML value.
	 *
	 * If the format provides toSource and filter is not false, the
	 * HTML is passed through that conversion.
	 *
	 * @param {boolean} [filter=true]
	 * @return {string}
	 * @function
	 * @name getWysiwygEditorValue
	 * @memberOf SCEditor.prototype
	 */
	base.getWysiwygEditorValue = function (filter) {
		var	html;
		// Create a tmp node to store contents so it can be modified
		// without affecting anything else.
		var tmp = dom.createElement('div', {}, wysiwygDocument);
		var childNodes = wysiwygBody.childNodes;

		for (var i = 0; i < childNodes.length; i++) {
			dom.appendChild(tmp, childNodes[i].cloneNode(true));
		}

		dom.appendChild(wysiwygBody, tmp);
		markers.expand(tmp);
		markers.clearBlockLabels(tmp);
		dom.fixNesting(tmp);
		dom.remove(tmp);

		html = tmp.innerHTML;

		// filter the HTML and DOM through any plugins
		if (filter !== false && format.hasOwnProperty('toSource')) {
			html = format.toSource(html, wysiwygDocument);
		}

		return html;
	};

	/**
	 * Gets the WYSIWYG editor's iFrame Body.
	 *
	 * @return {HTMLElement}
	 * @function
	 * @since 1.4.3
	 * @name getBody
	 * @memberOf SCEditor.prototype
	 */
	base.getBody = function () {
		return wysiwygBody;
	};

	/**
	 * Gets the WYSIWYG editors container area (whole iFrame).
	 *
	 * @return {HTMLElement}
	 * @function
	 * @since 1.4.3
	 * @name getContentAreaContainer
	 * @memberOf SCEditor.prototype
	 */
	base.getContentAreaContainer = function () {
		return wysiwygEditor;
	};

	/**
	 * Gets the text editor value
	 *
	 * If the format provides toHtml and filter is not false, the
	 * source is passed through that conversion. Otherwise the raw
	 * source editor value is returned.
	 *
	 * @param {boolean} [filter=true]
	 * @return {string}
	 * @function
	 * @since 1.4.0
	 * @name getSourceEditorValue
	 * @memberOf SCEditor.prototype
	 */
	base.getSourceEditorValue = function (filter) {
		var val = sourceEditor.value;

		if (filter !== false && 'toHtml' in format) {
			val = format.toHtml(val);
		}

		return val;
	};

	/**
	 * Sets the WYSIWYG HTML editor value. Should only be the HTML
	 * contained within the body tags
	 *
	 * @param {string} value
	 * @function
	 * @name setWysiwygEditorValue
	 * @memberOf SCEditor.prototype
	 */
	base.setWysiwygEditorValue = function (value) {
		if (!value) {
			value = '<p><br /></p>';
		}

		wysiwygBody.innerHTML = sanitize(value);
		protectWysiwygMarkers();

		appendNewLine();
		triggerValueChanged();
		autoExpand();
	};

	/**
	 * Sets the text editor value
	 *
	 * @param {string} value
	 * @function
	 * @name setSourceEditorValue
	 * @memberOf SCEditor.prototype
	 */
	base.setSourceEditorValue = function (value) {
		sourceEditor.value = value;

		refreshSourceHighlight();
		triggerValueChanged();
	};

	/**
	 * Updates the textarea that the editor is replacing
	 * with the value currently inside the editor.
	 *
	 * @function
	 * @name updateOriginal
	 * @since 1.4.0
	 * @memberOf SCEditor.prototype
	 */
	base.updateOriginal = function () {
		original.value = base.val();
	};

	/**
	 * If the editor is in source code mode
	 *
	 * @return {boolean}
	 * @function
	 * @name inSourceMode
	 * @memberOf SCEditor.prototype
	 */
	base.inSourceMode = function () {
		return dom.hasClass(editorContainer, 'sourceMode');
	};

	/**
	 * Gets if the editor is in sourceMode
	 *
	 * @return boolean
	 * @function
	 * @name sourceMode
	 * @memberOf SCEditor.prototype
	 */
	/**
	 * Sets if the editor is in sourceMode
	 *
	 * @param {boolean} enable
	 * @return {this}
	 * @function
	 * @name sourceMode^2
	 * @memberOf SCEditor.prototype
	 */
	/**
	 * Current editing surface: wysiwyg, preview or source
	 *
	 * @private
	 * @return {string}
	 */
	function editorMode() {
		if (dom.hasClass(editorContainer, 'previewMode')) {
			return 'preview';
		}

		if (dom.hasClass(editorContainer, 'sourceMode')) {
			return 'source';
		}

		return 'wysiwyg';
	}

	/**
	 * Stylesheet URLs the preview should load
	 *
	 * @private
	 * @return {Array<string>}
	 */
	function previewStylesheets() {
		var value = options.previewStyle;
		var list = Array.isArray(value) ?
			value : String(value || '').split(',');
		var hrefs = [];

		list.forEach(function (href) {
			href = String(href || '').trim();

			if (href && domPurify.isValidAttribute('link', 'href', href)) {
				hrefs.push(href);
			}
		});

		return hrefs;
	}

	/**
	 * Fills the preview document with the saved HTML and the preview CSS.
	 * The document does not load the editor stylesheet, so the bundle
	 * decides the background and the text colour.
	 *
	 * @private
	 * @param {string} html
	 */
	function renderPreview(html) {
		var doc = previewEditor.contentDocument;
		var links = previewStylesheets().map(function (href) {
			return '<link rel="stylesheet" href="' +
				escape.entities(href) + '">';
		}).join('');

		doc.open();
		doc.write(
			'<!DOCTYPE html><html><head>' +
			'<meta charset="' + options.charset + '">' +
			'<style>html,body{margin:0;min-height:100%}' +
			markers.placeholderCss +
			'</style>' +
			links +
			'</head><body></body></html>'
		);
		doc.close();
		doc.body.innerHTML = sanitize(
			markers.placeholders(html || '', activeMarkerKinds())
		);
		dom.on(doc, 'keydown', handleKeyDown);
	}

	var protectingMarkers = false;

	/**
	 * Kinds turned on by the markers option.
	 * @private
	 * @return {Object<string, boolean>}
	 */
	function activeMarkerKinds() {
		return markers.enabled(options.markers);
	}

	/**
	 * Keeps enabled markers as single chips in the visual editor.
	 * @private
	 */
	function protectWysiwygMarkers() {
		if (protectingMarkers || !wysiwygBody) {
			return;
		}

		protectingMarkers = true;

		try {
			markers.protect(wysiwygBody, activeMarkerKinds());
		} finally {
			protectingMarkers = false;
		}
	}

	/**
	 * Paints the code view in Monokai colours.
	 * The textarea stays the real editor; the pre only mirrors it.
	 * @private
	 */
	function refreshSourceHighlight() {
		sourceView.innerHTML = highlightSource(sourceEditor.value);
		syncSourceScroll();
		syncSourceSelection();
	}

	/**
	 * Draws the code selection behind the coloured glyphs.
	 * The textarea selection is transparent, so it does not
	 * cover the syntax colours.
	 * @private
	 */
	function syncSourceSelection() {
		var start = sourceEditor.selectionStart;
		var end = sourceEditor.selectionEnd;
		var boxes = sourceView.querySelectorAll('.sce-selection');
		var range, rects, origin, i, rect, box, top, left;

		for (i = 0; i < boxes.length; i++) {
			dom.remove(boxes[i]);
		}

		if (start === end) {
			return;
		}

		range = rangeFromOffsets(sourceView, start, end);

		if (!range) {
			return;
		}

		rects = range.getClientRects();
		origin = sourceView.getBoundingClientRect();

		for (i = 0; i < rects.length; i++) {
			rect = rects[i];

			if ((!rect.width && !rect.height) ||
					selectionCovered(rects, i)) {
				continue;
			}

			box = dom.createElement('div', {
				className: 'sce-selection'
			});
			top = rect.top - origin.top + sourceView.scrollTop;
			left = rect.left - origin.left + sourceView.scrollLeft;
			box.style.top = top + 'px';
			box.style.left = left + 'px';
			box.style.width = rect.width + 'px';
			box.style.height = rect.height + 'px';
			dom.appendChild(sourceView, box);
		}
	}

	/**
	 * Skips a selection rect that sits inside an earlier one.
	 * Overlapping bands would stack into a darker patch.
	 *
	 * @private
	 * @param {ClientRectList} rects
	 * @param {number} index
	 * @return {boolean}
	 */
	function selectionCovered(rects, index) {
		var rect = rects[index];
		var i, other;

		for (i = 0; i < index; i++) {
			other = rects[i];

			if (rect.top >= other.top - 0.5 &&
					rect.bottom <= other.bottom + 0.5 &&
					rect.left >= other.left - 0.5 &&
					rect.right <= other.right + 0.5) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Maps textarea offsets onto the coloured text nodes.
	 *
	 * @private
	 * @param {HTMLElement} root
	 * @param {number} start
	 * @param {number} end
	 * @return {Range|null}
	 */
	function rangeFromOffsets(root, start, end) {
		var doc = root.ownerDocument;
		var walker = doc.createTreeWalker(
			root,
			NodeFilter.SHOW_TEXT,
			null
		);
		var range = doc.createRange();
		var node = walker.nextNode();
		var seen = 0;
		var next = 0;
		var started = false;
		var last = null;

		while (node) {
			next = seen + node.nodeValue.length;

			if (!started && start <= next) {
				range.setStart(node, start - seen);
				started = true;
			}

			if (started && end <= next) {
				range.setEnd(node, end - seen);
				return range;
			}

			seen = next;
			last = node;
			node = walker.nextNode();
		}

		if (!started || !last) {
			return null;
		}

		range.setEnd(last, last.nodeValue.length);
		return range;
	}

	/**
	 * Keeps the coloured layer on the same scroll position.
	 * @private
	 */
	function syncSourceScroll() {
		sourceView.scrollTop = sourceEditor.scrollTop;
		sourceView.scrollLeft = sourceEditor.scrollLeft;
	}

	/**
	 * Shows one surface and hides the other two
	 *
	 * @private
	 * @param {string} mode
	 */
	function showMode(mode) {
		dom.hide(wysiwygEditor);
		dom.hide(previewEditor);
		dom.hide(sourceWrap);

		if (mode === 'preview') {
			dom.show(previewEditor);
		} else if (mode === 'source') {
			dom.show(sourceWrap);
			syncSourceScroll();
			syncSourceSelection();
		} else {
			dom.show(wysiwygEditor);
		}

		dom.removeClass(editorContainer, 'wysiwygMode');
		dom.removeClass(editorContainer, 'previewMode');
		dom.removeClass(editorContainer, 'sourceMode');
		dom.addClass(editorContainer, mode === 'wysiwyg' ?
			'wysiwygMode' : mode + 'Mode');
	}

	base.sourceMode = function (enable) {
		if (typeof enable !== 'boolean') {
			return base.inSourceMode();
		}

		base.mode(enable ? 'source' : 'wysiwyg');

		return base;
	};

	/**
	 * Gets or sets the current surface.
	 *
	 * @param {string} [mode] wysiwyg, preview or source
	 * @return {string|this}
	 * @function
	 * @name mode
	 * @memberOf SCEditor.prototype
	 */
	base.mode = function (mode) {
		var from = editorMode();

		if (mode !== 'wysiwyg' && mode !== 'preview' && mode !== 'source') {
			return from;
		}

		if (mode === from) {
			return base;
		}

		if (mode === 'wysiwyg' && !browser.isWysiwygSupported) {
			return base;
		}

		if (from === 'wysiwyg') {
			rangeHelper.saveRange();
			rangeHelper.clear();
		}

		currentSelection = null;
		base.blur();

		if (from === 'wysiwyg') {
			base.setSourceEditorValue(base.getWysiwygEditorValue());
		} else if (from === 'source') {
			base.setWysiwygEditorValue(base.getSourceEditorValue());
		}

		if (mode === 'preview') {
			renderPreview(sourceEditor.value);
		}

		showMode(mode);
		updateToolBar();
		updateActiveButtons();

		return base;
	};

	base.toggleSourceMode = function () {
		if (!browser.isWysiwygSupported && base.inSourceMode()) {
			return;
		}

		base.mode(base.inSourceMode() ? 'wysiwyg' : 'source');
	};

	/**
	 * Gets the selected text of the source editor
	 * @return {string}
	 * @private
	 */
	sourceEditorSelectedText = function () {
		sourceEditor.focus();

		return sourceEditor.value.substring(
			sourceEditor.selectionStart,
			sourceEditor.selectionEnd
		);
	};

	/**
	 * Handles the passed command
	 * @private
	 */
	handleCommand = function (caller, cmd) {
		// check if in text mode and handle text commands
		if (base.inSourceMode()) {
			if (cmd.txtExec) {
				if (Array.isArray(cmd.txtExec)) {
					base.sourceEditorInsertText.apply(base, cmd.txtExec);
				} else {
					cmd.txtExec.call(base, caller, sourceEditorSelectedText());
				}
			}
		} else if (cmd.exec) {
			if (utils.isFunction(cmd.exec)) {
				cmd.exec.call(base, caller);
			} else {
				base.execCommand(
					cmd.exec,
					cmd.hasOwnProperty('execParam') ? cmd.execParam : null
				);
			}
		}

	};

	/**
	 * Executes a command on the WYSIWYG editor
	 *
	 * @param {string} command
	 * @param {String|Boolean} [param]
	 * @function
	 * @name execCommand
	 * @memberOf SCEditor.prototype
	 */
	base.execCommand = function (command, param) {
		var	executed    = false,
			commandObj  = base.commands[command];

		base.focus();

		// TODO: make configurable
		// don't apply any commands to code elements
		if (dom.closest(rangeHelper.parentNode(), 'code')) {
			return;
		}

		try {
			executed = wysiwygDocument.execCommand(command, false, param);
		// eslint-disable-next-line no-unused-vars
		} catch (ex) { }

		// show error if execution failed and an error message exists
		if (!executed && commandObj && commandObj.errorMessage) {
			/*global alert:false*/
			alert(base._(commandObj.errorMessage));
		}

		updateActiveButtons();
	};

	/**
	 * Checks if the current selection has changed and triggers
	 * the selectionchanged event if it has.
	 *
	 * In browsers other that don't support selectionchange event it will check
	 * at most once every 100ms.
	 * @private
	 */
	checkSelectionChanged = function () {
		function check() {
			// Don't create new selection if there isn't one (like after
			// blur event in iOS)
			if (wysiwygWindow.getSelection() &&
				wysiwygWindow.getSelection().rangeCount <= 0) {
				currentSelection = null;
			// rangeHelper could be null if editor was destroyed
			// before the timeout had finished
			} else if (rangeHelper && !rangeHelper.compare(currentSelection)) {
				currentSelection = rangeHelper.cloneSelected();

				// If the selection is in an inline wrap it in a block.
				// Fixes #331
				if (currentSelection && currentSelection.collapsed) {
					var parent = currentSelection.startContainer;
					var offset = currentSelection.startOffset;

					// Handle if selection is placed before/after an element
					if (offset && parent.nodeType !== dom.TEXT_NODE) {
						parent = parent.childNodes[offset];
					}

					while (parent && parent.parentNode !== wysiwygBody) {
						parent = parent.parentNode;
					}

					if (parent && dom.isInline(parent, true)) {
						rangeHelper.saveRange();
						wrapInlines(wysiwygBody, wysiwygDocument);
						rangeHelper.restoreRange();
					}
				}

				dom.trigger(editorContainer, 'selectionchanged');
			}

			isSelectionCheckPending = false;
		}

		if (isSelectionCheckPending) {
			return;
		}

		isSelectionCheckPending = true;

		// Don't need to limit checking if browser supports the Selection API
		if ('onselectionchange' in wysiwygDocument) {
			check();
		} else {
			setTimeout(check, 100);
		}
	};

	/**
	 * Checks if the current node has changed and triggers
	 * the nodechanged event if it has
	 * @private
	 */
	checkNodeChanged = function () {
		// check if node has changed
		var	oldNode,
			node = rangeHelper.parentNode();

		if (currentNode !== node) {
			oldNode          = currentNode;
			currentNode      = node;
			currentBlockNode = rangeHelper.getFirstBlockParent(node);

			dom.trigger(editorContainer, 'nodechanged', {
				oldNode: oldNode,
				newNode: currentNode
			});
		}
	};

	/**
	 * Gets the current node that contains the selection/caret in
	 * WYSIWYG mode.
	 *
	 * Will be null in sourceMode or if there is no selection.
	 *
	 * @return {?Node}
	 * @function
	 * @name currentNode
	 * @memberOf SCEditor.prototype
	 */
	base.currentNode = function () {
		return currentNode;
	};

	/**
	 * Gets the first block level node that contains the
	 * selection/caret in WYSIWYG mode.
	 *
	 * Will be null in sourceMode or if there is no selection.
	 *
	 * @return {?Node}
	 * @function
	 * @name currentBlockNode
	 * @memberOf SCEditor.prototype
	 * @since 1.4.4
	 */
	base.currentBlockNode = function () {
		return currentBlockNode;
	};

	/**
	 * Updates if buttons are active or not
	 * @private
	 */
	updateActiveButtons = function () {
		var firstBlock, parent;
		var activeClass = 'active';
		var doc         = wysiwygDocument;
		var isPreview   = base.mode() === 'preview';
		var isSource    = base.sourceMode();

		if (base.readOnly()) {
			utils.each(dom.find(toolbar, activeClass), function (_, menuItem) {
				dom.removeClass(menuItem, activeClass);
			});
			return;
		}

		if (!isSource && !isPreview) {
			parent     = rangeHelper.parentNode();
			firstBlock = rangeHelper.getFirstBlockParent(parent);
		}

		for (var j = 0; j < btnStateHandlers.length; j++) {
			var state      = 0;
			var btn        = toolbarButtons[btnStateHandlers[j].name];
			var stateFn    = btnStateHandlers[j].state;
			var staysInPreview = btn._sceView || btn._scePreview;
			var isDisabled = isPreview ? !staysInPreview :
				((isSource && !btn._sceTxtMode) ||
					(!isSource && !btn._sceWysiwygMode));

			if (isPreview && !staysInPreview) {
				state = 0;
			} else if (utils.isString(stateFn)) {
				if (!isSource && !isPreview) {
					try {
						state = doc.queryCommandEnabled(stateFn) ? 0 : -1;

						// eslint-disable-next-line max-depth
						if (state > -1) {
							state = doc.queryCommandState(stateFn) ? 1 : 0;
						}
						// eslint-disable-next-line no-unused-vars
					} catch (ex) {}
				}
			} else if (!isDisabled) {
				state = stateFn.call(base, parent, firstBlock);
			}

			dom.toggleClass(btn, 'disabled', isDisabled || state < 0);
			dom.toggleClass(btn, activeClass, state > 0);
		}

		if (icons && icons.update) {
			icons.update(isSource, parent, firstBlock);
		}
	};

	/**
	 * Shift+Enter. A line break that stays inside the current block.
	 * @private
	 */
	var insertSoftBreak = function () {
		var br = dom.createElement('br', {}, wysiwygDocument);
		var parent;
		var lastChild;

		rangeHelper.insertNode(br);
		parent = br.parentNode;
		lastChild = parent.lastChild;

		// Sometimes an empty next node is created after the <br>
		if (lastChild && lastChild.nodeType === dom.TEXT_NODE &&
				lastChild.nodeValue === '') {
			dom.remove(lastChild);
			lastChild = parent.lastChild;
		}

		// The last <br> of a block collapses unless another follows it.
		if (!dom.isInline(parent, true) && lastChild === br &&
				dom.isInline(br.previousSibling)) {
			rangeHelper.insertHTML('<br>');
		}
	};

	/**
	 * Direct child of the editor body that contains the node.
	 * @private
	 * @param {Node} container
	 * @return {?HTMLElement}
	 */
	var blockFromCaret = function (container) {
		var node = container;

		if (!node) {
			return null;
		}

		if (node.nodeType === dom.TEXT_NODE) {
			node = node.parentNode;
		}

		while (node && node.parentNode !== wysiwygBody) {
			node = node.parentNode;
		}

		if (!node || node === wysiwygBody) {
			return null;
		}

		return node;
	};

	/**
	 * @private
	 * @param {HTMLElement} el
	 * @return {boolean}
	 */
	var blockIsEmpty = function (el) {
		var text = (el.textContent || '').replace(/\u200B/g, '');

		if (/\S/.test(text)) {
			return false;
		}

		return !el.querySelector('img,.sceditor-marker,table,hr,iframe');
	};

	/**
	 * @private
	 * @param {HTMLElement} el
	 */
	var placeCaret = function (el) {
		var range = wysiwygDocument.createRange();
		var first = el.firstChild;
		var sel;

		if (first && first.nodeType === dom.TEXT_NODE) {
			range.setStart(first, 0);
		} else if (first) {
			range.setStartBefore(first);
		} else {
			range.setStart(el, 0);
		}

		range.collapse(true);
		sel = wysiwygWindow.getSelection();

		if (!sel) {
			return;
		}

		sel.removeAllRanges();
		sel.addRange(range);
	};

	/**
	 * @private
	 * @param {HTMLElement} paragraph
	 * @param {DocumentFragment} fragment
	 */
	var fillNewParagraph = function (paragraph, fragment) {
		var nested;

		paragraph.appendChild(fragment);
		nested = paragraph.firstChild;

		if (paragraph.childNodes.length === 1 && nested &&
				dom.is(nested, 'p,div')) {
			while (nested.firstChild) {
				dom.insertBefore(nested.firstChild, nested);
			}

			dom.remove(nested);
		}

		if (blockIsEmpty(paragraph)) {
			paragraph.innerHTML = '<br>';
		}
	};

	/**
	 * Enter. Starts a paragraph after the current block and moves
	 * the tail of the block into it.
	 * @private
	 * @return {boolean} false when the browser should handle the key
	 */
	var insertParagraphAfter = function () {
		var range = rangeHelper.selectedRange();
		var container;
		var block;
		var tail;
		var paragraph;

		if (!range) {
			return false;
		}

		if (!range.collapsed) {
			range.deleteContents();
		}

		container = range.startContainer;

		if (dom.closest(container, 'td,th,li,ul,ol,table')) {
			return false;
		}

		block = blockFromCaret(container);

		if (!block || dom.is(block, 'table,ul,ol')) {
			return false;
		}

		tail = wysiwygDocument.createRange();
		tail.selectNodeContents(block);
		tail.setStart(range.startContainer, range.startOffset);
		paragraph = dom.createElement('p', {}, wysiwygDocument);
		fillNewParagraph(paragraph, tail.extractContents());

		if (block.nextSibling) {
			dom.insertBefore(paragraph, block.nextSibling);
		} else {
			dom.appendChild(wysiwygBody, paragraph);
		}

		if (blockIsEmpty(block) && dom.is(block,
			'p,div,h1,h2,h3,h4,h5,h6,blockquote,pre')) {
			block.innerHTML = '<br>';
		}

		placeCaret(paragraph);
		protectWysiwygMarkers();

		return true;
	};

	/**
	 * Handles any key press in the WYSIWYG editor
	 *
	 * @private
	 */
	handleKeyPress = function (e) {
		// FF bug: https://bugzilla.mozilla.org/show_bug.cgi?id=501496
		if (e.defaultPrevented) {
			return;
		}

		base.closeDropDown();

		// 13 = enter key
		if ((e.which || e.keyCode) !== 13 ||
				e.altKey || e.ctrlKey || e.metaKey) {
			return;
		}

		// Shift+Enter stays inside the block.
		if (e.shiftKey) {
			insertSoftBreak();
			e.preventDefault();
			return;
		}

		// Enter starts a new block. Lists and tables keep their own keys.
		if (insertParagraphAfter()) {
			e.preventDefault();
		}
	};

	/**
	 * Makes sure that if there is a code or quote tag at the
	 * end of the editor, that there is a new line after it.
	 *
	 * If there wasn't a new line at the end you wouldn't be able
	 * to enter any text after a code/quote tag
	 * @return {void}
	 * @private
	 */
	appendNewLine = function () {
		// Check all nodes in reverse until either add a new line
		// or reach a non-empty textnode or BR at which point can
		// stop checking.
		dom.rTraverse(wysiwygBody, function (node) {
			// Last block, add new line after if has styling
			if (dom.is(node, '.sceditor-rail,.sceditor-drop,' +
				'.sceditor-drag,.sceditor-ghost,.sceditor-ignore')) {
				return;
			}

			if (node.nodeType === dom.ELEMENT_NODE &&
				!/inline/.test(dom.css(node, 'display'))) {

				// Add line break after if has styling
				if (!dom.is(node, '.sceditor-nlf') && dom.hasStyling(node)) {
					var paragraph = dom.createElement('p', {}, wysiwygDocument);
					paragraph.className = 'sceditor-nlf';
					paragraph.innerHTML = '<br />';
					dom.appendChild(wysiwygBody, paragraph);
					return false;
				}
			}

			// Last non-empty text node or line break.
			// No need to add line-break after them
			if ((node.nodeType === 3 && !/^\s*$/.test(node.nodeValue)) ||
				dom.is(node, 'br')) {
				return false;
			}
		});
	};

	/**
	 * Handles form reset event
	 * @private
	 */
	dragState = null;

	/**
	 * Blocks the grip can move. Matches the blocks that get a handle.
	 * @private
	 * @param {HTMLElement} el
	 * @return {boolean}
	 */
	var isDragBlock = function (el) {
		var name;

		if (!el || dom.is(el, '.sceditor-rail,.sceditor-drop,' +
			'.sceditor-ghost,.sceditor-nlf')) {
			return false;
		}

		name = el.nodeName;

		return name === 'P' || name === 'DIV' || name === 'BLOCKQUOTE' ||
			name === 'UL' || name === 'OL' || name === 'TABLE' ||
			name === 'PRE' || name === 'HR' ||
			(name.charAt(0) === 'H' && name.length === 2);
	};

	/**
	 * @private
	 * @return {Array<HTMLElement>}
	 */
	var dragBlocks = function () {
		var list = [];
		var i;
		var el;

		for (i = 0; i < wysiwygBody.children.length; i++) {
			el = wysiwygBody.children[i];

			if (isDragBlock(el)) {
				list.push(el);
			}
		}

		return list;
	};

	/**
	 * Gaps between blocks, ignoring the one being dragged so a tall
	 * picture does not steal the pointer from the short paragraphs.
	 * @private
	 * @param {HTMLElement} block
	 * @return {Array<{block: HTMLElement, before: boolean, y: number}>}
	 */
	var dragSlots = function (block) {
		var slots = [];
		var children = wysiwygBody.children;
		var el;
		var rect;
		var last = null;
		var i;

		for (i = 0; i < children.length; i++) {
			el = children[i];

			if (!isDragBlock(el) || el === block) {
				continue;
			}

			rect = el.getBoundingClientRect();
			slots.push({ block: el, before: true, y: rect.top });
			last = { block: el, y: rect.bottom };
		}

		if (last) {
			slots.push({ block: last.block, before: false, y: last.y });
		}

		return slots;
	};

	/**
	 * Sticks to the current gap until the pointer is clearly closer
	 * to the next one.
	 * @private
	 * @param {number} y
	 * @param {HTMLElement} block
	 * @param {?{block: HTMLElement, before: boolean, y: number}} current
	 * @return {?{block: HTMLElement, before: boolean, y: number}}
	 */
	var placeForDrag = function (y, block, current) {
		var slots = dragSlots(block);
		var best;
		var bestDist;
		var dist;
		var mid;
		var i;

		if (!slots.length) {
			return null;
		}

		best = slots[0];
		bestDist = Math.abs(y - best.y);

		for (i = 1; i < slots.length; i++) {
			dist = Math.abs(y - slots[i].y);

			if (dist < bestDist) {
				best = slots[i];
				bestDist = dist;
			}
		}

		if (!current || !current.block.parentNode ||
				(current.block === best.block &&
					current.before === best.before)) {
			return best;
		}

		mid = (current.y + best.y) / 2;

		if (best.y > current.y ? y > mid + 10 : y < mid - 10) {
			return best;
		}

		return current;
	};

	/**
	 * @private
	 * @param {?{block: HTMLElement, before: boolean}} place
	 */
	var showDropLine = function (place) {
		var line = wysiwygBody.querySelector('.sceditor-drop');
		var top;

		if (!place) {
			if (line) {
				dom.remove(line);
			}

			return;
		}

		top = place.block.offsetTop;

		if (!place.before) {
			top += place.block.offsetHeight;
		}

		if (!line) {
			line = dom.createElement('div', {
				className: 'sceditor-drop'
			}, wysiwygDocument);
			line.setAttribute('contenteditable', 'false');
			dom.appendChild(wysiwygBody, line);
		}

		line.style.top = top + 'px';
	};

	/**
	 * A faint copy of the block that follows the pointer.
	 * Drag still works if this cannot be drawn.
	 * @private
	 * @param {HTMLElement} block
	 * @param {number} y
	 */
	var placeDragGhost = function (block, y) {
		var ghost = wysiwygBody.querySelector('.sceditor-ghost');
		var copy;

		try {
			if (!ghost) {
				ghost = dom.createElement('div', {
					className: 'sceditor-ghost'
				}, wysiwygDocument);
				ghost.setAttribute('contenteditable', 'false');
				copy = block.cloneNode(true);
				dom.appendChild(ghost, copy);
				dom.appendChild(wysiwygBody, ghost);
			}

			ghost.style.top = (wysiwygWindow.pageYOffset + y - 20) + 'px';
		} catch (ex) {
			if (ex && ghost && ghost.parentNode) {
				dom.remove(ghost);
			}
		}
	};

	/**
	 * @private
	 * @param {number} y
	 */
	var scrollWhileDragging = function (y) {
		var height = wysiwygWindow.innerHeight;

		if (y < 28) {
			wysiwygWindow.scrollBy(0, -14);
		} else if (y > height - 28) {
			wysiwygWindow.scrollBy(0, 14);
		}
	};

	/**
	 * @private
	 */
	var stopBlockDrag = function () {
		var line = wysiwygBody.querySelector('.sceditor-drop');
		var ghost = wysiwygBody.querySelector('.sceditor-ghost');
		var source = wysiwygBody.querySelector('.is-drag-source');

		dom.removeClass(wysiwygBody, 'is-dragging');

		if (source) {
			dom.removeClass(source, 'is-drag-source');
		}

		if (line) {
			dom.remove(line);
		}

		if (ghost) {
			dom.remove(ghost);
		}

		dom.off(wysiwygDocument, 'pointermove', moveBlockDrag);
		dom.off(wysiwygDocument, 'pointerup', finishBlockDrag);
		dom.off(wysiwygDocument, 'pointercancel', finishBlockDrag);
	};

	/**
	 * @private
	 * @param {Event} e
	 */
	moveBlockDrag = function (e) {
		var dx;
		var dy;

		if (!dragState || e.pointerId !== dragState.pointer) {
			return;
		}

		dx = e.clientX - dragState.startX;
		dy = e.clientY - dragState.startY;

		if (!dragState.moved && (dx * dx) + (dy * dy) < 16) {
			return;
		}

		dragState.moved = true;
		e.preventDefault();
		dom.addClass(wysiwygBody, 'is-dragging');
		dom.addClass(dragState.block, 'is-drag-source');
		scrollWhileDragging(e.clientY);

		try {
			dragState.place = placeForDrag(
				e.clientY, dragState.block, dragState.place);
			showDropLine(dragState.place);
			placeDragGhost(dragState.block, e.clientY);
		} catch (ex) {
			if (ex && dragState) {
				dragState.failed = true;
			}
		}
	};

	/**
	 * @private
	 * @param {Event} e
	 */
	finishBlockDrag = function (e) {
		var state = dragState;
		var place;
		var block;
		var beforeNode;

		if (!state || (e && e.pointerId !== state.pointer)) {
			return;
		}

		dragState = null;
		place = state.place;
		block = state.block;
		stopBlockDrag();

		if (!state.moved || !place || !block.parentNode) {
			return;
		}

		beforeNode = place.before ? place.block : place.block.nextSibling;

		if (beforeNode === block || beforeNode === block.nextSibling) {
			return;
		}

		if (beforeNode) {
			dom.insertBefore(block, beforeNode);
		} else {
			dom.appendChild(wysiwygBody, block);
		}

		markers.labelBlocks(wysiwygBody);
		triggerValueChanged();
	};

	/**
	 * @private
	 * @param {Event} e
	 */
	startBlockDrag = function (e) {
		var handle;
		var handles;
		var blocks;
		var index;

		if (dragState || e.button !== 0 || base.readOnly()) {
			return;
		}

		handle = dom.closest(e.target, '.sceditor-drag');

		if (!handle) {
			return;
		}

		handles = wysiwygBody.querySelectorAll('.sceditor-drag');
		blocks = dragBlocks();
		index = Array.prototype.indexOf.call(handles, handle);

		if (index < 0 || !blocks[index]) {
			return;
		}

		e.preventDefault();
		e.stopPropagation();
		dragState = {
			pointer: e.pointerId,
			block: blocks[index],
			startX: e.clientX,
			startY: e.clientY,
			moved: false,
			place: null
		};

		if (handle.setPointerCapture) {
			try {
				handle.setPointerCapture(e.pointerId);
			// eslint-disable-next-line no-unused-vars
			} catch (ex) {
				// A real pointer is required. The document listeners
				// still track the drag.
			}
		}

		dom.on(wysiwygDocument, 'pointermove', moveBlockDrag);
		dom.on(wysiwygDocument, 'pointerup', finishBlockDrag);
		dom.on(wysiwygDocument, 'pointercancel', finishBlockDrag);
	};

	handleFormReset = function () {
		base.val(original.value);
	};

	/**
	 * Handles any mousedown press in the WYSIWYG editor
	 * @private
	 */
	handleMouseDown = function () {
		base.closeDropDown();
	};

	/**
	 * Translates the string into the locale language.
	 *
	 * Replaces any {0}, {1}, {2}, ect. with the params provided.
	 *
	 * @param {string} str
	 * @param {...String} args
	 * @return {string}
	 * @function
	 * @name _
	 * @memberOf SCEditor.prototype
	 */
	base._ = function () {
		var	undef,
			args = arguments;

		if (locale && locale[args[0]]) {
			args[0] = locale[args[0]];
		}

		return args[0].replace(/\{(\d+)\}/g, function (str, p1) {
			return args[p1 - 0 + 1] !== undef ?
				args[p1 - 0 + 1] :
				'{' + p1 + '}';
		});
	};

	/**
	 * Passes events on to any handlers
	 * @private
	 * @return void
	 */
	handleEvent = function (e) {
		if (pluginManager) {
			// Send event to all plugins
			pluginManager.call(e.type + 'Event', e, base);
		}

		// convert the event into a custom event to send
		var name = (e.target === sourceEditor ? 'scesrc' : 'scewys') + e.type;

		if (eventHandlers[name]) {
			eventHandlers[name].forEach(function (fn) {
				fn.call(base, e);
			});
		}
	};

	/**
	 * Binds a handler to the specified events
	 *
	 * This function only binds to a limited list of
	 * supported events.
	 *
	 * The supported events are:
	 *
	 * * keyup
	 * * keydown
	 * * Keypress
	 * * blur
	 * * focus
	 * * input
	 * * nodechanged - When the current node containing
	 * 		the selection changes in WYSIWYG mode
	 * * contextmenu
	 * * selectionchanged
	 * * valuechanged
	 *
	 *
	 * The events param should be a string containing the event(s)
	 * to bind this handler to. If multiple, they should be separated
	 * by spaces.
	 *
	 * @param  {string} events
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  if to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name bind
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.bind = function (events, handler, excludeWysiwyg, excludeSource) {
		events = events.split(' ');

		var i  = events.length;
		while (i--) {
			if (utils.isFunction(handler)) {
				var wysEvent = 'scewys' + events[i];
				var srcEvent = 'scesrc' + events[i];
				// Use custom events to allow passing the instance as the
				// 2nd argument.
				// Also allows unbinding without unbinding the editors own
				// event handlers.
				if (!excludeWysiwyg) {
					eventHandlers[wysEvent] = eventHandlers[wysEvent] || [];
					eventHandlers[wysEvent].push(handler);
				}

				if (!excludeSource) {
					eventHandlers[srcEvent] = eventHandlers[srcEvent] || [];
					eventHandlers[srcEvent].push(handler);
				}

				// Start sending value changed events
				if (events[i] === 'valuechanged') {
					triggerValueChanged.hasHandler = true;
				}
			}
		}

		return base;
	};

	/**
	 * Unbinds an event that was bound using bind().
	 *
	 * @param  {string} events
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude unbinding this
	 *                                  handler from the WYSIWYG editor
	 * @param  {boolean} excludeSource  if to exclude unbinding this
	 *                                  handler from the source editor
	 * @return {this}
	 * @function
	 * @name unbind
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 * @see bind
	 */
	base.unbind = function (events, handler, excludeWysiwyg, excludeSource) {
		events = events.split(' ');

		var i  = events.length;
		while (i--) {
			if (utils.isFunction(handler)) {
				if (!excludeWysiwyg) {
					utils.arrayRemove(
						eventHandlers['scewys' + events[i]] || [], handler);
				}

				if (!excludeSource) {
					utils.arrayRemove(
						eventHandlers['scesrc' + events[i]] || [], handler);
				}
			}
		}

		return base;
	};

	/**
	 * Blurs the editors input area
	 *
	 * @return {this}
	 * @function
	 * @name blur
	 * @memberOf SCEditor.prototype
	 * @since 1.3.6
	 */
	/**
	 * Adds a handler to the editors blur event
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  if to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name blur^2
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.blur = function (handler, excludeWysiwyg, excludeSource) {
		if (utils.isFunction(handler)) {
			base.bind('blur', handler, excludeWysiwyg, excludeSource);
		} else if (!base.sourceMode()) {
			wysiwygBody.blur();
		} else {
			sourceEditor.blur();
		}

		return base;
	};

	/**
	 * Focuses the editors input area
	 *
	 * @return {this}
	 * @function
	 * @name focus
	 * @memberOf SCEditor.prototype
	 */
	/**
	 * Adds an event handler to the focus event
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  if to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name focus^2
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.focus = function (handler, excludeWysiwyg, excludeSource) {
		if (utils.isFunction(handler)) {
			base.bind('focus', handler, excludeWysiwyg, excludeSource);
		} else if (base.mode() === 'preview') {
			if (previewEditor.contentWindow) {
				previewEditor.contentWindow.focus();
			}
		} else if (!base.inSourceMode()) {
			// Already has focus so do nothing
			if (dom.find(wysiwygDocument, ':focus').length) {
				return;
			}

			var container;
			var rng = rangeHelper.selectedRange();

			// Fix FF bug where it shows the cursor in the wrong place
			// if the editor hasn't had focus before. See issue #393
			if (!currentSelection) {
				autofocus(true);
			}

			// Check if cursor is set after a BR when the BR is the only
			// child of the parent. In Firefox this causes a line break
			// to occur when something is typed. See issue #321
			if (rng && rng.endOffset === 1 && rng.collapsed) {
				container = rng.endContainer;

				if (container && container.childNodes.length === 1 &&
					dom.is(container.firstChild, 'br')) {
					rng.setStartBefore(container.firstChild);
					rng.collapse(true);
					rangeHelper.selectRange(rng);
				}
			}

			wysiwygWindow.focus();
			wysiwygBody.focus();
		} else {
			sourceEditor.focus();
		}

		updateActiveButtons();

		return base;
	};

	/**
	 * Adds a handler to the key down event
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  If to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name keyDown
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.keyDown = function (handler, excludeWysiwyg, excludeSource) {
		return base.bind('keydown', handler, excludeWysiwyg, excludeSource);
	};

	/**
	 * Adds a handler to the key press event
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  If to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name keyPress
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.keyPress = function (handler, excludeWysiwyg, excludeSource) {
		return base
			.bind('keypress', handler, excludeWysiwyg, excludeSource);
	};

	/**
	 * Adds a handler to the key up event
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  If to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name keyUp
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.keyUp = function (handler, excludeWysiwyg, excludeSource) {
		return base.bind('keyup', handler, excludeWysiwyg, excludeSource);
	};

	/**
	 * Adds a handler to the node changed event.
	 *
	 * Happens whenever the node containing the selection/caret
	 * changes in WYSIWYG mode.
	 *
	 * @param  {Function} handler
	 * @return {this}
	 * @function
	 * @name nodeChanged
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.nodeChanged = function (handler) {
		return base.bind('nodechanged', handler, false, true);
	};

	/**
	 * Adds a handler to the selection changed event
	 *
	 * Happens whenever the selection changes in WYSIWYG mode.
	 *
	 * @param  {Function} handler
	 * @return {this}
	 * @function
	 * @name selectionChanged
	 * @memberOf SCEditor.prototype
	 * @since 1.4.1
	 */
	base.selectionChanged = function (handler) {
		return base.bind('selectionchanged', handler, false, true);
	};

	/**
	 * Adds a handler to the value changed event
	 *
	 * Happens whenever the current editor value changes.
	 *
	 * Whenever anything is inserted, the value changed or
	 * 1.5 secs after text is typed. If a space is typed it will
	 * cause the event to be triggered immediately instead of
	 * after 1.5 seconds
	 *
	 * @param  {Function} handler
	 * @param  {boolean} excludeWysiwyg If to exclude adding this handler
	 *                                  to the WYSIWYG editor
	 * @param  {boolean} excludeSource  If to exclude adding this handler
	 *                                  to the source editor
	 * @return {this}
	 * @function
	 * @name valueChanged
	 * @memberOf SCEditor.prototype
	 * @since 1.4.5
	 */
	base.valueChanged = function (handler, excludeWysiwyg, excludeSource) {
		return base
			.bind('valuechanged', handler, excludeWysiwyg, excludeSource);
	};

	/**
	 * Gets the current WYSIWYG editors inline CSS
	 *
	 * @return {string}
	 * @function
	 * @name css
	 * @memberOf SCEditor.prototype
	 * @since 1.4.3
	 */
	/**
	 * Sets inline CSS for the WYSIWYG editor
	 *
	 * @param {string} css
	 * @return {this}
	 * @function
	 * @name css^2
	 * @memberOf SCEditor.prototype
	 * @since 1.4.3
	 */
	base.css = function (css) {
		if (!inlineCss) {
			inlineCss = dom.createElement('style', {
				id: 'inline'
			}, wysiwygDocument);

			dom.appendChild(wysiwygDocument.head, inlineCss);
		}

		if (!utils.isString(css)) {
			return inlineCss.styleSheet ?
				inlineCss.styleSheet.cssText : inlineCss.innerHTML;
		}

		if (inlineCss.styleSheet) {
			inlineCss.styleSheet.cssText = css;
		} else {
			inlineCss.innerHTML = css;
		}

		return base;
	};

	/**
	 * Handles the keydown event, used for shortcuts
	 * @private
	 */
	handleKeyDown = function (e) {
		var	shortcut   = [],
			SHIFT_KEYS = {
				'`': '~',
				'1': '!',
				'2': '@',
				'3': '#',
				'4': '$',
				'5': '%',
				'6': '^',
				'7': '&',
				'8': '*',
				'9': '(',
				'0': ')',
				'-': '_',
				'=': '+',
				';': ':',
				'\'': '"',
				',': '<',
				'.': '>',
				'/': '?',
				'\\': '|',
				'[': '{',
				']': '}'
			},
			SPECIAL_KEYS = {
				8: 'backspace',
				9: 'tab',
				13: 'enter',
				19: 'pause',
				20: 'capslock',
				27: 'esc',
				32: 'space',
				33: 'pageup',
				34: 'pagedown',
				35: 'end',
				36: 'home',
				37: 'left',
				38: 'up',
				39: 'right',
				40: 'down',
				45: 'insert',
				46: 'del',
				91: 'win',
				92: 'win',
				93: 'select',
				96: '0',
				97: '1',
				98: '2',
				99: '3',
				100: '4',
				101: '5',
				102: '6',
				103: '7',
				104: '8',
				105: '9',
				106: '*',
				107: '+',
				109: '-',
				110: '.',
				111: '/',
				112: 'f1',
				113: 'f2',
				114: 'f3',
				115: 'f4',
				116: 'f5',
				117: 'f6',
				118: 'f7',
				119: 'f8',
				120: 'f9',
				121: 'f10',
				122: 'f11',
				123: 'f12',
				144: 'numlock',
				145: 'scrolllock',
				186: ';',
				187: '=',
				188: ',',
				189: '-',
				190: '.',
				191: '/',
				192: '`',
				219: '[',
				220: '\\',
				221: ']',
				222: '\''
			},
			NUMPAD_SHIFT_KEYS = {
				109: '-',
				110: 'del',
				111: '/',
				96: '0',
				97: '1',
				98: '2',
				99: '3',
				100: '4',
				101: '5',
				102: '6',
				103: '7',
				104: '8',
				105: '9'
			},
			which     = e.which,
			character = SPECIAL_KEYS[which] ||
				String.fromCharCode(which).toLowerCase();

		if (e.ctrlKey || e.metaKey) {
			shortcut.push('ctrl');
		}

		if (e.altKey) {
			shortcut.push('alt');
		}

		if (e.shiftKey) {
			shortcut.push('shift');

			if (NUMPAD_SHIFT_KEYS[which]) {
				character = NUMPAD_SHIFT_KEYS[which];
			} else if (SHIFT_KEYS[character]) {
				character = SHIFT_KEYS[character];
			}
		}

		// Shift is 16, ctrl is 17 and alt is 18
		if (character && (which < 16 || which > 18)) {
			shortcut.push(character);
		}

		shortcut = shortcut.join('+');
		if (shortcutHandlers[shortcut] &&
			shortcutHandlers[shortcut].call(base) === false) {

			e.stopPropagation();
			e.preventDefault();
		}
	};

	/**
	 * Adds a shortcut handler to the editor
	 * @param  {string}          shortcut
	 * @param  {String|Function} cmd
	 * @return {sceditor}
	 */
	base.addShortcut = function (shortcut, cmd) {
		shortcut = shortcut.toLowerCase();

		if (utils.isString(cmd)) {
			shortcutHandlers[shortcut] = function () {
				var button = toolbarButtons[cmd];

				if (button && dom.hasClass(button, 'disabled')) {
					return;
				}

				handleCommand(button, base.commands[cmd]);

				return false;
			};
		} else {
			shortcutHandlers[shortcut] = cmd;
		}

		return base;
	};

	/**
	 * Removes a shortcut handler
	 * @param  {string} shortcut
	 * @return {sceditor}
	 */
	base.removeShortcut = function (shortcut) {
		delete shortcutHandlers[shortcut.toLowerCase()];

		return base;
	};

	/**
	 * Deletes a marker chip when Backspace or Delete lands on it.
	 * The browser otherwise skips a contenteditable=false chip.
	 * @private
	 */
	handleMarkerKey = function (e) {
		var which = e.which;
		var direction = 0;
		var selection;
		var chip;
		var inputType;
		var inputEvent;

		if (which === 8) {
			direction = -1;
		} else if (which === 46) {
			direction = 1;
		}

		selection = wysiwygWindow && wysiwygWindow.getSelection();

		if (!direction || e.altKey || e.ctrlKey || e.metaKey || !selection ||
				!selection.rangeCount || !selection.isCollapsed) {
			return;
		}

		chip = markers.adjacentMarker(selection.getRangeAt(0), direction);

		if (!chip || !wysiwygBody.contains(chip)) {
			return;
		}

		e.preventDefault();
		e.stopImmediatePropagation();
		markers.removeChip(chip);
		inputType = direction < 0 ?
			'deleteContentBackward' : 'deleteContentForward';

		try {
			inputEvent = new InputEvent('input', {
				bubbles: true,
				inputType: inputType
			});
		} catch (ex) {
			inputEvent = wysiwygDocument.createEvent('Event');
			inputEvent.initEvent('input', true, !!ex);
		}

		wysiwygBody.dispatchEvent(inputEvent);
	};

	/**
	 * Handles the backspace key press
	 *
	 * Will remove block styling like quotes/code ect if at the start.
	 * @private
	 */
	handleBackSpace = function (e) {
		var	node, offset, range, parent;

		// 8 is the backspace key
		if (options.disableBlockRemove || e.which !== 8 ||
			!(range = rangeHelper.selectedRange())) {
			return;
		}

		node   = range.startContainer;
		offset = range.startOffset;

		if (offset !== 0 || !(parent = currentStyledBlockNode()) ||
			dom.is(parent, 'body')) {
			return;
		}

		while (node !== parent) {
			while (node.previousSibling) {
				node = node.previousSibling;

				// Everything but empty text nodes before the cursor
				// should prevent the style from being removed
				if (node.nodeType !== dom.TEXT_NODE || node.nodeValue) {
					return;
				}
			}

			if (!(node = node.parentNode)) {
				return;
			}
		}

		// The backspace was pressed at the start of
		// the container so clear the style
		base.clearBlockFormatting(parent);
		e.preventDefault();
	};

	/**
	 * Gets the first styled block node that contains the cursor
	 * @return {HTMLElement}
	 */
	currentStyledBlockNode = function () {
		var block = currentBlockNode;

		while (!dom.hasStyling(block) || dom.isInline(block, true)) {
			if (!(block = block.parentNode) || dom.is(block, 'body')) {
				return;
			}
		}

		return block;
	};

	/**
	 * Clears the formatting of the passed block element.
	 *
	 * If block is false, if will clear the styling of the first
	 * block level element that contains the cursor.
	 * @param  {HTMLElement} block
	 * @since 1.4.4
	 */
	base.clearBlockFormatting = function (block) {
		block = block || currentStyledBlockNode();

		if (!block || dom.is(block, 'body')) {
			return base;
		}

		rangeHelper.saveRange();

		block.className = '';

		dom.attr(block, 'style', '');

		if (!dom.is(block, 'p,div,td')) {
			dom.convertElement(block, 'p');
		}

		rangeHelper.restoreRange();
		return base;
	};

	/**
	 * Triggers the valueChanged signal if there is
	 * a plugin that handles it.
	 *
	 * If rangeHelper.saveRange() has already been
	 * called, then saveRange should be set to false
	 * to prevent the range being saved twice.
	 *
	 * @since 1.4.5
	 * @param {boolean} saveRange If to call rangeHelper.saveRange().
	 * @private
	 */
	triggerValueChanged = function (saveRange) {
		if (!pluginManager ||
			(!pluginManager.hasHandler('valuechangedEvent') &&
				!triggerValueChanged.hasHandler)) {
			return;
		}

		var	currentHtml,
			sourceMode   = base.sourceMode(),
			hasSelection = !sourceMode && rangeHelper.hasSelection();

		// Composition end isn't guaranteed to fire but must have
		// ended when triggerValueChanged() is called so reset it
		isComposing = false;

		// Don't need to save the range if sceditor-start-marker
		// is present as the range is already saved
		saveRange = saveRange !== false &&
			!wysiwygDocument.getElementById('sceditor-start-marker');

		// Clear any current timeout as it's now been triggered
		if (valueChangedKeyUpTimer) {
			clearTimeout(valueChangedKeyUpTimer);
			valueChangedKeyUpTimer = false;
		}

		if (hasSelection && saveRange) {
			rangeHelper.saveRange();
		}

		currentHtml = sourceMode ? sourceEditor.value : wysiwygBody.innerHTML;

		// Only trigger if something has actually changed.
		if (currentHtml !== triggerValueChanged.lastVal) {
			triggerValueChanged.lastVal = currentHtml;

			dom.trigger(editorContainer, 'valuechanged', {
				rawValue: sourceMode ? base.val() : currentHtml
			});
		}

		if (hasSelection && saveRange) {
			rangeHelper.removeMarkers();
		}
	};

	/**
	 * Should be called whenever there is a blur event
	 * @private
	 */
	valueChangedBlur = function () {
		if (valueChangedKeyUpTimer) {
			triggerValueChanged();
		}
	};

	/**
	 * Should be called whenever there is a keypress event
	 * @param  {Event} e The keypress event
	 * @private
	 */
	valueChangedKeyUp = function (e) {
		var which         = e.which,
			lastChar      = valueChangedKeyUp.lastChar,
			lastWasSpace  = (lastChar === 13 || lastChar === 32),
			lastWasDelete = (lastChar === 8 || lastChar === 46);

		valueChangedKeyUp.lastChar = which;

		if (isComposing) {
			return;
		}

		// 13 = return & 32 = space
		if (which === 13 || which === 32) {
			if (!lastWasSpace) {
				triggerValueChanged();
			} else {
				valueChangedKeyUp.triggerNext = true;
			}
		// 8 = backspace & 46 = del
		} else if (which === 8 || which === 46) {
			if (!lastWasDelete) {
				triggerValueChanged();
			} else {
				valueChangedKeyUp.triggerNext = true;
			}
		} else if (valueChangedKeyUp.triggerNext) {
			triggerValueChanged();
			valueChangedKeyUp.triggerNext = false;
		}

		// Clear the previous timeout and set a new one.
		clearTimeout(valueChangedKeyUpTimer);

		// Trigger the event 1.5s after the last keypress if space
		// isn't pressed. This might need to be lowered, will need
		// to look into what the slowest average Chars Per Min is.
		valueChangedKeyUpTimer = setTimeout(function () {
			if (!isComposing) {
				triggerValueChanged();
			}
		}, 1500);
	};

	handleComposition = function (e) {
		isComposing = /start/i.test(e.type);

		if (!isComposing) {
			triggerValueChanged();
		}
	};

	autoUpdate = function () {
		base.updateOriginal();
	};

	// run the initializer
	init();
};


/**
 * Map containing the loaded SCEditor locales
 * @type {Object}
 * @name locale
 * @memberOf sceditor
 */
SCEditor.locale = {};

SCEditor.formats = {};
SCEditor.icons = {};


/**
 * Static command helper class
 * @class command
 * @name sceditor.command
 */
SCEditor.command =
/** @lends sceditor.command */
{
	/**
	 * Gets a command
	 *
	 * @param {string} name
	 * @return {Object|null}
	 * @since v1.3.5
	 */
	get: function (name) {
		return defaultCommands[name] || null;
	},

	/**
	 * <p>Adds a command to the editor or updates an existing
	 * command if a command with the specified name already exists.</p>
	 *
	 * <p>Once a command is add it can be included in the toolbar by
	 * adding it's name to the toolbar option in the constructor. It
	 * can also be executed manually by calling
	 * {@link sceditor.execCommand}</p>
	 *
	 * @example
	 * SCEditor.command.set("hello",
	 * {
	 *     exec: function () {
	 *         alert("Hello World!");
	 *     }
	 * });
	 *
	 * @param {string} name
	 * @param {Object} cmd
	 * @return {this|false} Returns false if name or cmd is false
	 * @since v1.3.5
	 */
	set: function (name, cmd) {
		if (!name || !cmd) {
			return false;
		}

		// merge any existing command properties
		cmd = utils.extend(defaultCommands[name] || {}, cmd);

		cmd.remove = function () {
			SCEditor.command.remove(name);
		};

		defaultCommands[name] = cmd;
		return this;
	},

	/**
	 * Removes a command
	 *
	 * @param {string} name
	 * @return {this}
	 * @since v1.3.5
	 */
	remove: function (name) {
		if (defaultCommands[name]) {
			delete defaultCommands[name];
		}

		return this;
	}
};
