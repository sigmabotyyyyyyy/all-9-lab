/* Лабораторная работа №9. Общие функции HTTP, DOM и состояний интерфейса. */
const Lab = (() => {
  'use strict';
  const API = 'https://jsonplaceholder.typicode.com';
  const variants = new Map();
  let cleanups = [];
  let fieldId = 0;
  let requestCount = 0;
  const logEntries = [];

  function el(tag, className = '', text = '') {
    const node = document.createElement(tag);
    if (className) node.className = className;
    // Ответы API всегда добавляются как текст: HTML из ответа не исполняется.
    if (text !== '' && text !== null && text !== undefined) node.textContent = String(text);
    return node;
  }

  function button(label, handler, className = 'button') {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', handler);
    return node;
  }

  function input(placeholder = '', value = '', type = 'text') {
    const node = el('input');
    node.type = type;
    node.placeholder = placeholder;
    node.value = String(value);
    return node;
  }

  function select(options, value) {
    const node = el('select');
    for (const [id, label] of options) {
      const option = el('option', '', label);
      option.value = String(id);
      node.append(option);
    }
    if (value !== undefined) node.value = String(value);
    return node;
  }

  function field(label, control) {
    const wrapper = el('div', 'field');
    if (!control.id) control.id = `field-${++fieldId}`;
    const caption = el('label', '', label);
    caption.htmlFor = control.id;
    wrapper.append(caption, control);
    return wrapper;
  }

  function empty(container, text = 'Ничего не найдено.') {
    container.replaceChildren(el('div', 'empty', text));
  }

  function renderList(container, items, renderer, emptyText = 'Ничего не найдено.') {
    if (!items.length) { empty(container, emptyText); return; }
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => fragment.append(renderer(item, index)));
    container.replaceChildren(fragment);
  }

  function asArray(data) {
    if (!Array.isArray(data) || data.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error('Некорректная структура ответа: ожидался массив объектов.');
    }
    return data;
  }

  function asObject(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Number.isInteger(data.id) || data.id <= 0) {
      throw new Error('Ресурс отсутствует или сервер прислал некорректный объект.');
    }
    return data;
  }

  function positiveId(raw) {
    const value = String(raw).trim();
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) {
      throw new Error('Введите положительный целый ID: например, 1.');
    }
    return Number(value);
  }

  function message(error) {
    if (error?.name === 'TimeoutError') return 'Сервер не ответил за 20 секунд. Повторите запрос.';
    if (error?.name === 'AbortError') return 'Запрос отменён.';
    if (error instanceof SyntaxError) return 'Сервер прислал некорректный JSON.';
    if (error instanceof TypeError) return 'Не удалось получить данные. Проверьте интернет, доступность API и повторите запрос.';
    return error?.message || 'Неизвестная ошибка загрузки.';
  }

  function drawLog() {
    const list = document.querySelector('#request-log');
    document.querySelector('#request-count').textContent = String(requestCount);
    if (!list) return;
    list.replaceChildren();
    for (const record of logEntries) {
      const row = el('li');
      row.append(el('span', 'log-time', record.time), el('code', 'log-path', `GET ${record.path}`),
        el('span', `log-outcome ${record.kind}`, record.outcome),
        el('span', 'log-ms', record.duration === null ? '…' : `${record.duration} мс`));
      list.append(row);
    }
  }

  // Fetch не отклоняет Promise при HTTP 404/500: response.ok проверяется явно.
  async function request(path, { signal } = {}) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal?.aborted) throw new DOMException('Отменено', 'AbortError');
    signal?.addEventListener('abort', forwardAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    const start = performance.now();
    requestCount++;
    const record = { path, time: new Date().toLocaleTimeString('ru-RU'), outcome: 'Загрузка', kind: '', duration: null };
    logEntries.unshift(record);
    if (logEntries.length > 8) logEntries.pop();
    drawLog();

    try {
      const response = await fetch(`${API}${path}`, {
        method: 'GET', signal: controller.signal, cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) {
        const error = new Error(response.status === 404
          ? 'Ресурс не найден (HTTP 404). Проверьте введённый ID.'
          : `Ошибка сервера: HTTP ${response.status}. Попробуйте ещё раз.`);
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      if (controller.signal.aborted) throw new DOMException('Отменено', 'AbortError');
      const totalHeader = response.headers.get('X-Total-Count');
      const totalNumber = totalHeader === null ? NaN : Number(totalHeader);
      const total = Number.isSafeInteger(totalNumber) && totalNumber >= 0 ? totalNumber : null;
      record.outcome = `HTTP ${response.status}`;
      record.duration = Math.round(performance.now() - start);
      document.querySelector('#response-time').textContent = `${record.duration} мс`;
      return { data, total, status: response.status, duration: record.duration, url: response.url };
    } catch (caught) {
      let error = caught;
      if (timedOut) error = new DOMException('Время ожидания истекло', 'TimeoutError');
      record.kind = error.name === 'AbortError' ? 'cancelled' : 'error';
      record.outcome = error.name === 'AbortError' ? 'Отменён' : error.status ? `HTTP ${error.status}` : 'Ошибка';
      record.duration = Math.round(performance.now() - start);
      document.querySelector('#response-time').textContent = `${record.duration} мс`;
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
      drawLog();
    }
  }

  // Одна панель — один актуальный запрос. Старый ответ не может перезаписать новый.
  function panel(root, title = '') {
    const box = el('section', 'panel');
    if (title) box.append(el('h3', 'panel-title', title));
    const controls = el('div', 'controls');
    const status = el('p', 'status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const results = el('div', 'results cards');
    let sequence = 0;
    let active = null;
    let disposed = false;
    let lastOperation = null;
    const retry = button('Повторить', () => {
      if (lastOperation) run(...lastOperation);
    }, 'button secondary retry-button');
    retry.hidden = true;
    box.append(controls, status, retry, results);
    root.append(box);
    const setStatus = (state, text) => {
      if (disposed) return;
      status.dataset.state = state;
      status.textContent = text;
    };
    setStatus('idle', 'Нажмите кнопку, чтобы загрузить данные.');
    empty(results, 'Данные появятся здесь.');

    function cancel() {
      sequence++;
      if (active) {
        active.abort();
        active = null;
        setStatus('idle', 'Запрос отменён.');
      }
      retry.hidden = true;
      box.setAttribute('aria-busy', 'false');
    }

    async function run(work, render) {
      if (disposed) return false;
      cancel();
      const token = sequence;
      const controller = new AbortController();
      active = controller;
      lastOperation = [work, render];
      retry.hidden = true;
      results.replaceChildren();
      setStatus('loading', 'Загрузка данных…');
      box.setAttribute('aria-busy', 'true');
      try {
        const data = await work(controller.signal);
        if (disposed || token !== sequence || controller.signal.aborted) return false;
        const successText = render(data);
        setStatus('success', typeof successText === 'string' ? successText : 'Успех. Данные загружены.');
        return true;
      } catch (error) {
        if (disposed || token !== sequence) return false;
        if (error.name === 'AbortError') {
          setStatus('idle', 'Запрос отменён.');
        } else {
          setStatus('error', `Ошибка. ${message(error)}`);
          empty(results, 'Данные не загружены. Устраните причину и повторите запрос.');
          retry.hidden = false;
        }
        return false;
      } finally {
        if (token === sequence) {
          active = null;
          box.setAttribute('aria-busy', 'false');
        }
      }
    }

    function clear(text = '') {
      results.replaceChildren();
      if (text) empty(results, text);
    }
    cleanup(() => { cancel(); disposed = true; });
    return { box, controls, status, results, retry, run, cancel, setStatus, clear };
  }

  function card(type, item) {
    const node = el('article', `item-card ${type}-card`);
    node.dataset.id = String(item.id ?? '');
    return node;
  }

  function postCard(post, { body = true, onComments = null } = {}) {
    const node = card('post', post);
    const meta = el('div', 'card-meta');
    meta.append(el('span', 'id-tag', `ПУБЛИКАЦИЯ #${post.id ?? '—'}`), el('span', 'badge', `userId ${post.userId ?? '—'}`));
    node.append(meta, el('h3', '', post.title ?? 'Без названия'));
    if (body) node.append(el('p', 'muted', post.body ?? 'Текст не указан.'));
    if (onComments) node.append(button('Показать комментарии', () => onComments(post), 'button secondary small'));
    return node;
  }

  function userCard(user, onPosts = null) {
    const node = card('user', user);
    node.append(el('span', 'id-tag', `ПОЛЬЗОВАТЕЛЬ #${user.id ?? '—'}`), el('h3', '', user.name ?? 'Имя не указано'),
      el('p', '', user.email ?? 'Email не указан'),
      el('p', 'muted', `Город: ${user.address?.city ?? 'не указан'}`),
      el('p', 'muted', `Компания: ${user.company?.name ?? 'не указана'}`));
    if (onPosts) node.append(button('Показать публикации', () => onPosts(user), 'button secondary small'));
    return node;
  }

  function todoCard(todo) {
    const node = card('todo', todo);
    const done = todo.completed === true;
    node.classList.toggle('completed', done);
    node.dataset.completed = String(done);
    node.dataset.userId = String(todo.userId ?? '');
    const meta = el('div', 'card-meta');
    meta.append(el('span', 'id-tag', `ЗАДАЧА #${todo.id ?? '—'}`), el('span', 'todo-state', done ? 'Выполнена' : 'Не выполнена'));
    node.append(meta, el('h3', '', todo.title ?? 'Без названия'), el('p', 'muted', `Пользователь №${todo.userId ?? '—'}`));
    return node;
  }

  function albumCard(album, onPhotos = null) {
    const node = card('album', album);
    node.append(el('span', 'id-tag', `АЛЬБОМ #${album.id ?? '—'}`), el('h3', '', album.title ?? 'Без названия'));
    if (onPhotos) node.append(button('Открыть фотографии', () => onPhotos(album), 'button secondary small'));
    return node;
  }

  function photoCard(photo) {
    const node = card('photo', photo);
    const frame = el('div', 'photo-frame');
    const fallback = () => frame.replaceChildren(el('p', 'photo-fallback', `Изображение недоступно\nФотография №${photo.id ?? '—'}`));
    try {
      const url = new URL(String(photo.thumbnailUrl || photo.url || ''));
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Неподдерживаемый URL');
      const img = el('img');
      img.alt = String(photo.title ?? `Фотография №${photo.id ?? '—'}`);
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', fallback, { once: true });
      img.src = url.href;
      frame.append(img);
    } catch { fallback(); }
    const content = el('div', 'photo-content');
    content.append(el('span', 'id-tag', `ФОТО #${photo.id ?? '—'} · АЛЬБОМ ${photo.albumId ?? '—'}`), el('h3', '', photo.title ?? 'Без названия'));
    node.append(frame, content);
    return node;
  }

  function commentCard(comment) {
    const node = card('comment', comment);
    node.append(el('span', 'id-tag', `КОММЕНТАРИЙ #${comment.id ?? '—'}`), el('h3', '', comment.name ?? 'Без имени'),
      el('p', '', comment.email ?? 'Email не указан'), el('p', 'muted', comment.body ?? 'Текст не указан.'));
    return node;
  }

  function stats(items) {
    const row = el('div', 'stat-grid');
    for (const [label, value] of items) {
      const box = el('div', 'stat-box');
      box.append(el('span', 'metric', value), el('span', 'muted', label));
      row.append(box);
    }
    return row;
  }

  function cleanup(fn) { cleanups.push(fn); }
  function dispose() { cleanups.splice(0).forEach(fn => fn()); }
  function register(variant) {
    if (variants.has(variant.id)) throw new Error(`Повтор варианта ${variant.id}`);
    variants.set(variant.id, variant);
  }
  return { API, variants, register, dispose, cleanup, el, button, input, select, field,
    empty, renderList, asArray, asObject, positiveId, message, request, panel,
    postCard, userCard, todoCard, albumCard, photoCard, commentCard, stats };
})();


/* Уровни 1 и 2. Каждый вариант регистрирует свою разметку и обработчики. */
(function () {
  'use strict';

  const { el, button, field, input, select, panel, request, asArray, asObject,
    renderList, postCard, userCard, todoCard, albumCard, photoCard, commentCard } = Lab;

  // Общая операция: получить JSON-массив и проверить его структуру.
  async function getList(path, signal) {
    const response = await request(path, { signal });
    return asArray(response.data);
  }

  function onEnter(control, action) {
    control.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        action();
      }
    });
  }

  function numericId(id, value) {
    const control = input('Например, 1', String(value));
    control.id = id;
    control.inputMode = 'numeric';
    control.autocomplete = 'off';
    return control;
  }

  // Варианты 1–5 отличаются ресурсом, количеством записей и видом карточки.
  function registerList({ id, title, description, path, label, renderer }) {
    Lab.register({
      id, level: 1, title, description, endpoint: path,
      mount(root) {
        const p = panel(root);
        p.box.dataset.variantPanel = String(id);
        const load = () => p.run(
          (signal) => getList(path, signal),
          (items) => {
            renderList(p.results, items, renderer);
            return `Успех. Загружено записей: ${items.length}.`;
          }
        );
        const loadButton = button(label, load);
        loadButton.id = `v${id}-load`;
        p.controls.append(loadButton);
        load();
      }
    });
  }

  registerList({
    id: 1, title: '10 публикаций',
    description: 'Первые 10 публикаций: номер и заголовок каждой записи.',
    path: '/posts?_limit=10', label: 'Загрузить публикации',
    renderer: (post) => postCard(post, { body: false })
  });
  registerList({
    id: 2, title: 'Пользователи',
    description: 'Имена пользователей и адреса электронной почты.',
    path: '/users', label: 'Загрузить пользователей', renderer: (user) => userCard(user)
  });
  registerList({
    id: 3, title: '10 задач',
    description: 'Выполненные задачи выделены цветом и подписью статуса.',
    path: '/todos?_limit=10', label: 'Загрузить задачи', renderer: (todo) => todoCard(todo)
  });
  registerList({
    id: 4, title: '15 альбомов',
    description: 'Первые 15 альбомов: номер и название.',
    path: '/albums?_limit=15', label: 'Загрузить альбомы', renderer: (album) => albumCard(album)
  });
  registerList({
    id: 5, title: '12 фотографий',
    description: 'Названия и миниатюры фотографий. Если картинка недоступна, показана текстовая замена.',
    path: '/photos?_limit=12', label: 'Загрузить фотографии', renderer: (photo) => photoCard(photo)
  });

  Lab.register({
    id: 6, level: 1, title: 'Публикация по ID',
    description: 'Введите положительный целый ID. Заголовок и текст публикации загрузятся без перезагрузки страницы.',
    endpoint: '/posts/{id}',
    mount(root) {
      const p = panel(root);
      const idInput = numericId('v6-id', 1);
      const load = () => p.run(
        async (signal) => {
          const id = Lab.positiveId(idInput.value);
          return asObject((await request(`/posts/${id}`, { signal })).data);
        },
        (post) => {
          renderList(p.results, [post], (item) => postCard(item));
          return `Успех. Получена публикация №${post.id}.`;
        }
      );
      const loadButton = button('Найти публикацию', load);
      loadButton.id = 'v6-load';
      p.controls.append(field('ID публикации', idInput), loadButton);
      p.controls.append(el('p', 'hint', 'Для проверки отсутствующего ресурса введите 9999.'));
      onEnter(idInput, load);
      load();
    }
  });

  Lab.register({
    id: 7, level: 1, title: 'Пользователь по ID',
    description: 'По ID пользователя показываются имя, город, компания и электронная почта.',
    endpoint: '/users/{id}',
    mount(root) {
      const p = panel(root);
      const idInput = numericId('v7-id', 1);
      const load = () => p.run(
        async (signal) => {
          const id = Lab.positiveId(idInput.value);
          return asObject((await request(`/users/${id}`, { signal })).data);
        },
        (user) => {
          renderList(p.results, [user], (item) => userCard(item));
          return `Успех. Получен пользователь №${user.id}.`;
        }
      );
      const loadButton = button('Найти пользователя', load);
      loadButton.id = 'v7-load';
      p.controls.append(field('ID пользователя', idInput), loadButton);
      onEnter(idInput, load);
      load();
    }
  });

  Lab.register({
    id: 8, level: 2, title: 'Поиск по заголовку',
    description: 'Публикации загружаются один раз. Поиск работает на клиенте и не отправляет запрос при каждом вводе.',
    endpoint: '/posts',
    mount(root) {
      const p = panel(root);
      const search = input('Часть заголовка, например sunt');
      search.id = 'v8-search';
      search.type = 'search';
      search.disabled = true;
      let posts = [];
      function render() {
        const term = search.value.trim().toLocaleLowerCase();
        const filtered = posts.filter((post) => String(post.title ?? '').toLocaleLowerCase().includes(term));
        renderList(p.results, filtered, (post) => postCard(post));
        return `Успех. Найдено: ${filtered.length} из ${posts.length}. Поиск выполняется в браузере.`;
      }
      const load = () => {
        search.disabled = true;
        return p.run(
          (signal) => getList('/posts', signal),
          (items) => {
            posts = items;
            search.disabled = false;
            return render();
          }
        );
      };
      search.addEventListener('input', () => p.setStatus('success', render()));
      p.controls.append(field('Поиск в заголовках', search), button('Загрузить заново', load));
      load();
    }
  });

  Lab.register({
    id: 9, level: 2, title: 'Фильтр задач',
    description: 'Переключайте все, выполненные и невыполненные задачи после загрузки списка.',
    endpoint: '/todos',
    mount(root) {
      const p = panel(root);
      let todos = [];
      const filter = select([['all', 'Все'], ['done', 'Выполненные'], ['active', 'Невыполненные']], 'all');
      filter.id = 'v9-status';
      filter.disabled = true;
      function render() {
        const items = todos.filter((todo) => filter.value === 'all' || (filter.value === 'done' ? todo.completed === true : todo.completed === false));
        renderList(p.results, items, (todo) => todoCard(todo));
        return `Успех. Показано задач: ${items.length} из ${todos.length}.`;
      }
      const load = () => {
        filter.disabled = true;
        return p.run(
          (signal) => getList('/todos', signal),
          (items) => {
            todos = items;
            filter.disabled = false;
            return render();
          }
        );
      };
      filter.addEventListener('change', () => p.setStatus('success', render()));
      p.controls.append(field('Статус задачи', filter), button('Обновить задачи', load));
      load();
    }
  });

  Lab.register({
    id: 10, level: 2, title: 'Публикации пользователя',
    description: 'Серверная фильтрация публикаций по выбранному userId.',
    endpoint: '/posts?userId=...',
    mount(root) {
      const p = panel(root);
      const users = select(Array.from({ length: 10 }, (_, i) => [String(i + 1), `Пользователь №${i + 1}`]), '1');
      users.id = 'v10-user';
      const load = () => {
        const selectedId = users.value;
        return p.run(
          (signal) => getList(`/posts?userId=${encodeURIComponent(selectedId)}`, signal),
          (posts) => {
            renderList(p.results, posts, (post) => postCard(post));
            return `Успех. Пользователь №${selectedId}: ${posts.length} публикаций.`;
          }
        );
      };
      users.addEventListener('change', load);
      p.controls.append(field('ID пользователя (userId)', users), button('Загрузить публикации', load));
      load();
    }
  });

  Lab.register({
    id: 11, level: 2, title: 'Комментарии по ID',
    description: 'Загрузка авторов, адресов почты и текстов комментариев к выбранной публикации.',
    endpoint: '/posts/{id}/comments',
    mount(root) {
      const p = panel(root);
      const idInput = numericId('v11-id', 1);
      const load = () => p.run(
        async (signal) => {
          const id = Lab.positiveId(idInput.value);
          return { id, comments: await getList(`/posts/${id}/comments`, signal) };
        },
        ({ id, comments }) => {
          renderList(p.results, comments, (comment) => commentCard(comment), 'Комментарии не найдены. Возможно, публикации с таким ID нет.');
          return comments.length ? `Успех. Комментариев к публикации №${id}: ${comments.length}.` : `Успех. Для публикации №${id} сервер вернул пустой список.`;
        }
      );
      const loadButton = button('Загрузить комментарии', load);
      loadButton.id = 'v11-load';
      p.controls.append(field('ID публикации', idInput), loadButton);
      onEnter(idInput, load);
      load();
    }
  });

  Lab.register({
    id: 12, level: 2, title: 'Пагинация публикаций',
    description: 'Постраничная загрузка с параметрами _page и _limit. Переключение страницы не перезагружает документ.',
    endpoint: '/posts?_page=...&_limit=...',
    mount(root) {
      const p = panel(root);
      const size = select([['5', '5 записей'], ['10', '10 записей'], ['20', '20 записей']], '10');
      size.id = 'v12-limit';
      const pageLabel = el('span', 'badge', 'Страница 1');
      pageLabel.id = 'v12-page';
      const prev = button('Назад', () => loadPage(currentPage - 1), 'button secondary');
      const next = button('Вперёд', () => loadPage(currentPage + 1), 'button secondary');
      prev.id = 'v12-prev';
      next.id = 'v12-next';
      let currentPage = 1;
      let currentRows = [];
      let canNext = false;
      let revision = 0;
      function updateButtons(loading) {
        prev.disabled = loading || currentPage <= 1;
        next.disabled = loading || !canNext;
        size.disabled = loading;
      }
      async function loadPage(targetPage) {
        if (targetPage < 1) return;
        const ownRevision = ++revision;
        const limit = Number(size.value);
        updateButtons(true);
        await p.run(
          async (signal) => {
            const response = await request(`/posts?_page=${targetPage}&_limit=${limit}`, { signal });
            return { rows: asArray(response.data), total: response.total };
          },
          ({ rows, total }) => {
            // Если сервер не прислал total, пустая следующая страница не стирает последнюю.
            if (!rows.length && targetPage > 1 && currentRows.length) {
              canNext = false;
              renderList(p.results, currentRows, (post) => postCard(post));
              updateButtons(false);
              return 'Успех. Это последняя страница; дополнительные записи отсутствуют.';
            }
            currentPage = targetPage;
            currentRows = rows;
            const hasTotal = typeof total === 'number' && Number.isFinite(total);
            const pageCount = hasTotal ? Math.max(1, Math.ceil(total / limit)) : null;
            canNext = hasTotal ? currentPage < pageCount : rows.length === limit;
            pageLabel.textContent = pageCount ? `Страница ${currentPage} из ${pageCount}` : `Страница ${currentPage}`;
            renderList(p.results, rows, (post) => postCard(post));
            updateButtons(false);
            return `Успех. Страница ${currentPage}; показано записей: ${rows.length}.`;
          }
        );
        if (ownRevision === revision) updateButtons(false);
      }
      size.addEventListener('change', () => {
        currentRows = [];
        currentPage = 1;
        canNext = false;
        pageLabel.textContent = 'Страница 1';
        loadPage(1);
      });
      p.controls.append(field('Размер страницы', size), prev, pageLabel, next,
        button('Обновить страницу', () => loadPage(currentPage)));
      loadPage(1);
    }
  });

  Lab.register({
    id: 13, level: 2, title: 'Карточки и публикации',
    description: 'Выберите пользователя на карточке. Связанные публикации загружаются только по нажатию.',
    endpoint: '/users → /posts?userId=...',
    mount(root) {
      const usersPanel = panel(root, 'Пользователи');
      const postsPanel = panel(root, 'Публикации выбранного пользователя');
      usersPanel.box.id = 'v13-users';
      postsPanel.box.id = 'v13-posts';
      postsPanel.clear('Нажмите «Показать публикации» на карточке пользователя.');
      function showPosts(user) {
        postsPanel.cancel();
        postsPanel.clear();
        for (const card of usersPanel.results.querySelectorAll('.user-card')) {
          card.classList.toggle('selected', card.dataset.id === String(user.id));
        }
        return postsPanel.run(
          (signal) => getList(`/posts?userId=${encodeURIComponent(user.id)}`, signal),
          (posts) => {
            renderList(postsPanel.results, posts, (post) => postCard(post));
            return `Успех. ${user.name}: ${posts.length} публикаций.`;
          }
        );
      }
      const load = () => {
        postsPanel.cancel();
        postsPanel.clear('Выберите пользователя после загрузки списка.');
        postsPanel.setStatus('idle', 'Пользователь ещё не выбран.');
        return usersPanel.run(
          (signal) => getList('/users', signal),
          (users) => {
            renderList(usersPanel.results, users, (user) => userCard(user, () => showPosts(user)));
            return `Успех. Загружено пользователей: ${users.length}.`;
          }
        );
      };
      usersPanel.controls.append(button('Обновить пользователей', load));
      load();
    }
  });

  Lab.register({
    id: 14, level: 2, title: 'Альбомы и фотографии',
    description: 'Откройте альбом из каталога, чтобы загрузить его фотографии отдельным запросом.',
    endpoint: '/albums → /albums/{id}/photos',
    mount(root) {
      const albumsPanel = panel(root, 'Каталог альбомов');
      const photosPanel = panel(root, 'Фотографии выбранного альбома');
      albumsPanel.box.id = 'v14-albums';
      photosPanel.box.id = 'v14-photos';
      photosPanel.clear('Выберите альбом в каталоге.');
      function showPhotos(album) {
        photosPanel.cancel();
        photosPanel.clear();
        for (const card of albumsPanel.results.querySelectorAll('.album-card')) {
          card.classList.toggle('selected', card.dataset.id === String(album.id));
        }
        return photosPanel.run(
          (signal) => getList(`/albums/${encodeURIComponent(album.id)}/photos`, signal),
          (photos) => {
            renderList(photosPanel.results, photos, (photo) => photoCard(photo));
            return `Успех. Альбом №${album.id}: ${photos.length} фотографий.`;
          }
        );
      }
      const load = () => {
        photosPanel.cancel();
        photosPanel.clear('Выберите альбом после загрузки каталога.');
        photosPanel.setStatus('idle', 'Альбом ещё не выбран.');
        return albumsPanel.run(
          (signal) => getList('/albums', signal),
          (albums) => {
            renderList(albumsPanel.results, albums, (album) => albumCard(album, () => showPhotos(album)));
            return `Успех. Загружено альбомов: ${albums.length}.`;
          }
        );
      };
      albumsPanel.controls.append(button('Обновить альбомы', load));
      load();
    }
  });

  Lab.register({
    id: 15, level: 2, title: 'Сортировка публикаций',
    description: 'Сортировка по ID и названию в обоих направлениях. Повторный запрос обновляет исходный список.',
    endpoint: '/posts',
    mount(root) {
      const p = panel(root);
      const sort = select([
        ['id-asc', 'ID: по возрастанию'], ['id-desc', 'ID: по убыванию'],
        ['title-asc', 'Название: А → Я'], ['title-desc', 'Название: Я → А']
      ], 'id-asc');
      sort.id = 'v15-sort';
      sort.disabled = true;
      let posts = [];
      function render() {
        const [key, direction] = sort.value.split('-');
        const sign = direction === 'asc' ? 1 : -1;
        const sorted = [...posts].sort((a, b) => sign * (key === 'id'
          ? Number(a.id) - Number(b.id)
          : String(a.title ?? '').localeCompare(String(b.title ?? ''), 'ru', { sensitivity: 'base' })));
        renderList(p.results, sorted, (post) => postCard(post));
        return `Успех. Отсортировано публикаций: ${sorted.length}.`;
      }
      const load = () => {
        sort.disabled = true;
        return p.run(
          (signal) => getList('/posts', signal),
          (items) => {
            posts = items;
            sort.disabled = false;
            return render();
          }
        );
      };
      sort.addEventListener('change', () => p.setStatus('success', render()));
      const reload = button('Повторить запрос', load);
      reload.id = 'v15-reload';
      p.controls.append(field('Порядок сортировки', sort), reload);
      load();
    }
  });
}());


