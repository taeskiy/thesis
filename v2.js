require('dotenv').config();
const mysql = require('mysql');
const { Telegraf, Markup } = require('telegraf');
const LocalSession = require('telegraf-session-local');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const localSession = new LocalSession({ database: 'session_db.json' });

bot.use(localSession.middleware());

const pool = mysql.createPool({
  host: 'narynivq.beget.tech',
  user: 'narynivq_evion',
  password: 'Qwerty123',
  database: 'narynivq_evion',
});

const itemsPerRow = 3;
const itemsPerPage = 3;

function chunkArray(arr, chunkSize) {
  const result = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    result.push(arr.slice(i, i + chunkSize));
  }
  return result;
}

function getLocationMenuButtons(page) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query('SELECT * FROM ChargingStations', (error, results) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        const startIndex = page * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const slicedLocations = results.slice(startIndex, endIndex);

        const locationButtons = chunkArray(
          slicedLocations.map((location) => [
            Markup.button.callback(location.name, `location_${location.station_id}`)
          ]),
          itemsPerRow
        );

        const navigationButtons = [];

        if (page > 0) {
          navigationButtons.push(Markup.button.callback('Предыдущие станции ⏪', 'previous'));
        }

        if (endIndex < results.length) {
          navigationButtons.push(Markup.button.callback('Ещё станции ⏩', 'next'));
        }

        resolve([
          ...locationButtons.flat(),
          navigationButtons,
          [Markup.button.callback('Главное меню 📲', 'main_menu')],
        ]);
      });
    });
  });
}

function showMainMenu(ctx) {
  ctx.reply('Главное меню:', {
    reply_markup: {
      keyboard: [
        ['Локации 🗺️'],
        ['Контакты ☎️'],
        ['Режим работы 🕑'],
        ['Забронировать'],
      ],
      resize_keyboard: true,
    },
  });
}

function showLocationMenu(ctx, page) {
  getLocationMenuButtons(page)
    .then((buttons) => {
      const replyMarkup = {
        inline_keyboard: buttons,
      };

      if (ctx.update.callback_query) {
        ctx.editMessageReplyMarkup(replyMarkup)
          .catch((err) => {
            if (err.response.description !== 'Bad Request: message is not modified') {
              console.error(err);
            }
          });
      } else {
        ctx.reply('Выберите локацию:', { reply_markup: replyMarkup });
      }
    })
    .catch((err) => {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    });
}

function sendLocationAndStations(ctx, location) {
  const locationName = location.name;

  // Fetch stations and charger information within the selected location
  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      return;
    }

    connection.query(
      `SELECT Chargers.charger_id, ChargerTypes.name, ChargerTypes.wattage, ChargerTypes.country_of_origin
       FROM Chargers
       INNER JOIN ChargerTypes ON Chargers.charger_type_id = ChargerTypes.charger_type_id
       WHERE Chargers.station_id = ?`,
      [location.station_id],
      (error, results) => {
        connection.release();
        if (error) {
          console.error(error);
          ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
          return;
        }

        if (results.length === 0) {
          ctx.reply(`В выбранной локации (${locationName}) нет доступных станций.`);
          showLocationMenu(ctx, ctx.session.page);
          return;
        }

        let stationInfo = `Выбранная локация: ${locationName}\n\nСтанции:\n`;
        for (let i = 0; i < results.length; i++) {
          const station = results[i];
          const stationNumber = i + 1;
          const chargerName = station.name;
          const chargerWattage = station.wattage;
          const chargerCountry = station.country_of_origin;
          stationInfo += `${stationNumber}. Имя: ${chargerName} | Мощность: ${chargerWattage} кВт | Страна производства: ${chargerCountry}\n`;
        }

        ctx.reply(stationInfo)
          .then(() => {
            ctx.telegram.sendLocation(ctx.chat.id, location.latitude, location.longitude)
              .catch((err) => {
                console.error(err);
                ctx.reply('Произошла ошибка при отправке геолокации. Пожалуйста, попробуйте позже.');
              })
              .finally(() => {
                showLocationMenu(ctx, ctx.session.page);
              });
          })
          .catch((err) => {
            console.error(err);
            ctx.reply('Произошла ошибка при отправке информации о станциях. Пожалуйста, попробуйте позже.');
          });
      }
    );
  });
}

