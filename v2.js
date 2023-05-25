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

      let query = 'SELECT DISTINCT ChargingStations.station_id, ChargingStations.name FROM ChargingStations';
      if (page !== null) {
        const startIndex = page * itemsPerPage;
        query += ` LIMIT ${startIndex}, ${itemsPerPage}`;
      }

      connection.query(query, (error, results) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        const locationButtons = results.map((location) => [
          Markup.button.callback(location.name, `location_${location.station_id}`)
        ]);

        const navigationButtons = [];

        if (page > 0) {
          navigationButtons.push(Markup.button.callback('Предыдущие станции ⏪', 'previous'));
        }

        if (results.length === itemsPerPage) {
          navigationButtons.push(Markup.button.callback('Ещё станции ⏩', 'next'));
        }

        resolve([
          ...locationButtons,
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

function getLocationsWithReservedValue() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
        return;
      }

      const query = `
        SELECT DISTINCT ChargingStations.station_id, ChargingStations.name
        FROM ChargingStations
        INNER JOIN Chargers ON ChargingStations.station_id = Chargers.station_id
        INNER JOIN Reservations ON Chargers.charger_id = Reservations.charger_id
      `;

      connection.query(query, (error, results) => {
        connection.release();
        if (error) {
          reject(error);
          return;
        }

        resolve(results);
      });
    });
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

function showReservationMenu(ctx) {
    const userId = ctx.from.id;
  
    isUserRegistered(userId)
      .then((registered) => {
        if (registered) {
          // Existing registered user
          // Your existing code for showing available reservations
        } else {
          // New user, send registration button with contacts card
          ctx.reply('Пожалуйста, поделитесь своим номером телефона.', {
            reply_markup: {
              keyboard: [
                [
                  {
                    text: 'Поделиться номером телефона',
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
  
  // Handle the contact information
  bot.on('contact', (ctx) => {
    const userId = ctx.from.id;
    const { phone_number, first_name, last_name } = ctx.message.contact;
  
    // Update the user's registration information in the database (if needed)
    isUserRegistered(userId)
      .then((registered) => {
        if (!registered) {
          // Perform the registration process (if necessary)
          pool.getConnection((err, connection) => {
            if (err) {
              console.error(err);
              ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
              return;
            }
  
            connection.query(
              'INSERT INTO Users (telegram_id, phone_number, first_name, last_name) VALUES (?, ?, ?, ?)',
              [userId, phone_number, first_name, last_name],
              (error, results) => {
                connection.release();
                if (error) {
                  console.error(error);
                  ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
                  return;
                }
  
                ctx.reply('Спасибо за регистрацию! Теперь вы можете использовать бронирование.');
              }
            );
          });
        } else {
          // User is already registered
          ctx.reply('Вы уже зарегистрированы. Можете использовать бронирование.');
        }
      })
      .catch((error) => {
        console.error(error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте позже.');
      });
  });
  

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

bot.launch();
