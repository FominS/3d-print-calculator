# Подключение Google Drive — пошагово

Нужно один раз получить **Client ID**: это «пропуск», по которому Google разрешает сайту `https://fomins.github.io` работать с вашим Google Drive. Это не пароль и не секрет. Займёт 10–15 минут.

Всё делается на https://console.cloud.google.com под тем Google-аккаунтом, на чей Drive будут сохраняться данные.

---

## Шаг 1. Создать проект

1. Откройте https://console.cloud.google.com.
2. Вверху слева, рядом с логотипом Google Cloud, — выпадающий список проектов. Нажмите на него → **New project** (Новый проект).
3. Project name: `3D Print Calculator`. Organization/Location оставьте как есть («No organization»).
4. **Create**. Подождите 10–20 секунд, затем в том же списке вверху **выберите созданный проект**: проверьте, что его имя показано вверху страницы. Все следующие шаги делаются внутри него.

## Шаг 2. Включить Google Drive API

1. В строке поиска вверху консоли введите `Google Drive API` и откройте результат с типом *Marketplace / API*.
   (или меню ☰ → **APIs & Services** → **Library** → найти «Google Drive API»)
2. Нажмите **Enable** (Включить). Должна открыться страница API со статусом «Enabled».

## Шаг 3. Настроить экран входа (Google Auth Platform)

Раньше этот раздел назывался «OAuth consent screen», теперь — **Google Auth Platform**. В нём слева пункты *Overview, Branding, Audience, Clients, Data Access*.

1. Меню ☰ → **APIs & Services** → **OAuth consent screen** (откроется Google Auth Platform)
   или поиск вверху: `Google Auth Platform`.
2. Если видите «Google Auth Platform not configured yet» — нажмите **Get started**. Откроется мастер из 4 шагов:
   1. **App Information**
      - App name: `3D Print Calculator`
      - User support email: выберите свой email из списка
      - **Next**
   2. **Audience** — выберите **External** (Внешний). *Internal* доступен только для организаций Google Workspace.
      - **Next**
   3. **Contact Information** — снова ваш email. **Next**
   4. **Finish** — поставьте галочку согласия с политикой Google API → **Continue** → **Create**.

### 3а. Добавить себя в тестовые пользователи — обязательно

Приложение создаётся в режиме **Testing**: входить в него могут только перечисленные тестовые пользователи. Без этого шага Google покажет ошибку `403: access_denied`.

1. Слева **Audience**.
2. Убедитесь, что *Publishing status* — **Testing**. Публиковать не нужно.
3. Ниже блок **Test users** → **+ Add users** → введите свой Gmail, на чей Drive будут сохраняться данные → **Save**.

### 3б. Data Access — можно пропустить

Сайт сам запрашивает доступ `drive.file` («только файлы, созданные этим приложением»). Для режима Testing добавлять его в *Data Access* не обязательно. Если хотите, чтобы он был виден в настройках: **Data Access** → **Add or remove scopes** → найдите `.../auth/drive.file` → отметьте → **Update** → **Save**.

## Шаг 4. Создать Client ID

1. Слева **Clients** → **+ Create client**.
2. **Application type**: **Web application**.
3. **Name**: любое, например `GitHub Pages`.
4. **Authorized JavaScript origins** → **+ Add URI** → введите ровно:
   ```
   https://fomins.github.io
   ```
   Важно:
   - **без** `/3d-print-calculator` и **без** `/` на конце — Google принимает только адрес сайта (схема + домен), без пути;
   - `https`, не `http`.

   Для проверки на своём компьютере можно добавить второй адрес: `http://localhost:8000`.
5. **Authorized redirect URIs** — **оставьте пустым**: сайт использует вход через всплывающее окно, перенаправление не нужно.
6. **Create**.
7. Появится окно с **Client ID** вида `1234567890-abcdef….apps.googleusercontent.com` — скопируйте его.
   Client secret сайту **не нужен** — его никуда не вписывайте. Client ID потом всегда можно посмотреть в **Clients**.

> Google предупреждает: изменения настроек могут вступить в силу через 5 минут — несколько часов. Если сразу после создания вход выдаёт ошибку, подождите 10–15 минут.

## Шаг 5. Вписать Client ID в сайт

Откройте в проекте файл `js/config.js` и вставьте Client ID:

```js
window.APP_CONFIG = {
  googleClientId: '1234567890-abcdef….apps.googleusercontent.com',
};
```

Затем `git commit` и `git push`, подождите 1–2 минуты, пока обновится GitHub Pages, и обновите страницу (Ctrl+F5). Client ID публичный, его можно хранить в репозитории: Google принимает его только с адресов из *Authorized JavaScript origins*.

## Шаг 6. Подключить

1. Сначала загрузите свои данные на сайт, если ещё не сделали: **Настройки → Выбрать папку** → папка `3D-print-calculator` (там лежит `3d-print-data.json`).
2. **Настройки → Подключить Google Drive**.
3. Откроется окно Google:
   - выберите аккаунт;
   - «**Google hasn't verified this app**» (приложение не проверено Google) — это нормально для режима Testing и своего же приложения: **Continue** (Продолжить);
   - разрешите доступ к файлам → **Continue**.
4. В настройках должно появиться «Google Drive — сохранено …», а в вашем Google Drive — папка **3D Print Calculator** с файлом `3d-print-data.json`.
5. Если до этого была подключена папка с фото — сайт предложит перенести фото в Drive.

На телефоне: откройте сайт и нажмите «Настройки → Подключить Google Drive» — данные подтянутся.

---

## Если что-то не так

| Что видите | Причина и решение |
|---|---|
| `Error 400: origin_mismatch` или `redirect_uri_mismatch` | Адрес сайта не совпадает с *Authorized JavaScript origins*. Проверьте: ровно `https://fomins.github.io`, без пути и слэша. Подождите 10–15 минут после изменения. |
| `Error 403: access_denied` / «app is currently being tested» | Ваш Gmail не добавлен в **Audience → Test users**. |
| `Error 401: invalid_client` | Client ID скопирован с ошибкой или удалён. Скопируйте заново из **Clients**. |
| «Google Drive 403: … has not been used in project … or it is disabled» | Не включён Google Drive API (шаг 2) или включён в другом проекте. |
| «Браузер заблокировал окно входа Google» | Разрешите всплывающие окна для `fomins.github.io` (значок в адресной строке) и нажмите кнопку ещё раз. |
| «Не задан Google Client ID» | Client ID не вписан в `js/config.js` или изменения ещё не опубликованы на GitHub Pages (шаг 5). |
| Ничего не происходит при нажатии | Страница открыта как файл (`file:///…`). Вход Google работает только с адреса сайта или `http://localhost`. |
| Через час просит войти снова | Так устроен вход Google для сайтов без сервера: доступ выдаётся на час. Нажмите «Войти в Google» — изменения, сделанные за это время, сохранятся. |
