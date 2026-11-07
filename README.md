# SCEditor — форк

Это форк [SCEditor](https://github.com/samclarke/SCEditor) для внутренних проектов.

Оригинал: [samclarke/SCEditor](https://github.com/samclarke/SCEditor), сайт [sceditor.com](http://www.sceditor.com/).  
Основа этой ветки — версия **3.2.3**. Лицензия оригинала и правок форка — MIT, текст ниже и в [LICENSE.md](LICENSE.md).

Форк урезан под свои задачи и не повторяет апстрим один в один. Сообщения об ошибках оригинала по-прежнему относятся к репозиторию Sam Clarke, а не сюда.

## Usage

```html
<link rel="stylesheet" href="minified/themes/square.min.css" />
<script src="minified/sceditor.min.js"></script>
<script src="minified/formats/xhtml.min.js"></script>
```

```js
var textarea = document.getElementById('id-of-textarea');

sceditor.create(textarea, {
	format: 'xhtml',
	style: 'minified/themes/content/default.min.css'
});
```

`style` — стили внутри рамки редактора. Без этого файла нет колонки блоков и перетаскивания. Тема `square.min.css` рисует только внешнюю панель.

```js
sceditor.instance(textarea).val();
```

Опции апстрима: [options](http://www.sceditor.com/documentation/options/).

## Building and testing

Нужны Node.js 18+ и Grunt.

```bash
npm install
npm install -g grunt-cli
```

```bash
grunt build
grunt test
npm run dev
```

`npm run dev` открывает http://localhost:9000/tests/ . Пример после сборки: `example/example.html`.

## License

Оригинал: Copyright (C) 2011–2017 Sam Clarke and contributors, [sceditor.com](http://www.sceditor.com/).

Правки этого форка распространяются на тех же условиях MIT. Полный текст: [LICENSE.md](LICENSE.md).