function isUserRegistered(userId) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      connection.query('SELECT * FROM Users WHERE telegram_id = ?', [userId], (error, results) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        resolve(results.length > 0);
      });
    });
  });
}

function registerUser(telegramId, username, name, phoneNumber) {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      const query = 'INSERT INTO Users (telegram_id, username, name, phone_number) VALUES (?, ?, ?, ?)';

      connection.query(query, [telegramId, username, name, phoneNumber], (error) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  });
}

function showReservationMenu(ctx) {
  const userId = ctx.from.id;

  // Check if user is already registered
  isUserRegistered(userId)
    .then((registered) => {
      if (registered) {
        // Logic to handle reservation process
        ctx.reply('Процесс бронирования будет добавлен в ближайшем будущем!');
      } else {
        ctx.reply('Пожалуйста, отправьте свой номер телефона:', {
          reply_markup: {
            keyboard: [
              [
                {
                  text: 'Отправить номер телефона',
                  request_contact: true,
                },
              ],
            ],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        });
      }
    })
    .catch((error) => {
      console.error(error);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
    });
}

bot.command('start', (ctx) => {
  showMainMenu(ctx);
});

bot.on('text', (ctx) => {
  const text = ctx.message.text;

  if (text === 'Локации 🗺️') {
    ctx.session.page = 0;
    showLocationMenu(ctx, 0);
  } else if (text === 'Главное меню 📲') {
    showMainMenu(ctx);
  } else if (text === 'Контакты ☎️') {
    ctx.reply('Контакты:\n\n+996 (500) 333-351\nevionkg@gmail.com\nhttps://evion.kg/about');
  } else if (text === 'Режим работы 🕑') {
    ctx.reply('11:00 до 23:00\nс 11:00 до 01:00 пт-сб\n\nПодробнее тут: https://evion.kg');
  } else if (text === 'Забронировать') {
    showReservationMenu(ctx);
  }
});

bot.action(/location_(.+)/, (ctx) => {
  const locationId = ctx.match[1];

  pool.getConnection((err, connection) => {
    if (err) {
      console.error(err);
      ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      return;
    }

    connection.query('SELECT * FROM ChargingStations WHERE station_id = ?', [locationId], (error, results) => {
      connection.release();
      if (error) {
        console.error(error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
        return;
      }

      if (results.length === 0) {
        ctx.reply('Выбранная локация не найдена.');
        return;
      }

      const location = results[0];
      ctx.reply(`Выбранная локация: ${location.name}`)
        .then(() => {
          sendLocationAndStations(ctx, location);
        })
        .catch((err) => {
          console.error(err);
          ctx.reply('Произошла ошибка при отправке локации. Пожалуйста, попробуйте позже.');
        });
    });
  });
});

bot.action('previous', (ctx) => {
  const currentPage = ctx.session.page || 0;
  const newPage = Math.max(currentPage - 1, 0);
  ctx.session.page = newPage;
  showLocationMenu(ctx, newPage);
});

bot.action('next', (ctx) => {
  const currentPage = ctx.session.page || 0;
  const newPage = currentPage + 1;
  ctx.session.page = newPage;
  showLocationMenu(ctx, newPage);
});

bot.on('contact', (ctx) => {
  const { user_id, username, first_name, last_name, phone_number } = ctx.message.contact;

  registerUser(user_id, username, `${first_name} ${last_name}`, phone_number)
    .then(() => {
      ctx.reply('Регистрация успешно выполнена!');
    })
    .catch((error) => {
      console.error(error);
      ctx.reply('Произошла ошибка при регистрации. Пожалуйста, попробуйте позже.');
    });
});

bot.launch();
