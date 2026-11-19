/*
 * Настройки сайта.
 * googleClientId — OAuth Client ID для хранения данных в Google Drive.
 * Это публичный идентификатор (не секрет): Google пускает с ним только сайты,
 * перечисленные в «Authorized JavaScript origins». Как получить — см. README.md.
 * Можно оставить пустым и ввести Client ID в «Настройки → Google Drive».
 *
 * bambuProxy — адрес вашего Cloudflare Worker (worker/bambu-proxy.js) для импорта
 * истории печати из Bambu Lab Cloud. Не секрет. Можно оставить пустым и ввести
 * в «Настройки → Bambu Lab Cloud». Инструкция — docs/bambu-cloud-setup.md.
 */
window.APP_CONFIG = {
  googleClientId: '984582520695-hsn10g8vof1lojvqc5l6k19hcqic1ukf.apps.googleusercontent.com',
  bambuProxy: 'https://bambu-proxy.protos5413.workers.dev',
};