/* Уровень 3. Повышенные варианты 16–20. */
(function registerAdvancedVariants() {
  'use strict';

  // 16. Сначала получаем задачи, затем считаем статистику и фильтруем в памяти.
  Lab.register({
    id: 16, level: 3, title: 'Дашборд задач',
    description: 'Статистика выполнения и фильтры по пользователю и состоянию задачи.',
    endpoint: '/todos',
    mount(root) {
      const panel = Lab.panel(root);
      const user = Lab.select([['all', 'Все пользователи']], 'all');
      const state = Lab.select([
        ['all', 'Все задачи'], ['done', 'Выполненные'], ['pending', 'Невыполненные']
      ], 'all');
      user.id = 'v16-user';
      state.id = 'v16-completion';
      user.disabled = true;
      state.disabled = true;
      const summary = Lab.el('div', 'stack dashboard-summary');
      panel.results.before(summary);
      let todos = [];

      function draw() {
        const selected = todos.filter(todo => user.value === 'all' || String(todo.userId) === user.value);
        const completed = selected.filter(todo => todo.completed === true).length;
        const pending = selected.length - completed;
        const visible = selected.filter(todo => state.value === 'all'
          || (state.value === 'done' && todo.completed === true)
          || (state.value === 'pending' && todo.completed !== true));
        summary.replaceChildren(Lab.stats([
          ['Всего задач', selected.length], ['Выполнено', completed], ['Осталось', pending]
        ]));
        const percent = selected.length ? Math.round(completed / selected.length * 100) : 0;
        const track = Lab.el('div', 'progress-track');
        const bar = Lab.el('div', 'progress-bar');
        bar.style.width = percent + '%';
        track.setAttribute('role', 'progressbar');
        track.setAttribute('aria-label', 'Доля выполненных задач');
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', '100');
        track.setAttribute('aria-valuenow', String(percent));
        track.append(bar);
        summary.append(track, Lab.el('p', 'muted',
          `Выполнено ${percent}%. Счётчики относятся к выбранному пользователю; фильтр состояния меняет список.`));
        Lab.renderList(panel.results, visible, Lab.todoCard, 'По выбранным фильтрам задач нет.');
        panel.setStatus('success', `Показано задач: ${visible.length} из ${selected.length}.`);
        return `Показано задач: ${visible.length} из ${selected.length}.`;
      }

      function load() {
        user.disabled = true;
        state.disabled = true;
        summary.replaceChildren();
        return panel.run(async signal => {
          const response = await Lab.request('/todos', {signal});
          return Lab.asArray(response.data);
        }, data => {
          todos = data;
          const oldUser = user.value;
          const ids = [...new Set(todos.map(todo => todo.userId))].sort((a, b) => a - b);
          user.replaceChildren();
          const all = Lab.el('option', '', 'Все пользователи');
          all.value = 'all';
          user.append(all);
          for (const id of ids) {
            const option = Lab.el('option', '', `Пользователь ${id}`);
            option.value = String(id);
            user.append(option);
          }
          user.value = ids.some(id => String(id) === oldUser) ? oldUser : 'all';
          user.disabled = false;
          state.disabled = false;
          return draw();
        });
      }

      panel.controls.append(
        Lab.button('Загрузить задачи', load),
        Lab.field('Пользователь', user), Lab.field('Состояние задачи', state)
      );
      user.addEventListener('change', draw);
      state.addEventListener('change', draw);
      Lab.empty(panel.results, 'Загрузите задачи, чтобы увидеть статистику.');
    }
  });

  // 17. Каждый следующий ресурс запрашивается после выбора родительского.
  Lab.register({
    id: 17, level: 3, title: 'Пользователь → публикации → комментарии',
    description: 'Последовательно выбирайте пользователя, публикацию и читайте её комментарии.',
    endpoint: '/users → /posts?userId=… → /posts/{id}/comments',
    mount(root) {
      const usersPanel = Lab.panel(root, '1. Пользователи');
      const postsPanel = Lab.panel(root, '2. Публикации пользователя');
      const commentsPanel = Lab.panel(root, '3. Комментарии публикации');
      usersPanel.box.dataset.stage = 'users';
      postsPanel.box.dataset.stage = 'posts';
      commentsPanel.box.dataset.stage = 'comments';
      const selectedUser = Lab.el('p', 'hint', 'Пользователь ещё не выбран.');
      const selectedPost = Lab.el('p', 'hint', 'Публикация ещё не выбрана.');
      postsPanel.controls.append(selectedUser);
      commentsPanel.controls.append(selectedPost);

      function resetComments() {
        commentsPanel.cancel();
        commentsPanel.clear('Выберите публикацию, чтобы загрузить комментарии.');
        commentsPanel.setStatus('idle', 'Ожидание выбора публикации.');
        selectedPost.textContent = 'Публикация ещё не выбрана.';
      }

      function choosePost(post) {
        commentsPanel.cancel();
        selectedPost.textContent = `Публикация №${post.id}: ${post.title}`;
        return commentsPanel.run(async signal => {
          const response = await Lab.request(`/posts/${Lab.positiveId(post.id)}/comments`, {signal});
          return Lab.asArray(response.data);
        }, comments => {
          Lab.renderList(commentsPanel.results, comments, Lab.commentCard, 'У публикации пока нет комментариев.');
          return `Комментарии к публикации №${post.id}: ${comments.length}.`;
        });
      }

      function chooseUser(user) {
        postsPanel.cancel();
        resetComments();
        selectedUser.textContent = `Выбран: ${user.name} (ID ${user.id}).`;
        return postsPanel.run(async signal => {
          const response = await Lab.request(`/posts?userId=${Lab.positiveId(user.id)}`, {signal});
          return Lab.asArray(response.data);
        }, posts => {
          Lab.renderList(postsPanel.results, posts,
            post => Lab.postCard(post, {onComments: () => choosePost(post)}),
            'У пользователя пока нет публикаций.');
          return `Публикаций пользователя ${user.name}: ${posts.length}.`;
        });
      }

      function loadUsers() {
        postsPanel.cancel();
        postsPanel.clear('Выберите пользователя, чтобы загрузить его публикации.');
        postsPanel.setStatus('idle', 'Ожидание выбора пользователя.');
        selectedUser.textContent = 'Пользователь ещё не выбран.';
        resetComments();
        return usersPanel.run(async signal => {
          const response = await Lab.request('/users', {signal});
          return Lab.asArray(response.data);
        }, users => {
          Lab.renderList(usersPanel.results, users, user => Lab.userCard(user, () => chooseUser(user)));
          return `Пользователей: ${users.length}. Выберите карточку.`;
        });
      }

      usersPanel.controls.append(Lab.button('Загрузить пользователей', loadUsers));
      Lab.empty(usersPanel.results, 'Загрузите пользователей, чтобы начать.');
      Lab.empty(postsPanel.results, 'Выберите пользователя, чтобы загрузить его публикации.');
      resetComments();
    }
  });

  // 18. Независимые запросы выполняются одновременно; результат ждём целиком.
  Lab.register({
    id: 18, level: 3, title: 'Параллельная загрузка',
    description: 'Promise.all() получает пользователей и публикации, затем подсчитывается число записей каждого автора.',
    endpoint: 'Promise.all([GET /users, GET /posts])',
    mount(root) {
      const panel = Lab.panel(root);
      panel.results.className = 'results stack';
      function load() {
        return panel.run(async signal => {
          const [usersResponse, postsResponse] = await Promise.all([
            Lab.request('/users', {signal}),
            Lab.request('/posts', {signal})
          ]);
          return {users: Lab.asArray(usersResponse.data), posts: Lab.asArray(postsResponse.data)};
        }, ({users, posts}) => {
          const counts = new Map();
          for (const post of posts) {
            counts.set(String(post.userId), (counts.get(String(post.userId)) || 0) + 1);
          }
          const table = Lab.el('table', 'data-table');
          table.id = 'v18-counts';
          table.append(Lab.el('caption', '', 'Число публикаций по пользователям'));
          const head = Lab.el('thead');
          const headRow = Lab.el('tr');
          for (const text of ['ID', 'Пользователь', 'Электронная почта', 'Публикаций']) {
            const th = Lab.el('th', '', text);
            th.scope = 'col';
            headRow.append(th);
          }
          head.append(headRow);
          const body = Lab.el('tbody');
          for (const user of users) {
            const row = Lab.el('tr');
            row.dataset.userId = String(user.id);
            for (const value of [user.id, user.name || 'Имя не указано', user.email || 'Не указана', counts.get(String(user.id)) || 0]) {
              row.append(Lab.el('td', '', String(value)));
            }
            body.append(row);
          }
          table.append(head, body);
          const wrap = Lab.el('div', 'table-wrap');
          wrap.append(table);
          panel.results.replaceChildren(
            Lab.stats([['Пользователей', users.length], ['Публикаций', posts.length], ['Параллельных запросов', 2]]),
            wrap
          );
          return `Загружено параллельно: ${users.length} пользователей и ${posts.length} публикаций.`;
        });
      }
      panel.controls.append(Lab.button('Загрузить параллельно', load));
      Lab.empty(panel.results, 'Нажмите кнопку: два запроса начнутся без ожидания друг друга.');
    }
  });

  // 19. Debounce снижает число запросов, AbortController отменяет устаревший поиск.
  Lab.register({
    id: 19, level: 3, title: 'Поиск с debounce и отменой',
    description: 'Запрос запускается через 400 мс после ввода. При следующем символе предыдущий запрос сразу отменяется.',
    endpoint: 'GET /posts · debounce 400 мс · AbortController',
    mount(root) {
      const panel = Lab.panel(root);
      const search = Lab.input('Например, sunt или qui', '', 'search');
      search.id = 'v19-search';
      let timer = null;
      let activeController = null;
      let revision = 0;

      function cancelSearch() {
        clearTimeout(timer);
        timer = null;
        revision += 1;
        if (activeController) activeController.abort();
        panel.cancel();
      }

      function runSearch() {
        cancelSearch();
        const currentRevision = revision;
        const query = search.value.trim().toLocaleLowerCase('ru');
        return panel.run(async signal => {
          // Отдельный контроллер делает отмену поиска явной и наглядной.
          const controller = new AbortController();
          activeController = controller;
          const cancelFromPanel = () => controller.abort();
          signal.addEventListener('abort', cancelFromPanel, {once: true});
          if (signal.aborted) controller.abort();
          try {
            const response = await Lab.request('/posts', {signal: controller.signal});
            if (revision !== currentRevision) throw new DOMException('Устаревший поиск', 'AbortError');
            const posts = Lab.asArray(response.data);
            // API возвращает свежий список; буквальное сравнение не трактует ввод как RegExp.
            return posts.filter(post => String(post.title || '').toLocaleLowerCase('ru').includes(query));
          } finally {
            signal.removeEventListener('abort', cancelFromPanel);
            if (activeController === controller) activeController = null;
          }
        }, posts => {
          Lab.renderList(panel.results, posts, post => Lab.postCard(post), 'Публикации с таким заголовком не найдены.');
          return query ? `По запросу «${query}» найдено: ${posts.length}.` : `Показаны все публикации: ${posts.length}.`;
        });
      }

      search.addEventListener('input', () => {
        // Отмена происходит сразу, а новый запрос — лишь после паузы ввода.
        cancelSearch();
        panel.clear('Ожидание завершения ввода…');
        panel.setStatus('idle', 'Ожидание паузы ввода: 400 мс…');
        timer = setTimeout(runSearch, 400);
      });
      search.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          runSearch();
        }
      });
      panel.controls.append(
        Lab.field('Поиск по заголовку', search),
        Lab.button('Найти', runSearch),
        Lab.button('Сбросить', () => {
          cancelSearch();
          search.value = '';
          panel.clear('Введите текст, чтобы начать поиск.');
          panel.setStatus('idle', 'Поиск сброшен.');
          search.focus();
        }, 'button secondary')
      );
      panel.controls.after(Lab.el('p', 'hint',
        'Каждый поиск делает GET /posts, затем проверяет заголовки. Пустой запрос показывает все записи. Для наблюдения отмены включите Slow 3G в DevTools → Network.'));
      Lab.empty(panel.results, 'Введите текст, чтобы начать поиск.');
      Lab.cleanup(cancelSearch);
    }
  });

  // 20. Сначала получаем альбомы, затем — выбранную страницу фотографий.
  Lab.register({
    id: 20, level: 3, title: 'Фотокаталог с пагинацией',
    description: 'Альбомы, страницы фотографий, обработка ошибок и текстовая замена недоступной миниатюры.',
    endpoint: '/albums → /photos?albumId=…&_page=…&_limit=…',
    mount(root) {
      const albumsPanel = Lab.panel(root, 'Альбомы');
      const photosPanel = Lab.panel(root, 'Фотографии');
      albumsPanel.box.dataset.stage = 'albums';
      photosPanel.box.dataset.stage = 'photos';
      const album = Lab.select([['', 'Сначала загрузите альбомы']], '');
      const limit = Lab.select([[6, '6 фотографий'], [12, '12 фотографий'], [24, '24 фотографии']], 12);
      album.id = 'v20-album';
      limit.id = 'v20-limit';
      album.disabled = true;
      limit.disabled = true;
      const pageLabel = Lab.el('span', 'muted', 'Страница ещё не загружена.');
      pageLabel.id = 'v20-page';
      const selectedAlbum = Lab.el('p', 'hint');
      let currentPage = 1;
      let total = null;
      let canNext = false;
      let ready = false;
      let loadRevision = 0;
      let albums = [];
      const previous = Lab.button('Назад', () => loadPhotos(currentPage - 1), 'button secondary');
      const next = Lab.button('Далее', () => loadPhotos(currentPage + 1), 'button secondary');
      previous.id = 'v20-prev';
      next.id = 'v20-next';
      previous.disabled = true;
      next.disabled = true;

      function updatePager() {
        previous.disabled = !ready || currentPage <= 1;
        next.disabled = !ready || !canNext;
        if (ready) {
          const pages = total === null ? '' : ` из ${Math.max(1, Math.ceil(total / Number(limit.value)))}`;
          pageLabel.textContent = `Страница ${currentPage}${pages}${total === null ? '' : ` · Всего фото: ${total}`}`;
        }
      }

      function loadPhotos(targetPage = 1) {
        const requestRevision = ++loadRevision;
        const chosenAlbum = album.value;
        const pageSize = Number(limit.value);
        ready = false;
        updatePager();
        pageLabel.textContent = `Загрузка страницы ${targetPage}…`;
        return photosPanel.run(async signal => {
          const albumId = Lab.positiveId(chosenAlbum);
          const requestedPage = Lab.positiveId(targetPage);
          const route = `/photos?albumId=${albumId}&_page=${requestedPage}&_limit=${pageSize}`;
          const response = await Lab.request(route, {signal});
          const photos = Lab.asArray(response.data);
          let hasNext;
          const knownTotal = Number.isFinite(response.total) && response.total >= 0 ? response.total : null;
          if (knownTotal !== null) {
            hasNext = requestedPage * pageSize < knownTotal;
          } else if (photos.length < pageSize) {
            hasNext = false;
          } else {
            // Если заголовок X-Total-Count не доступен по CORS, проверяем следующую страницу.
            const probe = await Lab.request(`/photos?albumId=${albumId}&_page=${requestedPage + 1}&_limit=${pageSize}`, {signal});
            hasNext = Lab.asArray(probe.data).length > 0;
          }
          return {photos, hasNext, knownTotal, requestedPage, albumId};
        }, ({photos, hasNext, knownTotal, requestedPage, albumId}) => {
          currentPage = requestedPage;
          total = knownTotal;
          canNext = hasNext;
          ready = true;
          const chosen = albums.find(item => String(item.id) === String(albumId));
          selectedAlbum.textContent = `Альбом №${albumId}${chosen ? ': ' + chosen.title : ''}`;
          Lab.renderList(photosPanel.results, photos, Lab.photoCard, 'В этом альбоме на выбранной странице фотографий нет.');
          updatePager();
          return `Альбом №${albumId}, страница ${requestedPage}: загружено ${photos.length} фотографий.`;
        }).then(success => {
          if (requestRevision === loadRevision && !success) {
            pageLabel.textContent = 'Страница не загружена. Используйте «Повторить».';
            updatePager();
          }
          return success;
        });
      }

      function loadAlbums() {
        loadRevision += 1;
        photosPanel.cancel();
        photosPanel.clear('Загрузите альбомы, затем выберите нужный.');
        photosPanel.setStatus('idle', 'Ожидание списка альбомов.');
        selectedAlbum.textContent = '';
        ready = false;
        updatePager();
        pageLabel.textContent = 'Страница ещё не загружена.';
        album.disabled = true;
        limit.disabled = true;
        return albumsPanel.run(async signal => {
          const response = await Lab.request('/albums', {signal});
          return Lab.asArray(response.data);
        }, data => {
          albums = data;
          album.replaceChildren();
          for (const item of albums) {
            const option = Lab.el('option', '', `${item.id}. ${item.title}`);
            option.value = String(item.id);
            album.append(option);
          }
          albumsPanel.results.replaceChildren(Lab.stats([['Доступно альбомов', albums.length]]));
          if (!albums.length) {
            Lab.empty(photosPanel.results, 'Сервер вернул пустой список альбомов.');
            return 'Альбомы не найдены.';
          }
          album.disabled = false;
          limit.disabled = false;
          album.value = String(albums[0].id);
          loadPhotos(1);
          return `Загружено альбомов: ${albums.length}. Выберите альбом ниже.`;
        });
      }

      albumsPanel.controls.append(Lab.button('Загрузить альбомы', loadAlbums));
      photosPanel.controls.append(Lab.field('Альбом', album), Lab.field('На странице', limit));
      photosPanel.controls.after(selectedAlbum);
      const pagination = Lab.el('div', 'pagination');
      pagination.append(previous, pageLabel, next);
      photosPanel.results.after(pagination);
      album.addEventListener('change', () => loadPhotos(1));
      limit.addEventListener('change', () => loadPhotos(1));
      Lab.empty(albumsPanel.results, 'Нажмите «Загрузить альбомы».');
      Lab.empty(photosPanel.results, 'Здесь появятся фотографии выбранного альбома.');
    }
  });
})();


/* Навигация по трём уровням и двадцати вариантам. */
(() => {
  'use strict';
  const levelNames = { 1: 'Базовый уровень', 2: 'Средний уровень', 3: 'Повышенный уровень' };
  const levelRanges = { 1: 'Варианты 01–07 · Основы Fetch', 2: 'Варианты 08–15 · Работа с данными', 3: 'Варианты 16–20 · Управление запросами' };
  let activeId = null;
  const previousIds = { 1: 1, 2: 8, 3: 16 };

  function renderNavigation(level) {
    const nav = document.querySelector('#variant-nav');
    nav.replaceChildren();
    document.querySelector('#level-description').textContent = levelRanges[level];
    for (const [id, variant] of Lab.variants) {
      if (variant.level !== level) continue;
      const entry = Lab.button('', () => { location.hash = `variant-${id}`; }, 'variant-button');
      entry.dataset.variant = String(id);
      entry.setAttribute('aria-current', String(id === activeId));
      entry.append(Lab.el('span', 'nav-number', String(id).padStart(2, '0')), Lab.el('span', '', variant.title));
      nav.append(entry);
    }
    document.querySelectorAll('[data-level]').forEach(node => node.setAttribute('aria-pressed', String(Number(node.dataset.level) === level)));
  }

  function showVariant() {
    const requested = Number(location.hash.match(/^#variant-(\d+)$/)?.[1] ?? 1);
    const id = Lab.variants.has(requested) ? requested : 1;
    if (id === activeId) return;
    Lab.dispose();
    activeId = id;
    const variant = Lab.variants.get(id);
    previousIds[variant.level] = id;
    const workspace = document.querySelector('#workspace');
    workspace.replaceChildren();
    document.querySelector('#level-tag').textContent = levelNames[variant.level];
    document.querySelector('#variant-tag').textContent = `Вариант ${String(id).padStart(2, '0')} из 20`;
    document.querySelector('#variant-title').textContent = variant.title;
    document.querySelector('#variant-description').textContent = variant.description;
    document.querySelector('#variant-endpoint').textContent = variant.endpoint;
    document.title = `№${id} ${variant.title} · Лабораторная 9`;
    renderNavigation(variant.level);
    const teardown = variant.mount(workspace);
    if (typeof teardown === 'function') Lab.cleanup(teardown);
  }

  document.querySelectorAll('[data-level]').forEach(node => {
    node.addEventListener('click', () => { location.hash = `variant-${previousIds[Number(node.dataset.level)]}`; });
  });
  window.addEventListener('hashchange', showVariant);
  window.addEventListener('pagehide', () => Lab.dispose());
  showVariant();
})();
